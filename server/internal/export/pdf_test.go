package export

import (
	"bytes"
	"image"
	"image/color"
	"image/png"
	"strings"
	"testing"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/motion/server/internal/model"
)

func TestTokenizeForWrapSplitsCJK(t *testing.T) {
	tokens := tokenizeForWrap("中文 paragraph")
	want := []string{"中", "文", " ", "paragraph"}
	if len(tokens) != len(want) {
		t.Fatalf("tokens = %#v, want %#v", tokens, want)
	}
	for index := range want {
		if tokens[index] != want[index] {
			t.Fatalf("tokens = %#v, want %#v", tokens, want)
		}
	}
}

func TestNumberedMarkers(t *testing.T) {
	blocks := []model.Block{
		{ID: "a", Type: "numbered", Text: "one"},
		{ID: "b", Type: "numbered", Text: "two"},
		{ID: "c", Type: "numbered", Text: "nested", Indent: 1},
		{ID: "d", Type: "numbered", Text: "back to top"},
		{ID: "e", Type: "paragraph", Text: "break"},
		{ID: "f", Type: "numbered", Text: "reset", Language: "alpha"},
	}
	markers := numberedMarkers(blocks)
	for id, want := range map[string]string{"a": "1.", "b": "2.", "c": "1.", "d": "3.", "f": "a."} {
		if markers[id] != want {
			t.Fatalf("marker %s = %q, want %q", id, markers[id], want)
		}
	}
}

func TestPDFRendersCommonBlocksAndCJK(t *testing.T) {
	page := model.Page{
		ID:    primitive.NewObjectID(),
		Title: "中文导出测试",
		Blocks: []model.Block{
			{ID: "p1", Type: "paragraph", Text: "这是一段没有空格的中文文本，用来验证换行不会溢出页面。"},
			{ID: "t1", Type: "heading2", Text: "待办"},
			{ID: "todo", Type: "todo", Text: "检查 PDF 布局", Checked: true},
			{ID: "code", Type: "code", Text: "func main() {\n\tprintln(\"hello\")\n}"},
			{ID: "callout", Type: "callout", Text: "这是一条提示信息。"},
			{ID: "table", Type: "table", Table: &model.TableData{
				Columns: []string{"项目", "状态", "说明"},
				Rows: [][]string{
					{"布局", "进行中", "中文单元格需要自动换行并且不能溢出"},
					{"导出", "完成", "PDF"},
				},
				Header: true,
				Widths: []float64{120, 100, 260},
			}},
		},
	}
	data, err := PDF(page)
	if err != nil {
		t.Fatalf("PDF: %v", err)
	}
	if !bytes.HasPrefix(data, []byte("%PDF")) {
		t.Fatalf("output is not a PDF: %q", data[:min(len(data), 8)])
	}
	if len(data) < 1000 {
		t.Fatalf("PDF is unexpectedly small: %d bytes", len(data))
	}
}

func TestPDFPaginatesLongPage(t *testing.T) {
	page := model.Page{ID: primitive.NewObjectID(), Title: "Long page"}
	for index := 0; index < 120; index++ {
		page.Blocks = append(page.Blocks, model.Block{
			ID:   primitive.NewObjectID().Hex(),
			Type: "paragraph",
			Text: strings.Repeat("A calm document should paginate cleanly. ", 4),
		})
	}
	data, err := PDF(page)
	if err != nil {
		t.Fatalf("PDF: %v", err)
	}
	if !bytes.HasPrefix(data, []byte("%PDF")) {
		t.Fatal("output is not a PDF")
	}
}

func TestPDFWithCoverAndContents(t *testing.T) {
	page := model.Page{ID: primitive.NewObjectID(), Title: "Cover and contents", Blocks: []model.Block{
		{ID: "h1", Type: "heading1", Text: "First section"},
		{ID: "p1", Type: "paragraph", Text: "Body text."},
		{ID: "h2", Type: "heading2", Text: "Second section"},
		{ID: "p2", Type: "paragraph", Text: "More body text."},
	}}
	data, err := PDFWithOptions(page, PDFOptions{Cover: true, Contents: true, Paper: "letter", Landscape: true})
	if err != nil {
		t.Fatalf("PDFWithOptions: %v", err)
	}
	if !bytes.HasPrefix(data, []byte("%PDF")) {
		t.Fatal("output is not a PDF")
	}
}

