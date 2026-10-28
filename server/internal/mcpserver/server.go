package mcpserver

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/motion/server/internal/docagent"
	"github.com/motion/server/internal/model"
	"github.com/motion/server/internal/realtime"
	"github.com/motion/server/internal/store"
)

type Auth struct {
	UserID primitive.ObjectID
	Name   string
	Scopes map[string]bool
}

type authKey struct{}

func WithAuth(ctx context.Context, auth Auth) context.Context {
	return context.WithValue(ctx, authKey{}, auth)
}

func authFrom(ctx context.Context) (Auth, bool) {
	auth, ok := ctx.Value(authKey{}).(Auth)
	return auth, ok
}

func allowed(auth Auth, scope string) bool {
	return auth.Scopes["*"] || auth.Scopes[scope]
}

type Server struct {
	store   *store.Store
	hub     *realtime.Hub
	mcp     *mcp.Server
	handler http.Handler
}

func New(st *store.Store, hub *realtime.Hub) *Server {
	s := &Server{store: st, hub: hub}
	s.mcp = mcp.NewServer(&mcp.Implementation{
		Name: "motion", Version: "1.0.0",
		Title: "Motion documents",
	}, &mcp.ServerOptions{
		Instructions: "Motion is a document workspace. Use search_pages and read_page before editing. Prefer append_blocks over rewriting content. Deleting pages is destructive: delete_pages archives by default and only deletes permanently when permanent=true.",
	})
	s.registerTools()
	s.handler = mcp.NewStreamableHTTPHandler(func(*http.Request) *mcp.Server { return s.mcp }, nil)
	return s
}

func (s *Server) Handler() http.Handler {
	return s.handler
}

func toolResult(value any) (*mcp.CallToolResult, any, error) {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		return toolError(err.Error())
	}
	return &mcp.CallToolResult{Content: []mcp.Content{&mcp.TextContent{Text: string(data)}}}, nil, nil
}

func toolError(message string) (*mcp.CallToolResult, any, error) {
	return &mcp.CallToolResult{
		IsError: true,
		Content: []mcp.Content{&mcp.TextContent{Text: message}},
	}, nil, nil
}

func roleOf(workspace model.Workspace, userID primitive.ObjectID) string {
	if workspace.OwnerID == userID {
		return "owner"
	}
	for _, member := range workspace.Members {
		if member.UserID == userID {
			if member.Role == "viewer" {
				return "viewer"
			}
			return "editor"
		}
	}
	return ""
}

func (s *Server) workspaces(ctx context.Context, userID primitive.ObjectID) ([]model.Workspace, error) {
	cur, err := s.store.Workspaces.Find(ctx, bson.M{
		"$or": []bson.M{{"ownerId": userID}, {"members.userId": userID}},
	}, options.Find().SetSort(bson.D{{Key: "createdAt", Value: 1}}))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)
	var workspaces []model.Workspace
	if err := cur.All(ctx, &workspaces); err != nil {
		return nil, err
	}
	return workspaces, nil
}

func (s *Server) pageFor(ctx context.Context, userID primitive.ObjectID, pageID string) (model.Page, model.Workspace, string, error) {
	id, err := primitive.ObjectIDFromHex(strings.TrimSpace(pageID))
	if err != nil {
		return model.Page{}, model.Workspace{}, "", fmt.Errorf("invalid page id")
	}
	var page model.Page
	if err := s.store.Pages.FindOne(ctx, bson.M{"_id": id}).Decode(&page); err != nil {
		return model.Page{}, model.Workspace{}, "", fmt.Errorf("page not found")
	}
	var workspace model.Workspace
	if err := s.store.Workspaces.FindOne(ctx, bson.M{"_id": page.WorkspaceID}).Decode(&workspace); err != nil {
		return model.Page{}, model.Workspace{}, "", fmt.Errorf("workspace not found")
	}
	role := roleOf(workspace, userID)
	if role == "" {
		return model.Page{}, model.Workspace{}, "", fmt.Errorf("page not found")
	}
	return page, workspace, role, nil
}

func (s *Server) editor(auth Auth) map[string]string {
	return map[string]string{
		"userId": auth.UserID.Hex(), "name": auth.Name, "color": realtime.ColorFor(auth.UserID.Hex()),
	}
}

