package httpapi

import (
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/motion/server/internal/model"
)

type splitPageRequest struct {
	Level int `json:"level"`
}

type splitPageResponse struct {
	Page     model.Page   `json:"page"`
	Children []model.Page `json:"children"`
}

func headingLevel(blockType string) int {
	switch blockType {
	case "heading1", "toggleHeading1":
		return 1
	case "heading2", "toggleHeading2":
		return 2
	case "heading3", "toggleHeading3":
		return 3
	default:
		return 0
	}
}

func cloneBlocks(blocks []model.Block) []model.Block {
	out := make([]model.Block, len(blocks))
	for i, block := range blocks {
		block.ID = primitive.NewObjectID().Hex()
		out[i] = block
	}
	return out
}

func sectionTitle(blocks []model.Block) string {
	for _, block := range blocks {
		if headingLevel(block.Type) > 0 {
			if title := strings.TrimSpace(block.Text); title != "" {
				return truncateRunes(title, 200)
			}
		}
	}
	return "Untitled section"
}

// splitPage turns heading sections into child pages and leaves an index of
// page-link blocks on the original page. Content before the first matching
// heading stays on the original page.
func (s *Server) splitPage(w http.ResponseWriter, r *http.Request) {
	pageID, err := primitive.ObjectIDFromHex(chiURLParam(r, "pageID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid page id")
		return
	}
	page, ok := s.editablePage(w, r, pageID)
	if !ok {
		return
	}
	if page.IsLayout {
		writeErr(w, http.StatusBadRequest, "layout pages cannot be split")
		return
	}
	var req splitPageRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Level == 0 {
		req.Level = 2
	}
	if req.Level < 1 || req.Level > 3 {
		writeErr(w, http.StatusBadRequest, "split level must be between 1 and 3")
		return
	}

	intro := make([]model.Block, 0)
	sections := make([][]model.Block, 0)
	for _, block := range page.Blocks {
		if headingLevel(block.Type) == req.Level {
			sections = append(sections, []model.Block{block})
			continue
		}
		if len(sections) == 0 {
			intro = append(intro, block)
		} else {
			sections[len(sections)-1] = append(sections[len(sections)-1], block)
		}
	}
	if len(sections) == 0 {
		writeErr(w, http.StatusBadRequest, "no headings to split at this level")
		return
	}

	order, err := s.nextOrder(r, page.WorkspaceID, &page.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not prepare sub-pages")
		return
	}
	now := time.Now().UTC()
	children := make([]model.Page, 0, len(sections))
	parentBlocks := append([]model.Block{}, intro...)
	for index, blocks := range sections {
		title := sectionTitle(blocks)
		child := model.Page{
			ID:          primitive.NewObjectID(),
			WorkspaceID: page.WorkspaceID,
			ParentID:    &page.ID,
			Title:       title,
			Icon:        page.Icon,
			Theme:       page.Theme,
			Blocks:      cloneBlocks(blocks),
			BlocksRev:   1,
			Text:        textFromBlocks(blocks),
			Order:       order + float64(index)*1024,
			CreatedBy:   currentUserID(r),
			CreatedAt:   now,
			UpdatedAt:   now,
		}
		if _, err := s.store.Pages.InsertOne(r.Context(), child); err != nil {
			s.store.Pages.DeleteMany(r.Context(), bson.M{"_id": bson.M{"$in": pageIDs(children)}})
			writeErr(w, http.StatusInternalServerError, "could not create sub-page")
			return
		}
		children = append(children, child)
		parentBlocks = append(parentBlocks, model.Block{
			ID: primitive.NewObjectID().Hex(), Type: "pageLink", Text: title, URL: child.ID.Hex(),
		})
	}

	rev := page.BlocksRev + 1
	if _, err := s.store.Pages.UpdateByID(r.Context(), page.ID, bson.M{"$set": bson.M{
		"blocks": parentBlocks, "blocksRev": rev, "text": textFromBlocks(parentBlocks), "updatedAt": now,
	}}); err != nil {
		s.store.Pages.DeleteMany(r.Context(), bson.M{"_id": bson.M{"$in": pageIDs(children)}})
		writeErr(w, http.StatusInternalServerError, "could not update page")
		return
	}
	page.Blocks = parentBlocks
	page.BlocksRev = rev
	page.Text = textFromBlocks(parentBlocks)
	page.UpdatedAt = now

	s.hub.Broadcast(page.ID.Hex(), map[string]any{
		"type": "blocks", "pageId": page.ID.Hex(), "clientId": clientID(r),
		"blocks": parentBlocks, "blocksRev": rev, "updatedAt": now,
	}, clientID(r))
	s.broadcastTree(page.WorkspaceID, clientID(r))
	writeJSON(w, http.StatusOK, splitPageResponse{Page: page, Children: children})
}

func pageIDs(pages []model.Page) []primitive.ObjectID {
	ids := make([]primitive.ObjectID, len(pages))
	for i, page := range pages {
		ids[i] = page.ID
	}
	return ids
}

type mergePagesRequest struct {
	PageIDs   []string `json:"pageIds"`
	AddTitles *bool    `json:"addTitles"`
}

type mergePagesResponse struct {
	Page   model.Page `json:"page"`
	Merged int        `json:"merged"`
}