func TestPDFEmbedsImageAsset(t *testing.T) {
	img := image.NewRGBA(image.Rect(0, 0, 16, 16))
	for y := 0; y < 16; y++ {
		for x := 0; x < 16; x++ {
			img.Set(x, y, color.RGBA{R: 124, G: 92, B: 255, A: 255})
		}
	}
	var pngData bytes.Buffer
	if err := png.Encode(&pngData, img); err != nil {
		t.Fatal(err)
	}
	page := model.Page{ID: primitive.NewObjectID(), Title: "Image", Blocks: []model.Block{
		{ID: "img", Type: "image", URL: "https://example.com/a.png", Caption: "A caption"},
	}}
	data, err := PDF(page, map[string]Diagram{"img": {PNG: pngData.Bytes(), Width: 16, Height: 16}})
	if err != nil {
		t.Fatalf("PDF: %v", err)
	}
	if !bytes.HasPrefix(data, []byte("%PDF")) {
		t.Fatal("output is not a PDF")
	}
}

func TestPDFRendersQRCodeAndBarcode(t *testing.T) {
	page := model.Page{ID: primitive.NewObjectID(), Title: "Codes", Blocks: []model.Block{
		{ID: "qr", Type: "qrcode", Text: "https://motion.app", Language: "280", Color: "#7c5cff", Caption: "Website"},
		{ID: "qr-batch", Type: "qrcode", Text: "https://a.example\nhttps://b.example", Caption: "Batch"},
		{ID: "bar", Type: "barcode", Text: "ABC-123456", Language: "CODE128", Caption: "Code 128"},
		{ID: "ean", Type: "barcode", Text: "123456789012", Language: "EAN13"},
		{ID: "unsupported", Type: "barcode", Text: "123", Language: "pharmacode"},
	}}
	data, err := PDF(page)
	if err != nil {
		t.Fatalf("PDF: %v", err)
	}
	if !bytes.HasPrefix(data, []byte("%PDF")) {
		t.Fatal("output is not a PDF")
	}
}

func TestPDFRendersDataBlocks(t *testing.T) {
	page := model.Page{ID: primitive.NewObjectID(), Title: "Data blocks", Blocks: []model.Block{
		{ID: "db", Type: "database", Database: &model.DatabaseData{
			Columns: []model.DatabaseColumn{{ID: "name", Name: "Name", Width: 160}, {ID: "status", Name: "Status", Width: 100}},
			Rows:    []map[string]string{{"name": "A", "status": "Open"}, {"name": "B", "status": "Done"}},
		}},
		{ID: "chart", Type: "chart", Text: "Trend", Table: &model.TableData{Columns: []string{"Month", "Value"}, Rows: [][]string{{"Jan", "3"}, {"Feb", "8"}}, Header: true}},
		{ID: "gantt", Type: "gantt", Table: &model.TableData{Columns: []string{"Task", "Start", "End", "Progress"}, Rows: [][]string{{"Build", "2026-11-01", "2026-11-05", "50"}}, Header: true}},
		{ID: "cal", Type: "calendar", Table: &model.TableData{Columns: []string{"Event", "Start", "End", "Color"}, Rows: [][]string{{"Review", "2026-11-18", "2026-11-18", "violet"}}, Header: true}},
		{ID: "poll", Type: "poll", Poll: &model.PollData{Question: "Pick one", Options: []model.PollOption{{ID: "a", Text: "A", Votes: []string{"u1"}}, {ID: "b", Text: "B"}}}},
		{ID: "map", Type: "map", Map: &model.MapData{Lat: 31.23, Lng: 121.47, Zoom: 12, Provider: "osm"}},
		{ID: "link", Type: "bookmark", Text: "Motion", URL: "https://github.com/holihur/motion"},
		{ID: "json", Type: "jsonVisual", Text: `{"a":1,"b":[2,3]}`},
		{ID: "toc", Type: "toc", Text: "Contents"},
		{ID: "h1", Type: "heading1", Text: "Section"},
	}}
	data, err := PDF(page)
	if err != nil {
		t.Fatalf("PDF: %v", err)
	}
	if !bytes.HasPrefix(data, []byte("%PDF")) {
		t.Fatal("output is not a PDF")
	}
}
