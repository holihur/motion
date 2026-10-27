package docagent

import (
	"context"
	"fmt"
	"regexp"
	"strconv"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
	"google.golang.org/adk/agent"
	"google.golang.org/adk/agent/llmagent"
	adkmodel "google.golang.org/adk/model"
	"google.golang.org/adk/model/gemini"
	"google.golang.org/adk/runner"
	"google.golang.org/adk/session"
	"google.golang.org/adk/tool"
	"google.golang.org/adk/tool/functiontool"
	"google.golang.org/genai"

	"github.com/motion/server/internal/model"
	"github.com/motion/server/internal/openaimodel"
	"github.com/motion/server/internal/realtime"
	"github.com/motion/server/internal/store"
)

type ChatMessage struct {
	Role    string `json:"role"`
	Content string `json:"content"`
}

type TouchedPage struct {
	Before  *model.Page
	After   model.Page
	Created bool
}

type Runner struct {
	Store        *store.Store
	Hub          *realtime.Hub
	User         model.User
	Key          string
	ModelName    string
	Provider     string
	BaseURL      string
	Scopes       map[string]bool
	Actions      []string
	TrackChanges bool
	Touched      map[string]*TouchedPage
}

func copyPage(page model.Page) model.Page {
	page.Blocks = append([]model.Block(nil), page.Blocks...)
	return page
}

func (r *Runner) trackBefore(page model.Page) {
	if !r.TrackChanges {
		return
	}
	if r.Touched == nil {
		r.Touched = map[string]*TouchedPage{}
	}
	id := page.ID.Hex()
	if entry, ok := r.Touched[id]; ok {
		if entry.Before == nil {
			before := copyPage(page)
			entry.Before = &before
		}
		return
	}
	before := copyPage(page)
	r.Touched[id] = &TouchedPage{Before: &before}
}

func (r *Runner) trackAfter(page model.Page) {
	if !r.TrackChanges {
		return
	}
	if r.Touched == nil {
		r.Touched = map[string]*TouchedPage{}
	}
	entry := r.Touched[page.ID.Hex()]
	if entry == nil {
		entry = &TouchedPage{}
		r.Touched[page.ID.Hex()] = entry
	}
	entry.After = copyPage(page)
}

func (r *Runner) trackCreated(page model.Page) {
	if !r.TrackChanges {
		return
	}
	if r.Touched == nil {
		r.Touched = map[string]*TouchedPage{}
	}
	r.Touched[page.ID.Hex()] = &TouchedPage{After: copyPage(page), Created: true}
}

// FindAgentsPage returns the workspace's AGENTS.md instructions page.
func FindAgentsPage(ctx context.Context, st *store.Store, workspaceID primitive.ObjectID) (model.Page, bool) {
	var page model.Page
	err := st.Pages.FindOne(ctx, bson.M{
		"workspaceId": workspaceID,
		"archived":    false,
		"title":       primitive.Regex{Pattern: `^agents\.md$`, Options: "i"},
	}, options.FindOne().SetSort(bson.D{{Key: "updatedAt", Value: -1}})).Decode(&page)
	return page, err == nil
}

func (r *Runner) allowed(scope string) bool {
	return r.Scopes["*"] || r.Scopes[scope]
}

func (r *Runner) record(action string) {
	r.Actions = append(r.Actions, action)
}