func (s *Server) broadcastBlocks(auth Auth, page model.Page, blocks []model.Block, now time.Time) {
	s.hub.Broadcast(page.ID.Hex(), map[string]any{
		"type": "blocks", "pageId": page.ID.Hex(), "blocks": blocks,
		"updatedAt": now, "editor": s.editor(auth),
	}, "")
}

func (s *Server) broadcastMeta(auth Auth, page model.Page) {
	s.hub.Broadcast(page.ID.Hex(), map[string]any{
		"type": "meta", "pageId": page.ID.Hex(),
		"page": map[string]any{
			"title": page.Title, "icon": page.Icon, "cover": page.Cover,
			"favorite": page.Favorite, "archived": page.Archived,
		},
		"editor": s.editor(auth),
	}, "")
}

func (s *Server) broadcastTree(workspaceID primitive.ObjectID) {
	s.hub.BroadcastWorkspace(workspaceID.Hex(), map[string]any{
		"type": "tree", "workspaceId": workspaceID.Hex(),
	}, "")
}

func (s *Server) snapshot(ctx context.Context, auth Auth, page model.Page) {
	_, _ = s.store.Revisions.InsertOne(ctx, model.PageRevision{
		ID: primitive.NewObjectID(), PageID: page.ID, WorkspaceID: page.WorkspaceID,
		Title: page.Title, Icon: page.Icon, Cover: page.Cover,
		Blocks:   append([]model.Block(nil), page.Blocks...),
		AuthorID: auth.UserID, AuthorName: auth.Name + " (MCP)", CreatedAt: time.Now().UTC(),
	})
}

type ListWorkspacesArgs struct{}

type WorkspaceView struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Icon      string `json:"icon"`
	Role      string `json:"role"`
	PageCount int    `json:"pageCount"`
}

func (s *Server) listWorkspaces(ctx context.Context, _ *mcp.CallToolRequest, _ ListWorkspacesArgs) (*mcp.CallToolResult, any, error) {
	auth, ok := authFrom(ctx)
	if !ok || !allowed(auth, "pages:read") {
		return toolError("missing pages:read scope")
	}
	workspaces, err := s.workspaces(ctx, auth.UserID)
	if err != nil {
		return toolError(err.Error())
	}
	out := make([]WorkspaceView, 0, len(workspaces))
	for _, workspace := range workspaces {
		count, _ := s.store.Pages.CountDocuments(ctx, bson.M{"workspaceId": workspace.ID, "archived": false})
		out = append(out, WorkspaceView{
			ID: workspace.ID.Hex(), Name: workspace.Name, Icon: workspace.Icon,
			Role: roleOf(workspace, auth.UserID), PageCount: int(count),
		})
	}
	return toolResult(map[string]any{"workspaces": out})
}

type SearchPagesArgs struct {
	Query       string `json:"query" jsonschema:"Words to search for. Leave empty to list recent pages."`
	WorkspaceID string `json:"workspaceId,omitempty" jsonschema:"Optional workspace id."`
	Limit       int    `json:"limit,omitempty" jsonschema:"Maximum results (1-50)."`
}

type PageHit struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Icon        string `json:"icon"`
	WorkspaceID string `json:"workspaceId"`
	UpdatedAt   string `json:"updatedAt"`
	Excerpt     string `json:"excerpt"`
}

func (s *Server) searchPages(ctx context.Context, _ *mcp.CallToolRequest, args SearchPagesArgs) (*mcp.CallToolResult, any, error) {
	auth, ok := authFrom(ctx)
	if !ok || !allowed(auth, "pages:read") {
		return toolError("missing pages:read scope")
	}
	workspaces, err := s.workspaces(ctx, auth.UserID)
	if err != nil {
		return toolError(err.Error())
	}
	ids := make([]primitive.ObjectID, 0, len(workspaces))
	for _, workspace := range workspaces {
		if args.WorkspaceID == "" || workspace.ID.Hex() == args.WorkspaceID {
			ids = append(ids, workspace.ID)
		}
	}
	if len(ids) == 0 {
		return toolError("workspace not found")
	}
	filter := bson.M{"workspaceId": bson.M{"$in": ids}, "archived": false}
	if query := strings.TrimSpace(args.Query); query != "" {
		pattern := primitive.Regex{Pattern: regexp.QuoteMeta(query), Options: "i"}
		filter["$or"] = []bson.M{{"title": pattern}, {"text": pattern}}
	}
	limit := args.Limit
	if limit <= 0 || limit > 50 {
		limit = 12
	}
	cur, err := s.store.Pages.Find(ctx, filter, options.Find().
		SetProjection(bson.M{"blocks": 0}).
		SetSort(bson.D{{Key: "updatedAt", Value: -1}}).
		SetLimit(int64(limit)))
	if err != nil {
		return toolError(err.Error())
	}
	defer cur.Close(ctx)
	var pages []model.Page
	if err := cur.All(ctx, &pages); err != nil {
		return toolError(err.Error())
	}
	results := make([]PageHit, 0, len(pages))
	for _, page := range pages {
		excerpt := strings.TrimSpace(page.Text)
		if len([]rune(excerpt)) > 180 {
			excerpt = string([]rune(excerpt)[:180]) + "…"
		}
		results = append(results, PageHit{
			ID: page.ID.Hex(), Title: page.Title, Icon: page.Icon,
			WorkspaceID: page.WorkspaceID.Hex(), UpdatedAt: page.UpdatedAt.Format(time.RFC3339),
			Excerpt: excerpt,
		})
	}
	return toolResult(map[string]any{"results": results})
}

