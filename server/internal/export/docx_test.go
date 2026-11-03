package export

import (
	"archive/zip"
	"bytes"
	"encoding/base64"
	"io"
	"strings"
	"testing"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/motion/server/internal/model"
)

func TestDOCXPreservesInlineFormatting(t *testing.T) {
	rich := `{"root":{"children":[{"type":"paragraph","children":[{"type":"text","text":"go test","format":16},{"type":"text","text":" with "},{"type":"link","url":"https://example.com/docs","children":[{"type":"text","text":"docs","format":1}]}]}]}}`
	page := model.Page{ID: primitive.NewObjectID(), Title: "Rich", Blocks: []model.Block{
		{ID: "1", Type: "paragraph", Text: "go test with docs", Rich: rich},
	}}
	data, err := DOCX(page)
	if err != nil {
		t.Fatal(err)
	}
	archive, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatal(err)
	}
	files := map[string]string{}
	for _, file := range archive.File {
		reader, err := file.Open()
		if err != nil {
			t.Fatal(err)
		}
		content, _ := io.ReadAll(reader)
		_ = reader.Close()
		files[file.Name] = string(content)
	}
	if !strings.Contains(files["word/document.xml"], "Courier New") || !strings.Contains(files["word/document.xml"], "w:hyperlink") {
		t.Fatalf("inline formatting missing: %s", files["word/document.xml"])
	}
	if !strings.Contains(files["word/_rels/document.xml.rels"], "https://example.com/docs") {
		t.Fatalf("hyperlink relationship missing: %s", files["word/_rels/document.xml.rels"])
	}
}

func TestDOCXEmbedsDiagramImages(t *testing.T) {
	png, err := base64.StdEncoding.DecodeString("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=")
	if err != nil {
		t.Fatal(err)
	}
	page := model.Page{ID: primitive.NewObjectID(), Title: "Diagram", Blocks: []model.Block{
		{ID: "diagram-1", Type: "diagram", Text: "flowchart LR\nA-->B"},
	}}
	data, err := DOCX(page, map[string]Diagram{
		"diagram-1": {PNG: png, SVG: []byte(`<svg xmlns="http://www.w3.org/2000/svg" width="120" height="60"></svg>`), Width: 120, Height: 60},
	})
	if err != nil {
		t.Fatal(err)
	}
	archive, err := zip.NewReader(bytes.NewReader(data), int64(len(data)))
	if err != nil {
		t.Fatal(err)
	}
	files := map[string]string{}
	for _, file := range archive.File {
		reader, err := file.Open()
		if err != nil {
			t.Fatal(err)
		}
		content, _ := io.ReadAll(reader)
		_ = reader.Close()
		files[file.Name] = string(content)
	}
	for _, name := range []string{"word/media/diagram1.png", "word/media/diagram2.svg"} {
		if _, ok := files[name]; !ok {
			t.Fatalf("missing embedded diagram part %s", name)
		}
	}
	doc := files["word/document.xml"]
	if !strings.Contains(doc, "<w:drawing>") || !strings.Contains(doc, "svgBlip") {
		t.Fatalf("diagram drawing missing from document: %s", doc)
	}
}