func (r *Runner) workspaceList(ctx context.Context) ([]model.Workspace, error) {
	cur, err := r.Store.Workspaces.Find(ctx, bson.M{
		"$or": []bson.M{{"ownerId": r.User.ID}, {"members.userId": r.User.ID}},
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

func (r *Runner) pageFor(ctx context.Context, pageID string) (model.Page, model.Workspace, string, error) {
	id, err := primitive.ObjectIDFromHex(strings.TrimSpace(pageID))
	if err != nil {
		return model.Page{}, model.Workspace{}, "", fmt.Errorf("invalid page id")
	}
	var page model.Page
	if err := r.Store.Pages.FindOne(ctx, bson.M{"_id": id}).Decode(&page); err != nil {
		return model.Page{}, model.Workspace{}, "", fmt.Errorf("page not found")
	}
	var workspace model.Workspace
	if err := r.Store.Workspaces.FindOne(ctx, bson.M{"_id": page.WorkspaceID}).Decode(&workspace); err != nil {
		return model.Page{}, model.Workspace{}, "", fmt.Errorf("workspace not found")
	}
	role := roleOf(workspace, r.User.ID)
	if role == "" {
		return model.Page{}, model.Workspace{}, "", fmt.Errorf("you do not have access to this page")
	}
	return page, workspace, role, nil
}

func (r *Runner) editorInfo() map[string]string {
	return map[string]string{
		"userId": r.User.ID.Hex(), "name": r.User.Name, "color": realtime.ColorFor(r.User.ID.Hex()),
	}
}

func (r *Runner) broadcastTree(workspaceID primitive.ObjectID) {
	r.Hub.BroadcastWorkspace(workspaceID.Hex(), map[string]any{
		"type": "tree", "workspaceId": workspaceID.Hex(),
	}, "")
}

func (r *Runner) broadcastBlocks(page model.Page, blocks []model.Block, now time.Time) {
	r.Hub.Broadcast(page.ID.Hex(), map[string]any{
		"type": "blocks", "pageId": page.ID.Hex(), "blocks": blocks,
		"updatedAt": now, "editor": r.editorInfo(),
	}, "")
}

func (r *Runner) broadcastMeta(page model.Page) {
	r.Hub.Broadcast(page.ID.Hex(), map[string]any{
		"type": "meta", "pageId": page.ID.Hex(),
		"page": map[string]any{
			"title": page.Title, "icon": page.Icon, "cover": page.Cover,
			"favorite": page.Favorite, "archived": page.Archived,
		},
		"editor": r.editorInfo(),
	}, "")
}

func (r *Runner) snapshot(ctx context.Context, page model.Page) {
	revision := model.PageRevision{
		ID: primitive.NewObjectID(), PageID: page.ID, WorkspaceID: page.WorkspaceID,
		Title: page.Title, Icon: page.Icon, Cover: page.Cover,
		Blocks:   append([]model.Block(nil), page.Blocks...),
		AuthorID: r.User.ID, AuthorName: r.User.Name + " (AI)", CreatedAt: time.Now().UTC(),
	}
	_, _ = r.Store.Revisions.InsertOne(ctx, revision)
}

func textFromBlocks(blocks []model.Block) string {
	parts := make([]string, 0, len(blocks)*2)
	for _, block := range blocks {
		parts = append(parts, strings.ToLower(block.Text))
		if block.Table != nil {
			parts = append(parts, strings.ToLower(strings.Join(block.Table.Columns, " ")))
			for _, row := range block.Table.Rows {
				parts = append(parts, strings.ToLower(strings.Join(row, " ")))
			}
		}
	}
	return strings.Join(parts, "\n")
}

func markdownFor(page model.Page) string {
	var builder strings.Builder
	builder.WriteString("# " + strings.TrimSpace(page.Title) + "\n\n")
	for _, block := range page.Blocks {
		switch block.Type {
		case "heading1":
			builder.WriteString("# " + block.Text + "\n\n")
		case "heading2":
			builder.WriteString("## " + block.Text + "\n\n")
		case "heading3":
			builder.WriteString("### " + block.Text + "\n\n")
		case "bulleted":
			builder.WriteString("- " + block.Text + "\n")
		case "numbered":
			builder.WriteString("1. " + block.Text + "\n")
		case "todo":
			check := " "
			if block.Checked {
				check = "x"
			}
			builder.WriteString("- [" + check + "] " + block.Text + "\n")
		case "quote":
			builder.WriteString("> " + block.Text + "\n\n")
		case "callout":
			builder.WriteString("> 💡 " + block.Text + "\n\n")
		case "code":
			builder.WriteString("```" + block.Language + "\n" + block.Text + "\n```\n\n")
		case "diagram":
			builder.WriteString("```mermaid\n" + block.Text + "\n```\n\n")
		case "table":
			if block.Table != nil {
				builder.WriteString("| " + strings.Join(block.Table.Columns, " | ") + " |\n")
				builder.WriteString("| " + strings.Repeat("--- | ", len(block.Table.Columns)) + "\n")
				for _, row := range block.Table.Rows {
					builder.WriteString("| " + strings.Join(row, " | ") + " |\n")
				}
				builder.WriteString("\n")
			}
		case "divider":
			builder.WriteString("---\n\n")
		case "image":
			builder.WriteString("![image](" + block.URL + ")\n\n")
		case "bookmark", "video", "embed", "file":
			label := strings.TrimSpace(block.Text)
			if label == "" {
				label = block.URL
			}
			builder.WriteString("[" + label + "](" + block.URL + ")\n\n")
		case "equation":
			builder.WriteString("$$\n" + block.Text + "\n$$\n\n")
		case "toc":
			builder.WriteString("**Table of contents**\n\n")
		case "gantt", "chart":
			if block.Text != "" {
				builder.WriteString("**" + block.Text + "**\n\n")
			}
			if block.Table != nil {
				builder.WriteString("| " + strings.Join(block.Table.Columns, " | ") + " |\n")
				builder.WriteString("| " + strings.Repeat("--- | ", len(block.Table.Columns)) + "\n")
				for _, row := range block.Table.Rows {
					builder.WriteString("| " + strings.Join(row, " | ") + " |\n")
				}
				builder.WriteString("\n")
			}
		case "password":
			builder.WriteString("🔒 " + block.Text + "\n\n")
		default:
			builder.WriteString(block.Text + "\n\n")
		}
	}
	return builder.String()
}

func parseMarkdown(markdown string) []model.Block {
	lines := strings.Split(strings.ReplaceAll(markdown, "\r\n", "\n"), "\n")
	blocks := make([]model.Block, 0, len(lines))
	inCode := false
	codeLanguage := "plain text"
	var codeLines []string
	flushCode := func() {
		text := strings.Join(codeLines, "\n")
		if strings.TrimSpace(text) != "" {
			blocks = append(blocks, model.Block{ID: primitive.NewObjectID().Hex(), Type: "code", Text: text, Language: codeLanguage})
		}
		codeLines = nil
		codeLanguage = "plain text"
	}
	numbered := regexp.MustCompile(`^(\d+)\.\s+(.*)$`)
	for _, raw := range lines {
		trimmed := strings.TrimSpace(raw)
		if strings.HasPrefix(trimmed, "```") {
			if inCode {
				inCode = false
				flushCode()
			} else {
				inCode = true
				codeLanguage = strings.TrimSpace(strings.TrimPrefix(trimmed, "```"))
				if codeLanguage == "" {
					codeLanguage = "plain text"
				}
			}
			continue
		}
		if inCode {
			codeLines = append(codeLines, raw)
			continue
		}
		line := strings.TrimRight(raw, " ")
		switch {
		case strings.HasPrefix(line, "### "):
			blocks = append(blocks, model.Block{ID: primitive.NewObjectID().Hex(), Type: "heading3", Text: strings.TrimSpace(line[4:])})
		case strings.HasPrefix(line, "## "):
			blocks = append(blocks, model.Block{ID: primitive.NewObjectID().Hex(), Type: "heading2", Text: strings.TrimSpace(line[3:])})
		case strings.HasPrefix(line, "# "):
			blocks = append(blocks, model.Block{ID: primitive.NewObjectID().Hex(), Type: "heading1", Text: strings.TrimSpace(line[2:])})
		case strings.HasPrefix(line, "- [ ] "):
			blocks = append(blocks, model.Block{ID: primitive.NewObjectID().Hex(), Type: "todo", Text: strings.TrimSpace(line[6:])})
		case strings.HasPrefix(line, "- [x] "), strings.HasPrefix(line, "- [X] "):
			blocks = append(blocks, model.Block{ID: primitive.NewObjectID().Hex(), Type: "todo", Text: strings.TrimSpace(line[6:]), Checked: true})
		case strings.HasPrefix(line, "- "), strings.HasPrefix(line, "* "):
			blocks = append(blocks, model.Block{ID: primitive.NewObjectID().Hex(), Type: "bulleted", Text: strings.TrimSpace(line[2:])})
		case strings.HasPrefix(line, "> "):
			blocks = append(blocks, model.Block{ID: primitive.NewObjectID().Hex(), Type: "quote", Text: strings.TrimSpace(line[2:])})
		case line == "---":
			blocks = append(blocks, model.Block{ID: primitive.NewObjectID().Hex(), Type: "divider"})
		case trimmed == "":
			continue
		default:
			if match := numbered.FindStringSubmatch(line); match != nil {
				blocks = append(blocks, model.Block{ID: primitive.NewObjectID().Hex(), Type: "numbered", Text: strings.TrimSpace(match[2])})
			} else {
				blocks = append(blocks, model.Block{ID: primitive.NewObjectID().Hex(), Type: "paragraph", Text: strings.TrimSpace(line)})
			}
		}
	}
	if inCode {
		flushCode()
	}
	if len(blocks) == 0 {
		blocks = append(blocks, model.Block{ID: primitive.NewObjectID().Hex(), Type: "paragraph", Text: ""})
	}
	return blocks
}

type listWorkspacesInput struct{}

type workspaceInfo struct {
	ID        string `json:"id"`
	Name      string `json:"name"`
	Icon      string `json:"icon"`
	Role      string `json:"role"`
	PageCount int    `json:"pageCount"`
}

type listWorkspacesOutput struct {
	Workspaces []workspaceInfo `json:"workspaces"`
}

func (r *Runner) listWorkspaces(ctx context.Context) (listWorkspacesOutput, error) {
	if !r.allowed("pages:read") {
		return listWorkspacesOutput{}, fmt.Errorf("missing pages:read scope")
	}
	workspaces, err := r.workspaceList(ctx)
	if err != nil {
		return listWorkspacesOutput{}, err
	}
	out := make([]workspaceInfo, 0, len(workspaces))
	for _, workspace := range workspaces {
		count, _ := r.Store.Pages.CountDocuments(ctx, bson.M{"workspaceId": workspace.ID, "archived": false})
		out = append(out, workspaceInfo{
			ID: workspace.ID.Hex(), Name: workspace.Name, Icon: workspace.Icon,
			Role: roleOf(workspace, r.User.ID), PageCount: int(count),
		})
	}
	return listWorkspacesOutput{Workspaces: out}, nil
}

type searchInput struct {
	Query       string `json:"query" jsonschema:"Search words to look for. Leave empty to list recent pages."`
	WorkspaceID string `json:"workspaceId,omitempty" jsonschema:"Optional workspace id to limit the search."`
	Limit       int    `json:"limit,omitempty" jsonschema:"Maximum number of results (1-30)."`
}

type pageHit struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Icon        string `json:"icon"`
	WorkspaceID string `json:"workspaceId"`
	UpdatedAt   string `json:"updatedAt"`
	Excerpt     string `json:"excerpt"`
}

type searchOutput struct {
	Results []pageHit `json:"results"`
}

func (r *Runner) searchPages(ctx context.Context, input searchInput) (searchOutput, error) {
	if !r.allowed("pages:read") {
		return searchOutput{}, fmt.Errorf("missing pages:read scope")
	}
	workspaces, err := r.workspaceList(ctx)
	if err != nil {
		return searchOutput{}, err
	}
	ids := make([]primitive.ObjectID, 0, len(workspaces))
	for _, workspace := range workspaces {
		if input.WorkspaceID == "" || workspace.ID.Hex() == input.WorkspaceID {
			ids = append(ids, workspace.ID)
		}
	}
	if len(ids) == 0 {
		return searchOutput{}, fmt.Errorf("workspace not found")
	}
	filter := bson.M{"workspaceId": bson.M{"$in": ids}, "archived": false}
	if query := strings.TrimSpace(input.Query); query != "" {
		pattern := primitive.Regex{Pattern: regexp.QuoteMeta(query), Options: "i"}
		filter["$or"] = []bson.M{{"title": pattern}, {"text": pattern}}
	}
	limit := input.Limit
	if limit <= 0 || limit > 30 {
		limit = 12
	}
	cur, err := r.Store.Pages.Find(ctx, filter, options.Find().
		SetProjection(bson.M{"blocks": 0}).
		SetSort(bson.D{{Key: "updatedAt", Value: -1}}).
		SetLimit(int64(limit)))
	if err != nil {
		return searchOutput{}, err
	}
	defer cur.Close(ctx)
	var pages []model.Page
	if err := cur.All(ctx, &pages); err != nil {
		return searchOutput{}, err
	}
	results := make([]pageHit, 0, len(pages))
	for _, page := range pages {
		excerpt := strings.TrimSpace(page.Text)
		if len([]rune(excerpt)) > 180 {
			excerpt = string([]rune(excerpt)[:180]) + "…"
		}
		results = append(results, pageHit{
			ID: page.ID.Hex(), Title: page.Title, Icon: page.Icon,
			WorkspaceID: page.WorkspaceID.Hex(), UpdatedAt: page.UpdatedAt.Format(time.RFC3339),
			Excerpt: excerpt,
		})
	}
	return searchOutput{Results: results}, nil
}

type pageInput struct {
	PageID string `json:"pageId"`
}

type blockInfo struct {
	ID       string           `json:"id"`
	Type     string           `json:"type"`
	Text     string           `json:"text"`
	Checked  bool             `json:"checked,omitempty"`
	Language string           `json:"language,omitempty"`
	URL      string           `json:"url,omitempty"`
	Table    *model.TableData `json:"table,omitempty"`
}

type pageOutput struct {
	ID          string      `json:"id"`
	Title       string      `json:"title"`
	Icon        string      `json:"icon"`
	WorkspaceID string      `json:"workspaceId"`
	Blocks      []blockInfo `json:"blocks"`
	Markdown    string      `json:"markdown"`
}

func (r *Runner) readPage(ctx context.Context, input pageInput) (pageOutput, error) {
	if !r.allowed("pages:read") {
		return pageOutput{}, fmt.Errorf("missing pages:read scope")
	}
	page, _, _, err := r.pageFor(ctx, input.PageID)
	if err != nil {
		return pageOutput{}, err
	}
	blocks := make([]blockInfo, 0, len(page.Blocks))
	for _, block := range page.Blocks {
		blocks = append(blocks, blockInfo{
			ID: block.ID, Type: block.Type, Text: block.Text, Checked: block.Checked,
			Language: block.Language, URL: block.URL, Table: block.Table,
		})
	}
	return pageOutput{
		ID: page.ID.Hex(), Title: page.Title, Icon: page.Icon,
		WorkspaceID: page.WorkspaceID.Hex(), Blocks: blocks, Markdown: markdownFor(page),
	}, nil
}

type createPageInput struct {
	WorkspaceID     string `json:"workspaceId,omitempty" jsonschema:"Workspace to create the page in. Defaults to the first editable workspace."`
	ParentID        string `json:"parentId,omitempty" jsonschema:"Optional parent page id."`
	Title           string `json:"title"`
	ContentMarkdown string `json:"contentMarkdown,omitempty" jsonschema:"Optional page content in Markdown."`
}

type createPageOutput struct {
	PageID      string `json:"pageId"`
	Title       string `json:"title"`
	WorkspaceID string `json:"workspaceId"`
}

func (r *Runner) createPage(ctx context.Context, input createPageInput) (createPageOutput, error) {
	if !r.allowed("pages:write") {
		return createPageOutput{}, fmt.Errorf("missing pages:write scope")
	}
	workspaces, err := r.workspaceList(ctx)
	if err != nil {
		return createPageOutput{}, err
	}
	var workspace model.Workspace
	for _, candidate := range workspaces {
		if input.WorkspaceID != "" && candidate.ID.Hex() != input.WorkspaceID {
			continue
		}
		role := roleOf(candidate, r.User.ID)
		if role == "owner" || role == "editor" {
			workspace = candidate
			break
		}
	}
	if workspace.ID.IsZero() {
		return createPageOutput{}, fmt.Errorf("no editable workspace found")
	}
	var parentID *primitive.ObjectID
	if strings.TrimSpace(input.ParentID) != "" {
		id, err := primitive.ObjectIDFromHex(input.ParentID)
		if err != nil {
			return createPageOutput{}, fmt.Errorf("invalid parent id")
		}
		var parent model.Page
		if err := r.Store.Pages.FindOne(ctx, bson.M{"_id": id, "workspaceId": workspace.ID}).Decode(&parent); err != nil {
			return createPageOutput{}, fmt.Errorf("parent page not found")
		}
		parentID = &id
	}
	title := strings.TrimSpace(input.Title)
	if title == "" {
		title = "Untitled"
	}
	blocks := parseMarkdown(input.ContentMarkdown)
	order := float64(1024)
	filter := bson.M{"workspaceId": workspace.ID, "parentId": parentID}
	if parentID == nil {
		filter["parentId"] = nil
	}
	var last model.Page
	if err := r.Store.Pages.FindOne(ctx, filter, options.FindOne().SetSort(bson.D{{Key: "order", Value: -1}})).Decode(&last); err == nil {
		order = last.Order + 1024
	}
	now := time.Now().UTC()
	page := model.Page{
		ID: primitive.NewObjectID(), WorkspaceID: workspace.ID, ParentID: parentID,
		Title: title, Icon: "📄", Blocks: blocks, Text: textFromBlocks(blocks),
		Order: order, CreatedBy: r.User.ID, CreatedAt: now, UpdatedAt: now,
	}
	if _, err := r.Store.Pages.InsertOne(ctx, page); err != nil {
		return createPageOutput{}, err
	}
	r.trackCreated(page)
	r.broadcastTree(workspace.ID)
	r.snapshot(ctx, page)
	r.record("Created page “" + title + "”")
	return createPageOutput{PageID: page.ID.Hex(), Title: page.Title, WorkspaceID: workspace.ID.Hex()}, nil
}

type tableInput struct {
	Columns []string   `json:"columns,omitempty"`
	Rows    [][]string `json:"rows,omitempty"`
	Header  bool       `json:"header,omitempty"`
}

type agentBlockInput struct {
	Type     string      `json:"type" jsonschema:"paragraph, heading1, heading2, heading3, bulleted, numbered, todo, quote, callout, code, divider, image, table or diagram"`
	Text     string      `json:"text,omitempty"`
	Checked  bool        `json:"checked,omitempty"`
	Language string      `json:"language,omitempty"`
	Color    string      `json:"color,omitempty"`
	URL      string      `json:"url,omitempty"`
	Table    *tableInput `json:"table,omitempty"`
}

type appendBlocksInput struct {
	PageID string            `json:"pageId"`
	Blocks []agentBlockInput `json:"blocks"`
}

type appendBlocksOutput struct {
	PageID     string `json:"pageId"`
	BlockCount int    `json:"blockCount"`
}

func sanitizeTable(input *tableInput) *model.TableData {
	if input == nil {
		return &model.TableData{Columns: []string{"Column 1", "Column 2"}, Rows: [][]string{{"", ""}}, Header: true}
	}
	columns := input.Columns
	if len(columns) == 0 {
		columns = []string{"Column 1", "Column 2"}
	}
	if len(columns) > 20 {
		columns = columns[:20]
	}
	for i := range columns {
		columns[i] = strings.TrimSpace(columns[i])
		if columns[i] == "" {
			columns[i] = "Column " + strconv.Itoa(i+1)
		}
	}
	rows := input.Rows
	if len(rows) > 200 {
		rows = rows[:200]
	}
	outRows := make([][]string, len(rows))
	for i, row := range rows {
		cells := make([]string, len(columns))
		for j := range columns {
			if j < len(row) {
				cells[j] = row[j]
			}
		}
		outRows[i] = cells
	}
	return &model.TableData{Columns: columns, Rows: outRows, Header: input.Header}
}

func buildBlocks(inputs []agentBlockInput) ([]model.Block, error) {
	allowed := map[string]bool{
		"paragraph": true, "heading1": true, "heading2": true, "heading3": true,
		"bulleted": true, "numbered": true, "todo": true, "quote": true,
		"callout": true, "code": true, "divider": true, "image": true,
		"table": true, "diagram": true,
	}
	out := make([]model.Block, 0, len(inputs))
	for _, input := range inputs {
		if !allowed[input.Type] {
			return nil, fmt.Errorf("unsupported block type: %s", input.Type)
		}
		block := model.Block{ID: primitive.NewObjectID().Hex(), Type: input.Type, Text: input.Text, Checked: input.Checked}
		if input.Type == "code" {
			block.Language = input.Language
			if block.Language == "" {
				block.Language = "plain text"
			}
		}
		if input.Type == "callout" {
			block.Color = input.Color
			if block.Color == "" {
				block.Color = "amber"
			}
		}
		if input.Type == "image" {
			block.URL = input.URL
		}
		if input.Type == "table" {
			block.Table = sanitizeTable(input.Table)
		}
		if input.Type == "diagram" && strings.TrimSpace(block.Text) == "" {
			block.Text = "flowchart LR\n  Start --> Finish"
		}
		if len([]rune(block.Text)) > 50000 {
			return nil, fmt.Errorf("a block is too long")
		}
		out = append(out, block)
	}
	return out, nil
}

func (r *Runner) appendBlocks(ctx context.Context, input appendBlocksInput) (appendBlocksOutput, error) {
	if !r.allowed("pages:write") {
		return appendBlocksOutput{}, fmt.Errorf("missing pages:write scope")
	}
	page, _, role, err := r.pageFor(ctx, input.PageID)
	if err != nil {
		return appendBlocksOutput{}, err
	}
	if role == "viewer" {
		return appendBlocksOutput{}, fmt.Errorf("you only have view access")
	}
	if len(input.Blocks) == 0 {
		return appendBlocksOutput{}, fmt.Errorf("no blocks provided")
	}
	fresh, err := buildBlocks(input.Blocks)
	if err != nil {
		return appendBlocksOutput{}, err
	}
	if len(page.Blocks)+len(fresh) > 2000 {
		return appendBlocksOutput{}, fmt.Errorf("page has too many blocks")
	}
	r.trackBefore(page)
	page.Blocks = append(page.Blocks, fresh...)
	now := time.Now().UTC()
	if _, err := r.Store.Pages.UpdateByID(ctx, page.ID, bson.M{"$set": bson.M{
		"blocks": page.Blocks, "text": textFromBlocks(page.Blocks), "updatedAt": now,
	}}); err != nil {
		return appendBlocksOutput{}, err
	}
	r.trackAfter(page)
	r.broadcastBlocks(page, page.Blocks, now)
	r.snapshot(ctx, page)
	r.record(fmt.Sprintf("Added %d block(s) to “%s”", len(fresh), page.Title))
	return appendBlocksOutput{PageID: page.ID.Hex(), BlockCount: len(page.Blocks)}, nil
}

type updatePageInput struct {
	PageID string `json:"pageId"`
	Title  string `json:"title,omitempty"`
	Icon   string `json:"icon,omitempty"`
}

type updatePageOutput struct {
	PageID string `json:"pageId"`
	Title  string `json:"title"`
	Icon   string `json:"icon"`
}

func (r *Runner) updatePage(ctx context.Context, input updatePageInput) (updatePageOutput, error) {
	if !r.allowed("pages:write") {
		return updatePageOutput{}, fmt.Errorf("missing pages:write scope")
	}
	page, _, role, err := r.pageFor(ctx, input.PageID)
	if err != nil {
		return updatePageOutput{}, err
	}
	if role == "viewer" {
		return updatePageOutput{}, fmt.Errorf("you only have view access")
	}
	r.trackBefore(page)
	updates := bson.M{"updatedAt": time.Now().UTC()}
	if title := strings.TrimSpace(input.Title); title != "" {
		if len([]rune(title)) > 200 {
			return updatePageOutput{}, fmt.Errorf("title is too long")
		}
		page.Title = title
		updates["title"] = title
	}
	if icon := strings.TrimSpace(input.Icon); icon != "" {
		page.Icon = icon
		updates["icon"] = icon
	}
	if _, err := r.Store.Pages.UpdateByID(ctx, page.ID, bson.M{"$set": updates}); err != nil {
		return updatePageOutput{}, err
	}
	r.trackAfter(page)
	r.broadcastMeta(page)
	r.broadcastTree(page.WorkspaceID)
	r.snapshot(ctx, page)
	r.record("Updated page “" + page.Title + "”")
	return updatePageOutput{PageID: page.ID.Hex(), Title: page.Title, Icon: page.Icon}, nil
}

type updateBlockInput struct {
	PageID  string `json:"pageId"`
	BlockID string `json:"blockId"`
	Text    string `json:"text"`
}

type updateBlockOutput struct {
	PageID  string `json:"pageId"`
	BlockID string `json:"blockId"`
}

func (r *Runner) updateBlock(ctx context.Context, input updateBlockInput) (updateBlockOutput, error) {
	if !r.allowed("pages:write") {
		return updateBlockOutput{}, fmt.Errorf("missing pages:write scope")
	}
	page, _, role, err := r.pageFor(ctx, input.PageID)
	if err != nil {
		return updateBlockOutput{}, err
	}
	if role == "viewer" {
		return updateBlockOutput{}, fmt.Errorf("you only have view access")
	}
	r.trackBefore(page)
	found := false
	for i := range page.Blocks {
		if page.Blocks[i].ID == input.BlockID {
			page.Blocks[i].Text = input.Text
			page.Blocks[i].Rich = ""
			found = true
			break
		}
	}
	if !found {
		return updateBlockOutput{}, fmt.Errorf("block not found")
	}
	now := time.Now().UTC()
	if _, err := r.Store.Pages.UpdateByID(ctx, page.ID, bson.M{"$set": bson.M{
		"blocks": page.Blocks, "text": textFromBlocks(page.Blocks), "updatedAt": now,
	}}); err != nil {
		return updateBlockOutput{}, err
	}
	r.trackAfter(page)
	r.broadcastBlocks(page, page.Blocks, now)
	r.snapshot(ctx, page)
	r.record("Updated a block in “" + page.Title + "”")
	return updateBlockOutput{PageID: page.ID.Hex(), BlockID: input.BlockID}, nil
}

type commentInput struct {
	PageID  string `json:"pageId"`
	BlockID string `json:"blockId"`
	Quote   string `json:"quote,omitempty"`
	Body    string `json:"body"`
}

type commentOutput struct {
	CommentID string `json:"commentId"`
}

func (r *Runner) addComment(ctx context.Context, input commentInput) (commentOutput, error) {
	if !r.allowed("pages:write") {
		return commentOutput{}, fmt.Errorf("missing pages:write scope")
	}
	page, _, role, err := r.pageFor(ctx, input.PageID)
	if err != nil {
		return commentOutput{}, err
	}
	if role == "viewer" {
		return commentOutput{}, fmt.Errorf("you only have view access")
	}
	exists := false
	for _, block := range page.Blocks {
		if block.ID == input.BlockID {
			exists = true
			break
		}
	}
	if !exists {
		return commentOutput{}, fmt.Errorf("block not found")
	}
	body := strings.TrimSpace(input.Body)
	if body == "" {
		return commentOutput{}, fmt.Errorf("comment body is required")
	}
	now := time.Now().UTC()
	comment := model.Comment{
		ID: primitive.NewObjectID(), PageID: page.ID, WorkspaceID: page.WorkspaceID,
		BlockID: input.BlockID, Quote: strings.TrimSpace(input.Quote), Body: body,
		AuthorID: r.User.ID, AuthorName: r.User.Name, CreatedAt: now, UpdatedAt: now,
	}
	if _, err := r.Store.Comments.InsertOne(ctx, comment); err != nil {
		return commentOutput{}, err
	}
	r.Hub.Broadcast(page.ID.Hex(), map[string]any{
		"type": "comments", "pageId": page.ID.Hex(), "action": "created",
	}, "")
	r.record("Commented on “" + page.Title + "”")
	return commentOutput{CommentID: comment.ID.Hex()}, nil
}

func (r *Runner) tools() ([]tool.Tool, error) {
	listTool, err := functiontool.New(functiontool.Config{
		Name: "list_workspaces", Description: "List the workspaces the user can access, with roles and page counts.",
	}, func(tc agent.ToolContext, _ listWorkspacesInput) (listWorkspacesOutput, error) {
		return r.listWorkspaces(tc)
	})
	if err != nil {
		return nil, err
	}
	searchTool, err := functiontool.New(functiontool.Config{
		Name: "search_pages", Description: "Search page titles and content across accessible workspaces. Use this before reading or editing when you do not know the page id.",
	}, func(tc agent.ToolContext, input searchInput) (searchOutput, error) {
		return r.searchPages(tc, input)
	})
	if err != nil {
		return nil, err
	}
	readTool, err := functiontool.New(functiontool.Config{
		Name: "read_page", Description: "Read a page by id. Returns its blocks, block ids and a Markdown representation.",
	}, func(tc agent.ToolContext, input pageInput) (pageOutput, error) {
		return r.readPage(tc, input)
	})
	if err != nil {
		return nil, err
	}
	createTool, err := functiontool.New(functiontool.Config{
		Name: "create_page", Description: "Create a new page with Markdown content in a workspace. Use this when the user asks for a new document.",
	}, func(tc agent.ToolContext, input createPageInput) (createPageOutput, error) {
		return r.createPage(tc, input)
	})
	if err != nil {
		return nil, err
	}
	appendTool, err := functiontool.New(functiontool.Config{
		Name: "append_blocks", Description: "Append blocks to an existing page. Prefer this for adding notes, sections, tables, diagrams or tasks without overwriting existing content.",
	}, func(tc agent.ToolContext, input appendBlocksInput) (appendBlocksOutput, error) {
		return r.appendBlocks(tc, input)
	})
	if err != nil {
		return nil, err
	}
	updatePageTool, err := functiontool.New(functiontool.Config{
		Name: "update_page", Description: "Update a page's title or emoji icon.",
	}, func(tc agent.ToolContext, input updatePageInput) (updatePageOutput, error) {
		return r.updatePage(tc, input)
	})
	if err != nil {
		return nil, err
	}
	updateBlockTool, err := functiontool.New(functiontool.Config{
		Name: "update_block", Description: "Replace the text of one existing block. Read the page first to get block ids.",
	}, func(tc agent.ToolContext, input updateBlockInput) (updateBlockOutput, error) {
		return r.updateBlock(tc, input)
	})
	if err != nil {
		return nil, err
	}
	commentTool, err := functiontool.New(functiontool.Config{
		Name: "add_comment", Description: "Leave a comment on a block of a page.",
	}, func(tc agent.ToolContext, input commentInput) (commentOutput, error) {
		return r.addComment(tc, input)
	})
	if err != nil {
		return nil, err
	}
	return []tool.Tool{
		listTool, searchTool, readTool, createTool, appendTool,
		updatePageTool, updateBlockTool, commentTool,
	}, nil
}

// Run executes the ADK document agent with the user's BYOK Gemini key.
func (r *Runner) Run(ctx context.Context, history []ChatMessage, message, focusPageID string) (string, []string, error) {
	return r.run(ctx, history, message, focusPageID, false, nil)
}

// RunStream is like Run, but invokes onText for each partial model chunk. The
// callback returns false to abort the run (for example after a client
// disconnects). Providers that do not support streaming simply produce no
// partial callbacks and still return the final response.
func (r *Runner) RunStream(
	ctx context.Context,
	history []ChatMessage,
	message, focusPageID string,
	onText func(string) bool,
) (string, []string, error) {
	return r.run(ctx, history, message, focusPageID, true, onText)
}

func (r *Runner) run(
	ctx context.Context,
	history []ChatMessage,
	message, focusPageID string,
	stream bool,
	onText func(string) bool,
) (string, []string, error) {
	if strings.TrimSpace(r.Key) == "" {
		return "", nil, fmt.Errorf("no API key configured")
	}
	modelName := strings.TrimSpace(r.ModelName)
	provider := strings.ToLower(strings.TrimSpace(r.Provider))
	if provider == "" {
		provider = "gemini"
	}
	var llm adkmodel.LLM
	var err error
	if provider == "gemini" {
		if modelName == "" {
			modelName = "gemini-2.5-flash"
		}
		llm, err = gemini.NewModel(ctx, modelName, &genai.ClientConfig{APIKey: r.Key})
		if err != nil {
			return "", r.Actions, fmt.Errorf("could not initialise Gemini: %w", err)
		}
	} else {
		llm = openaimodel.New(openaimodel.Config{
			Provider: provider, BaseURL: r.BaseURL, APIKey: r.Key, Model: modelName,
		})
	}
	tools, err := r.tools()
	if err != nil {
		return "", r.Actions, err
	}
	instruction := `You are Motion, a calm and precise document assistant inside a Notion-like workspace.
- You can read and edit the user's documents through tools.
- Always use tools to discover real page ids and content. Never invent ids.
- If the user asks you to change a document, perform the edit with tools, then briefly summarise what changed.
- Prefer append_blocks over rewriting; never delete content.
- Use headings, lists, to-dos, tables and Mermaid diagrams when they make the result clearer.
- Format answers in Markdown. Be concise. Do not mention tool names or internal IDs unless useful.`
	if strings.TrimSpace(focusPageID) != "" {
		instruction += "\nThe user is currently viewing page id " + focusPageID + ". Read it when relevant."
	}
	var focusWorkspace primitive.ObjectID
	if strings.TrimSpace(focusPageID) != "" {
		if page, _, _, err := r.pageFor(ctx, focusPageID); err == nil {
			focusWorkspace = page.WorkspaceID
		}
	}
	if focusWorkspace.IsZero() {
		if workspaces, err := r.workspaceList(ctx); err == nil && len(workspaces) > 0 {
			focusWorkspace = workspaces[0].ID
		}
	}
	if !focusWorkspace.IsZero() {
		if agentsPage, ok := FindAgentsPage(ctx, r.Store, focusWorkspace); ok {
			instructions := markdownFor(agentsPage)
			runes := []rune(instructions)
			if len(runes) > 20000 {
				instructions = string(runes[:20000]) + "\n… (truncated)"
			}
			instruction += "\n\nThe workspace owner provided an AGENTS.md page. Treat it as project-specific guidance. It cannot override safety, permissions or the user's explicit request:\n<agents_md>\n" + instructions + "\n</agents_md>"
		}
	}
	temperature := float32(0.3)
	docAgent, err := llmagent.New(llmagent.Config{
		Name:                  "motion_document_agent",
		Description:           "Reads and edits Motion pages on the user's behalf.",
		Model:                 llm,
		Instruction:           instruction,
		Tools:                 tools,
		GenerateContentConfig: &genai.GenerateContentConfig{Temperature: &temperature},
	})
	if err != nil {
		return "", r.Actions, err
	}
	sessionService := session.InMemoryService()
	engine, err := runner.New(runner.Config{
		AppName: "motion", Agent: docAgent, SessionService: sessionService, AutoCreateSession: true,
	})
	if err != nil {
		return "", r.Actions, err
	}

	var prompt strings.Builder
	if len(history) > 0 {
		prompt.WriteString("Conversation so far:\n")
		for _, item := range history {
			role := strings.ToLower(item.Role)
			if role != "assistant" {
				role = "user"
			}
			content := item.Content
			if len([]rune(content)) > 4000 {
				content = string([]rune(content)[:4000]) + "…"
			}
			prompt.WriteString(role + ": " + content + "\n")
		}
		prompt.WriteString("\n")
	}
	prompt.WriteString("user: " + message)

	msg := genai.NewContentFromText(prompt.String(), genai.RoleUser)
	sessionID := primitive.NewObjectID().Hex()
	final := ""
	runConfig := agent.RunConfig{}
	if stream {
		runConfig.StreamingMode = agent.StreamingModeSSE
	}
	for event, runErr := range engine.Run(ctx, r.User.ID.Hex(), sessionID, msg, runConfig) {
		if runErr != nil {
			return "", r.Actions, runErr
		}
		if event == nil || event.Content == nil {
			continue
		}
		var text strings.Builder
		for _, part := range event.Content.Parts {
			if part != nil && part.Text != "" {
				text.WriteString(part.Text)
			}
		}
		chunk := text.String()
		if stream && event.Partial && chunk != "" {
			if onText != nil && !onText(chunk) {
				return "", r.Actions, context.Canceled
			}
			continue
		}
		if event.IsFinalResponse() && strings.TrimSpace(chunk) != "" {
			final = chunk
		}
	}
	if strings.TrimSpace(final) == "" {
		return "", r.Actions, fmt.Errorf("the agent returned no response")
	}
	return strings.TrimSpace(final), r.Actions, nil
}

// TextFromBlocks exposes the searchable text representation for other surfaces
// such as MCP tools.
func TextFromBlocks(blocks []model.Block) string { return textFromBlocks(blocks) }

// ParseMarkdown converts a Markdown document into Motion blocks.
func ParseMarkdown(markdown string) []model.Block { return parseMarkdown(markdown) }

// Markdown renders a page for tool and MCP clients.
func Markdown(page model.Page) string { return markdownFor(page) }
