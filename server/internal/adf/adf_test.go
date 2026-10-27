package adf

import (
	"testing"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/motion/server/internal/model"
)

func TestDocumentConvertsCoreBlocks(t *testing.T) {
	page := model.Page{ID: primitive.NewObjectID(), Title: "Doc", Blocks: []model.Block{
		{ID: "1", Type: "heading1", Text: "Title"},
		{ID: "2", Type: "paragraph", Text: "Body"},
		{ID: "3", Type: "todo", Text: "Task", Checked: true},
	}}
	doc := Document(page)
	if doc["type"] != "doc" {
		t.Fatalf("not an ADF doc: %#v", doc)
	}
	content, ok := doc["content"].([]any)
	if !ok || len(content) != 3 {
		t.Fatalf("unexpected content: %#v", doc["content"])
	}
}