// mergePages appends the content of direct child pages to this page. The
// child pages are archived (so they can be restored from Trash) and their own
// children are re-parented to the target rather than deleted.
func (s *Server) mergePages(w http.ResponseWriter, r *http.Request) {
	pageID, err := primitive.ObjectIDFromHex(chiURLParam(r, "pageID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid page id")
		return
	}
	page, ok := s.editablePage(w, r, pageID)
	if !ok {
		return
	}
	var req mergePagesRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if page.IsLayout {
		writeErr(w, http.StatusBadRequest, "layout pages cannot receive merged content")
		return
	}
	if len(req.PageIDs) == 0 || len(req.PageIDs) > 100 {
		writeErr(w, http.StatusBadRequest, "choose between 1 and 100 sub-pages")
		return
	}
	addTitles := true
	if req.AddTitles != nil {
		addTitles = *req.AddTitles
	}

	sources := make([]model.Page, 0, len(req.PageIDs))
	seen := map[primitive.ObjectID]bool{}
	for _, value := range req.PageIDs {
		id, err := primitive.ObjectIDFromHex(strings.TrimSpace(value))
		if err != nil {
			writeErr(w, http.StatusBadRequest, "invalid sub-page id")
			return
		}
		if seen[id] {
			continue
		}
		var source model.Page
		if err := s.store.Pages.FindOne(r.Context(), bson.M{"_id": id, "workspaceId": page.WorkspaceID}).Decode(&source); err != nil {
			writeErr(w, http.StatusBadRequest, "sub-page not found")
			return
		}
		if source.ParentID == nil || *source.ParentID != page.ID {
			writeErr(w, http.StatusBadRequest, "all pages must be direct sub-pages")
			return
		}
		if source.Locked {
			writeErr(w, http.StatusBadRequest, "unlock all selected sub-pages before merging")
			return
		}
		if source.IsLayout {
			writeErr(w, http.StatusBadRequest, "layout pages cannot be merged")
			return
		}
		seen[id] = true
		sources = append(sources, source)
	}
	if len(sources) == 0 {
		writeErr(w, http.StatusBadRequest, "choose at least one sub-page")
		return
	}

	now := time.Now().UTC()
	mergedBlocks := append([]model.Block{}, page.Blocks...)
	for _, source := range sources {
		title := strings.TrimSpace(source.Title)
		if addTitles && title != "" {
			mergedBlocks = append(mergedBlocks, model.Block{
				ID: primitive.NewObjectID().Hex(), Type: "heading2", Text: truncateRunes(title, 200),
			})
		}
		mergedBlocks = append(mergedBlocks, cloneBlocks(source.Blocks)...)
	}

	// Move grandchildren to the target before archiving their parent.
	childOrder, err := s.nextOrder(r, page.WorkspaceID, &page.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not merge sub-pages")
		return
	}
	for _, source := range sources {
		cur, err := s.store.Pages.Find(r.Context(), bson.M{
			"workspaceId": page.WorkspaceID, "parentId": source.ID, "archived": false,
		}, options.Find().SetSort(bson.D{{Key: "order", Value: 1}}))
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "could not merge sub-pages")
			return
		}
		grandchildren := make([]model.Page, 0)
		if err := cur.All(r.Context(), &grandchildren); err != nil {
			cur.Close(r.Context())
			writeErr(w, http.StatusInternalServerError, "could not merge sub-pages")
			return
		}
		cur.Close(r.Context())
		for _, child := range grandchildren {
			childOrder += 1024
			if _, err := s.store.Pages.UpdateByID(r.Context(), child.ID, bson.M{"$set": bson.M{
				"parentId": page.ID, "order": childOrder, "updatedAt": now,
			}}); err != nil {
				writeErr(w, http.StatusInternalServerError, "could not merge sub-pages")
				return
			}
		}
	}

	rev := page.BlocksRev + 1
	if _, err := s.store.Pages.UpdateByID(r.Context(), page.ID, bson.M{"$set": bson.M{
		"blocks": mergedBlocks, "blocksRev": rev, "text": textFromBlocks(mergedBlocks), "updatedAt": now,
	}}); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not merge sub-pages")
		return
	}
	archivedAt := now
	for _, source := range sources {
		if _, err := s.store.Pages.UpdateByID(r.Context(), source.ID, bson.M{"$set": bson.M{
			"archived": true, "archivedAt": archivedAt, "updatedAt": now,
		}}); err != nil {
			writeErr(w, http.StatusInternalServerError, "could not archive merged sub-page")
			return
		}
		s.hub.Broadcast(source.ID.Hex(), map[string]any{
			"type": "meta", "pageId": source.ID.Hex(), "clientId": clientID(r),
			"page": map[string]any{"archived": true},
		}, clientID(r))
	}

	page.Blocks = mergedBlocks
	page.BlocksRev = rev
	page.Text = textFromBlocks(mergedBlocks)
	page.UpdatedAt = now

	s.hub.Broadcast(page.ID.Hex(), map[string]any{
		"type": "blocks", "pageId": page.ID.Hex(), "clientId": clientID(r),
		"blocks": mergedBlocks, "blocksRev": rev, "updatedAt": now,
	}, clientID(r))
	s.broadcastTree(page.WorkspaceID, clientID(r))
	writeJSON(w, http.StatusOK, mergePagesResponse{Page: page, Merged: len(sources)})
}
