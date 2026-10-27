package staticpublish

import (
	"strings"
	"testing"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/motion/server/internal/model"
)

func TestRenderIncludesChildrenAndEscapesContent(t *testing.T) {
	root := model.Page{ID: primitive.NewObjectID(), Title: "Docs", Blocks: []model.Block{
		{ID: "1", Type: "heading1", Text: "Hello"},
		{ID: "2", Type: "paragraph", Text: "<script>alert(1)</script>"},
	}}
	childID := root.ID
	child := model.Page{ID: primitive.NewObjectID(), ParentID: &childID, Title: "Child page"}
	files, err := Render(root.ID, []model.Page{root, child}, "https://example.com")
	if err != nil {
		t.Fatal(err)
	}
	if len(files) != 2 {
		t.Fatalf("got %d files", len(files))
	}
	index := string(files["index.html"])
	if !strings.Contains(index, "Child page") || strings.Contains(index, "<script>alert(1)</script>") {
		t.Fatalf("unexpected index: %s", index)
	}
}