type ReadPageArgs struct {
	PageID string `json:"pageId"`
}

func (s *Server) readPage(ctx context.Context, _ *mcp.CallToolRequest, args ReadPageArgs) (*mcp.CallToolResult, any, error) {
	auth, ok := authFrom(ctx)
	if !ok || !allowed(auth, "pages:read") {
		return toolError("missing pages:read scope")
	}
	page, _, _, err := s.pageFor(ctx, auth.UserID, args.PageID)
	if err != nil {
		return toolError(err.Error())
	}
	return toolResult(map[string]any{
		"id": page.ID.Hex(), "title": page.Title, "icon": page.Icon,
		"workspaceId": page.WorkspaceID.Hex(), "blocks": page.Blocks,
		"markdown": docagent.Markdown(page),
	})
}

type CreatePageArgs struct {
	WorkspaceID     string `json:"workspaceId,omitempty"`
	ParentID        string `json:"parentId,omitempty"`
	Title           string `json:"title"`
	ContentMarkdown string `json:"contentMarkdown,omitempty"`
}

func (s *Server) createPage(ctx context.Context, _ *mcp.CallToolRequest, args CreatePageArgs) (*mcp.CallToolResult, any, error) {
	auth, ok := authFrom(ctx)
	if !ok || !allowed(auth, "pages:write") {
		return toolError("missing pages:write scope")
	}
	workspaces, err := s.workspaces(ctx, auth.UserID)
	if err != nil {
		return toolError(err.Error())
	}
	var workspace model.Workspace
	for _, candidate := range workspaces {
		if args.WorkspaceID != "" && candidate.ID.Hex() != args.WorkspaceID {
			continue
		}
		if role := roleOf(candidate, auth.UserID); role == "owner" || role == "editor" {
			workspace = candidate
			break
		}
	}
	if workspace.ID.IsZero() {
		return toolError("no editable workspace found")
	}
	var parentID *primitive.ObjectID
	if strings.TrimSpace(args.ParentID) != "" {
		id, err := primitive.ObjectIDFromHex(args.ParentID)
		if err != nil {
			return toolError("invalid parent id")
		}
		if _, _, _, err := s.pageFor(ctx, auth.UserID, args.ParentID); err != nil {
			return toolError("parent page not found")
		}
		parentID = &id
	}
	title := strings.TrimSpace(args.Title)
	if title == "" {
		title = "Untitled"
	}
	blocks := docagent.ParseMarkdown(args.ContentMarkdown)
	order := float64(1024)
	filter := bson.M{"workspaceId": workspace.ID, "parentId": parentID}
	if parentID == nil {
		filter["parentId"] = nil
	}
	var last model.Page
	if err := s.store.Pages.FindOne(ctx, filter, options.FindOne().SetSort(bson.D{{Key: "order", Value: -1}})).Decode(&last); err == nil {
		order = last.Order + 1024
	}
	now := time.Now().UTC()
	page := model.Page{
		ID: primitive.NewObjectID(), WorkspaceID: workspace.ID, ParentID: parentID,
		Title: title, Icon: "📄", Blocks: blocks, Text: docagent.TextFromBlocks(blocks),
		Order: order, CreatedBy: auth.UserID, CreatedAt: now, UpdatedAt: now,
	}
	if _, err := s.store.Pages.InsertOne(ctx, page); err != nil {
		return toolError(err.Error())
	}
	s.broadcastTree(workspace.ID)
	s.snapshot(ctx, auth, page)
	return toolResult(map[string]any{"pageId": page.ID.Hex(), "title": page.Title, "workspaceId": workspace.ID.Hex()})
}

