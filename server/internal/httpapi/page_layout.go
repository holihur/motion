package httpapi

import (
	"context"
	"net/http"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/motion/server/internal/model"
)

// applyLayout composes a page with its layout page: blocks before the content
// placeholder become the header, blocks after it become the footer. Layout
// nesting is intentionally not supported.
func (s *Server) applyLayout(ctx context.Context, page model.Page) model.Page {
	if page.LayoutID == "" {
		return page
	}
	layoutID, err := primitive.ObjectIDFromHex(page.LayoutID)
	if err != nil {
		return page
	}
	var layout model.Page
	if err := s.store.Pages.FindOne(ctx, bson.M{"_id": layoutID, "workspaceId": page.WorkspaceID, "isLayout": true, "archived": false}).Decode(&layout); err != nil {
		return page
	}
	index := -1
	for i, block := range layout.Blocks {
		if block.Type == "content" {
			index = i
			break
		}
	}
	if index < 0 {
		return page
	}
	header := make([]model.Block, 0, index)
	for _, block := range layout.Blocks[:index] {
		if block.Type != "content" {
			header = append(header, block)
		}
	}
	footer := make([]model.Block, 0, len(layout.Blocks)-index-1)
	for _, block := range layout.Blocks[index+1:] {
		if block.Type != "content" {
			footer = append(footer, block)
		}
	}
	blocks := make([]model.Block, 0, len(header)+len(page.Blocks)+len(footer))
	blocks = append(blocks, header...)
	blocks = append(blocks, page.Blocks...)
	blocks = append(blocks, footer...)
	page.Blocks = blocks
	return page
}

func (s *Server) broadcastLayoutChange(ctx context.Context, layout model.Page) {
	if !layout.IsLayout {
		return
	}
	cur, err := s.store.Pages.Find(ctx, bson.M{"layoutId": layout.ID.Hex(), "archived": false},
		options.Find().SetProjection(bson.M{"_id": 1}))
	if err != nil {
		return
	}
	defer cur.Close(ctx)
	for cur.Next(ctx) {
		var page struct {
			ID primitive.ObjectID `bson:"_id"`
		}
		if err := cur.Decode(&page); err != nil {
			continue
		}
		s.hub.Broadcast(page.ID.Hex(), map[string]any{
			"type": "layout", "layoutId": layout.ID.Hex(),
		}, "")
	}
}

func (s *Server) detachLayout(w http.ResponseWriter, r *http.Request) {
	pageID, err := primitive.ObjectIDFromHex(chiURLParam(r, "pageID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid page id")
		return
	}
	page, ok := s.editablePage(w, r, pageID)
	if !ok {
		return
	}
	if page.LayoutID == "" {
		writeJSON(w, http.StatusOK, page)
		return
	}
	page = s.applyLayout(r.Context(), page)
	now := time.Now().UTC()
	rev := page.BlocksRev + 1
	if _, err := s.store.Pages.UpdateByID(r.Context(), page.ID, bson.M{"$set": bson.M{
		"blocks": page.Blocks, "blocksRev": rev, "layoutId": "", "text": textFromBlocks(page.Blocks), "updatedAt": now,
	}}); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not detach layout")
		return
	}
	page.LayoutID = ""
	page.BlocksRev = rev
	page.UpdatedAt = now
	s.hub.Broadcast(page.ID.Hex(), map[string]any{
		"type": "blocks", "pageId": page.ID.Hex(), "clientId": clientID(r),
		"blocks": page.Blocks, "blocksRev": rev, "updatedAt": now,
	}, clientID(r))
	s.broadcastTree(page.WorkspaceID, clientID(r))
	writeJSON(w, http.StatusOK, page)
}
