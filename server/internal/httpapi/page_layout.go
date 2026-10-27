package httpapi

import (
	"context"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

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