type BlockArg struct {
	Type        string           `json:"type" jsonschema:"paragraph, heading1, heading2, heading3, bulleted, numbered, todo, quote, callout, code, divider, image, table, diagram, bookmark, video, embed, file, equation, toc, gantt, chart, qrcode, barcode, toggle, toggleHeading1, toggleHeading2, toggleHeading3, pageLink, breadcrumb, columns, form or map"`
	Text        string           `json:"text,omitempty"`
	Checked     bool             `json:"checked,omitempty"`
	Language    string           `json:"language,omitempty"`
	Color       string           `json:"color,omitempty"`
	TextColor   string           `json:"textColor,omitempty"`
	BGColor     string           `json:"bgColor,omitempty"`
	Align       string           `json:"align,omitempty"`
	Width       string           `json:"width,omitempty"`
	URL         string           `json:"url,omitempty"`
	Caption     string           `json:"caption,omitempty"`
	Table       *model.TableData `json:"table,omitempty"`
	Form        *model.FormData  `json:"form,omitempty"`
	Map         *model.MapData   `json:"map,omitempty"`
	LineNumbers bool             `json:"lineNumbers,omitempty"`
	Indent      int              `json:"indent,omitempty"`
	Collapsed   bool             `json:"collapsed,omitempty"`
}

type AppendBlocksArgs struct {
	PageID string     `json:"pageId"`
	Blocks []BlockArg `json:"blocks"`
}

func (s *Server) appendBlocks(ctx context.Context, _ *mcp.CallToolRequest, args AppendBlocksArgs) (*mcp.CallToolResult, any, error) {
	auth, ok := authFrom(ctx)
	if !ok || !allowed(auth, "pages:write") {
		return toolError("missing pages:write scope")
	}
	page, _, role, err := s.pageFor(ctx, auth.UserID, args.PageID)
	if err != nil {
		return toolError(err.Error())
	}
	if role == "viewer" {
		return toolError("you only have view access")
	}
	if page.Locked {
		return toolError("page is locked; unlock it before editing")
	}
	if len(args.Blocks) == 0 {
		return toolError("no blocks provided")
	}
	allowedTypes := map[string]bool{
		"paragraph": true, "heading1": true, "heading2": true, "heading3": true,
		"bulleted": true, "numbered": true, "todo": true, "quote": true,
		"callout": true, "code": true, "divider": true, "image": true,
		"table": true, "diagram": true, "bookmark": true, "video": true,
		"embed": true, "file": true, "equation": true, "toc": true,
		"gantt": true, "chart": true, "qrcode": true, "barcode": true, "toggle": true,
		"toggleHeading1": true, "toggleHeading2": true, "toggleHeading3": true,
		"pageLink": true, "breadcrumb": true, "columns": true, "form": true,
	}
	now := time.Now().UTC()
	for _, input := range args.Blocks {
		if !allowedTypes[input.Type] {
			return toolError("unsupported block type: " + input.Type)
		}
		block := model.Block{
			ID: primitive.NewObjectID().Hex(), Type: input.Type, Text: input.Text,
			Checked: input.Checked, Language: input.Language, Color: input.Color,
			TextColor: input.TextColor, BGColor: input.BGColor, Align: input.Align, Width: input.Width,
			URL: input.URL, Caption: input.Caption, Table: input.Table, Form: input.Form, Map: input.Map,
			LineNumbers: input.LineNumbers,
			Indent:      input.Indent, Collapsed: input.Collapsed,
		}
		if block.Indent < 0 {
			block.Indent = 0
		}
		if block.Indent > 8 {
			block.Indent = 8
		}
		if block.Type == "code" && block.Language == "" {
			block.Language = "plain text"
		}
		if block.Type == "diagram" && strings.TrimSpace(block.Text) == "" {
			block.Text = "flowchart LR\n  Start --> Finish"
		}
		page.Blocks = append(page.Blocks, block)
	}
	if len(page.Blocks) > 2000 {
		return toolError("page has too many blocks")
	}
	if _, err := s.store.Pages.UpdateByID(ctx, page.ID, bson.M{"$set": bson.M{
		"blocks": page.Blocks, "text": docagent.TextFromBlocks(page.Blocks), "updatedAt": now,
	}}); err != nil {
		return toolError(err.Error())
	}
	s.broadcastBlocks(auth, page, page.Blocks, now)
	s.snapshot(ctx, auth, page)
	return toolResult(map[string]any{"pageId": page.ID.Hex(), "blockCount": len(page.Blocks), "updatedAt": now})
}

type UpdatePageArgs struct {
	PageID string `json:"pageId"`
	Title  string `json:"title,omitempty"`
	Icon   string `json:"icon,omitempty"`
}

func (s *Server) updatePage(ctx context.Context, _ *mcp.CallToolRequest, args UpdatePageArgs) (*mcp.CallToolResult, any, error) {
	auth, ok := authFrom(ctx)
	if !ok || !allowed(auth, "pages:write") {
		return toolError("missing pages:write scope")
	}
	page, _, role, err := s.pageFor(ctx, auth.UserID, args.PageID)
	if err != nil {
		return toolError(err.Error())
	}
	if role == "viewer" {
		return toolError("you only have view access")
	}
	if page.Locked {
		return toolError("page is locked; unlock it before editing")
	}
	updates := bson.M{"updatedAt": time.Now().UTC()}
	if title := strings.TrimSpace(args.Title); title != "" {
		page.Title = title
		updates["title"] = title
	}
	if icon := strings.TrimSpace(args.Icon); icon != "" {
		page.Icon = icon
		updates["icon"] = icon
	}
	if _, err := s.store.Pages.UpdateByID(ctx, page.ID, bson.M{"$set": updates}); err != nil {
		return toolError(err.Error())
	}
	s.broadcastMeta(auth, page)
	s.broadcastTree(page.WorkspaceID)
	s.snapshot(ctx, auth, page)
	return toolResult(map[string]any{"pageId": page.ID.Hex(), "title": page.Title, "icon": page.Icon})
}

type UpdateBlockArgs struct {
	PageID  string `json:"pageId"`
	BlockID string `json:"blockId"`
	Text    string `json:"text"`
}

func (s *Server) updateBlock(ctx context.Context, _ *mcp.CallToolRequest, args UpdateBlockArgs) (*mcp.CallToolResult, any, error) {
	auth, ok := authFrom(ctx)
	if !ok || !allowed(auth, "pages:write") {
		return toolError("missing pages:write scope")
	}
	page, _, role, err := s.pageFor(ctx, auth.UserID, args.PageID)
	if err != nil {
		return toolError(err.Error())
	}
	if role == "viewer" {
		return toolError("you only have view access")
	}
	if page.Locked {
		return toolError("page is locked; unlock it before editing")
	}
	found := false
	for i := range page.Blocks {
		if page.Blocks[i].ID == args.BlockID {
			page.Blocks[i].Text = args.Text
			page.Blocks[i].Rich = ""
			found = true
			break
		}
	}
	if !found {
		return toolError("block not found")
	}
	now := time.Now().UTC()
	if _, err := s.store.Pages.UpdateByID(ctx, page.ID, bson.M{"$set": bson.M{
		"blocks": page.Blocks, "text": docagent.TextFromBlocks(page.Blocks), "updatedAt": now,
	}}); err != nil {
		return toolError(err.Error())
	}
	s.broadcastBlocks(auth, page, page.Blocks, now)
	s.snapshot(ctx, auth, page)
	return toolResult(map[string]any{"pageId": page.ID.Hex(), "blockId": args.BlockID})
}

type AddCommentArgs struct {
	PageID  string `json:"pageId"`
	BlockID string `json:"blockId"`
	Quote   string `json:"quote,omitempty"`
	Body    string `json:"body"`
}

func (s *Server) addComment(ctx context.Context, _ *mcp.CallToolRequest, args AddCommentArgs) (*mcp.CallToolResult, any, error) {
	auth, ok := authFrom(ctx)
	if !ok || !allowed(auth, "pages:write") {
		return toolError("missing pages:write scope")
	}
	page, _, role, err := s.pageFor(ctx, auth.UserID, args.PageID)
	if err != nil {
		return toolError(err.Error())
	}
	if role == "viewer" {
		return toolError("you only have view access")
	}
	if page.Locked {
		return toolError("page is locked; unlock it before editing")
	}
	if strings.TrimSpace(args.Body) == "" {
		return toolError("comment body is required")
	}
	exists := false
	for _, block := range page.Blocks {
		if block.ID == args.BlockID {
			exists = true
			break
		}
	}
	if !exists {
		return toolError("block not found")
	}
	now := time.Now().UTC()
	comment := model.Comment{
		ID: primitive.NewObjectID(), PageID: page.ID, WorkspaceID: page.WorkspaceID,
		BlockID: args.BlockID, Quote: strings.TrimSpace(args.Quote), Body: strings.TrimSpace(args.Body),
		AuthorID: auth.UserID, AuthorName: auth.Name, CreatedAt: now, UpdatedAt: now,
	}
	if _, err := s.store.Comments.InsertOne(ctx, comment); err != nil {
		return toolError(err.Error())
	}
	s.hub.Broadcast(page.ID.Hex(), map[string]any{
		"type": "comments", "pageId": page.ID.Hex(), "action": "created",
	}, "")
	return toolResult(map[string]any{"commentId": comment.ID.Hex()})
}

type DeletePagesArgs struct {
	PageIDs   []string `json:"pageIds" jsonschema:"Page ids to delete. Accepts up to 100 root pages per call."`
	Mode      string   `json:"mode,omitempty" jsonschema:"subtree (default) deletes descendants too; page deletes only the listed pages."`
	Permanent bool     `json:"permanent,omitempty" jsonschema:"Permanently delete instead of moving pages to Trash. This cannot be undone."`
}

// descendantIDs returns every page below rootID in the same workspace.
func (s *Server) descendantIDs(ctx context.Context, workspaceID, rootID primitive.ObjectID) (map[primitive.ObjectID]bool, error) {
	cur, err := s.store.Pages.Find(ctx, bson.M{"workspaceId": workspaceID},
		options.Find().SetProjection(bson.M{"parentId": 1}))
	if err != nil {
		return nil, err
	}
	defer cur.Close(ctx)

	var all []struct {
		ID       primitive.ObjectID  `bson:"_id"`
		ParentID *primitive.ObjectID `bson:"parentId"`
	}
	if err := cur.All(ctx, &all); err != nil {
		return nil, err
	}
	children := make(map[primitive.ObjectID][]primitive.ObjectID, len(all))
	for _, page := range all {
		if page.ParentID != nil {
			children[*page.ParentID] = append(children[*page.ParentID], page.ID)
		}
	}
	found := map[primitive.ObjectID]bool{}
	queue := []primitive.ObjectID{rootID}
	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		for _, child := range children[current] {
			if !found[child] {
				found[child] = true
				queue = append(queue, child)
			}
		}
	}
	return found, nil
}

type DeletePageArgs struct {
	PageID    string `json:"pageId" jsonschema:"Page id to delete."`
	Permanent bool   `json:"permanent,omitempty" jsonschema:"Permanently delete instead of moving to Trash."`
}

func (s *Server) deletePage(ctx context.Context, req *mcp.CallToolRequest, args DeletePageArgs) (*mcp.CallToolResult, any, error) {
	return s.deletePages(ctx, req, DeletePagesArgs{
		PageIDs: []string{args.PageID}, Mode: "subtree", Permanent: args.Permanent,
	})
}

// deletePages batch-deletes page subtrees. It validates every root page first so
// a typo in one id cannot leave a half-applied batch behind.
func (s *Server) deletePages(ctx context.Context, _ *mcp.CallToolRequest, args DeletePagesArgs) (*mcp.CallToolResult, any, error) {
	auth, ok := authFrom(ctx)
	if !ok || !allowed(auth, "pages:write") {
		return toolError("missing pages:write scope")
	}
	if len(args.PageIDs) == 0 {
		return toolError("no page ids provided")
	}
	if len(args.PageIDs) > 100 {
		return toolError("too many page ids (maximum 100 per call)")
	}
	mode := strings.ToLower(strings.TrimSpace(args.Mode))
	if mode == "" {
		mode = "subtree"
	}
	if mode != "subtree" && mode != "page" {
		return toolError("mode must be subtree or page")
	}

	seen := map[string]bool{}
	roots := make([]model.Page, 0, len(args.PageIDs))
	for _, raw := range args.PageIDs {
		id := strings.TrimSpace(raw)
		if id == "" || seen[id] {
			continue
		}
		seen[id] = true
		page, _, role, err := s.pageFor(ctx, auth.UserID, id)
		if err != nil {
			return toolError(fmt.Sprintf("page %s: %v", id, err))
		}
		if role == "viewer" {
			return toolError(fmt.Sprintf("page %s: you only have view access", id))
		}
		if page.Locked {
			return toolError(fmt.Sprintf("page %s: page is locked", id))
		}
		roots = append(roots, page)
	}
	if len(roots) == 0 {
		return toolError("no valid page ids provided")
	}

	ids := make(map[primitive.ObjectID]bool, len(roots))
	workspaces := make(map[primitive.ObjectID]bool, 1)
	for _, root := range roots {
		workspaces[root.WorkspaceID] = true
		ids[root.ID] = true
		if mode == "subtree" {
			descendants, err := s.descendantIDs(ctx, root.WorkspaceID, root.ID)
			if err != nil {
				return toolError(err.Error())
			}
			for id := range descendants {
				ids[id] = true
			}
		}
	}
	list := make([]primitive.ObjectID, 0, len(ids))
	for id := range ids {
		list = append(list, id)
	}

	now := time.Now().UTC()
	action := "archived"
	if args.Permanent {
		action = "deleted"
		if _, err := s.store.Pages.DeleteMany(ctx, bson.M{"_id": bson.M{"$in": list}}); err != nil {
			return toolError("could not delete pages: " + err.Error())
		}
		related := bson.M{"pageId": bson.M{"$in": list}}
		_, _ = s.store.Revisions.DeleteMany(ctx, related)
		_, _ = s.store.Comments.DeleteMany(ctx, related)
		_, _ = s.store.FormSubmissions.DeleteMany(ctx, related)
		_, _ = s.store.Proposals.DeleteMany(ctx, related)
		for _, root := range roots {
			s.hub.Broadcast(root.ID.Hex(), map[string]any{
				"type": "deleted", "pageId": root.ID.Hex(),
			}, "")
		}
	} else {
		if _, err := s.store.Pages.UpdateMany(ctx, bson.M{"_id": bson.M{"$in": list}}, bson.M{
			"$set": bson.M{"archived": true, "archivedAt": now, "updatedAt": now},
		}); err != nil {
			return toolError("could not archive pages: " + err.Error())
		}
		for _, root := range roots {
			root.Archived = true
			s.broadcastMeta(auth, root)
		}
	}
	for workspaceID := range workspaces {
		s.broadcastTree(workspaceID)
	}

	rootIDs := make([]string, 0, len(roots))
	for _, root := range roots {
		rootIDs = append(rootIDs, root.ID.Hex())
	}
	return toolResult(map[string]any{
		"action": action, "permanent": args.Permanent, "mode": mode,
		"rootCount": len(roots), "pageCount": len(list), "pageIds": rootIDs,
	})
}

func (s *Server) registerTools() {
	mcp.AddTool(s.mcp, &mcp.Tool{Name: "list_workspaces", Description: "List workspaces and the current user's role."}, s.listWorkspaces)
	mcp.AddTool(s.mcp, &mcp.Tool{Name: "search_pages", Description: "Search page titles and content, or list recent pages."}, s.searchPages)
	mcp.AddTool(s.mcp, &mcp.Tool{Name: "read_page", Description: "Read a page with its blocks and Markdown."}, s.readPage)
	mcp.AddTool(s.mcp, &mcp.Tool{Name: "create_page", Description: "Create a page from Markdown in a workspace."}, s.createPage)
	mcp.AddTool(s.mcp, &mcp.Tool{Name: "append_blocks", Description: "Append paragraphs, headings, lists, tasks, tables or diagrams to a page."}, s.appendBlocks)
	mcp.AddTool(s.mcp, &mcp.Tool{Name: "update_page", Description: "Update a page title or emoji icon."}, s.updatePage)
	mcp.AddTool(s.mcp, &mcp.Tool{Name: "update_block", Description: "Replace the text of a block."}, s.updateBlock)
	mcp.AddTool(s.mcp, &mcp.Tool{Name: "delete_page", Description: "Move a page to Trash, or permanently delete it and its descendants."}, s.deletePage)
	mcp.AddTool(s.mcp, &mcp.Tool{Name: "delete_pages", Description: "Batch move pages to Trash or permanently delete them, optionally including descendants."}, s.deletePages)
	mcp.AddTool(s.mcp, &mcp.Tool{Name: "add_comment", Description: "Add a comment to a page block."}, s.addComment)
}
