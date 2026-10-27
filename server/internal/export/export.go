package export

import (
	"bytes"
	_ "embed"
	"fmt"
	"html"
	"strings"

	"github.com/signintech/gopdf"

	"github.com/motion/server/internal/model"
	"github.com/motion/server/internal/staticpublish"
)

//go:embed NotoSansSC-Regular.ttf
var pdfFont []byte

func HTML(page model.Page) ([]byte, error) {
	files, err := staticpublish.Render(page.ID, []model.Page{page}, "")
	if err != nil {
		return nil, err
	}
	return files["index.html"], nil
}

func PDF(page model.Page) ([]byte, error) {
	pdf := gopdf.GoPdf{}
	pdf.Start(gopdf.Config{PageSize: *gopdf.PageSizeA4})
	pdf.AddPage()
	if err := pdf.AddTTFFontData("noto", pdfFont); err != nil {
		return nil, fmt.Errorf("could not load PDF font: %w", err)
	}
	if err := pdf.SetFont("noto", "", 11); err != nil {
		return nil, err
	}
	r := pdfRenderer{pdf: &pdf, x: 48, y: 58, width: gopdf.PageSizeA4.W - 96, bottom: gopdf.PageSizeA4.H - 48}
	r.heading(page.Title, 24)
	for _, block := range page.Blocks {
		r.block(block)
	}
	var out bytes.Buffer
	if err := pdf.Write(&out); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

type pdfRenderer struct {
	pdf    *gopdf.GoPdf
	x, y   float64
	width  float64
	bottom float64
}

func (r *pdfRenderer) ensure(height float64) {
	if r.y+height <= r.bottom {
		return
	}
	r.pdf.AddPage()
	r.y = 58
}

func (r *pdfRenderer) setFont(size float64) {
	_ = r.pdf.SetFont("noto", "", size)
}

func (r *pdfRenderer) lines(text string, size, lineHeight, indent float64) []string {
	r.setFont(size)
	lines, err := r.pdf.SplitTextWithWordWrap(strings.TrimRight(text, "\n"), r.width-indent)
	if err != nil || len(lines) == 0 {
		return []string{text}
	}
	return lines
}

func (r *pdfRenderer) text(text string, size, lineHeight, indent float64) {
	for _, line := range r.lines(text, size, lineHeight, indent) {
		r.ensure(lineHeight)
		r.pdf.SetXY(r.x+indent, r.y)
		_ = r.pdf.Text(line)
		r.y += lineHeight
	}
}

func (r *pdfRenderer) heading(text string, size float64) {
	if strings.TrimSpace(text) == "" {
		return
	}
	lineHeight := size * 1.35
	r.ensure(lineHeight + 6)
	r.y += 4
	r.setFont(size)
	r.pdf.SetXY(r.x, r.y)
	_ = r.pdf.Text(text)
	r.y += lineHeight
	r.setFont(11)
}

func (r *pdfRenderer) block(block model.Block) {
	switch block.Type {
	case "heading1", "toggleHeading1":
		r.heading(block.Text, 21)
	case "heading2", "toggleHeading2":
		r.heading(block.Text, 17)
	case "heading3", "toggleHeading3":
		r.heading(block.Text, 14)
	case "bulleted":
		r.text("• "+block.Text, 11, 17, 10)
	case "numbered":
		r.text("1. "+block.Text, 11, 17, 10)
	case "todo":
		mark := "☐"
		if block.Checked {
			mark = "☑"
		}
		r.text(mark+" "+block.Text, 11, 17, 10)
	case "quote":
		r.text("“"+block.Text+"”", 10.5, 17, 16)
	case "callout":
		r.text("💡 "+block.Text, 10.5, 17, 10)
	case "code":
		r.code(block.Text)
	case "divider":
		r.ensure(14)
		r.y += 6
		r.pdf.SetLineWidth(0.6)
		r.pdf.Line(r.x, r.y, r.x+r.width, r.y)
		r.y += 8
	case "image":
		r.text("[Image] "+(block.Caption+" "+block.URL), 9.5, 15, 10)
	case "table", "gantt", "chart", "columns":
		if block.Table != nil {
			var rows []string
			rows = append(rows, strings.Join(block.Table.Columns, "  |  "))
			for _, row := range block.Table.Rows {
				rows = append(rows, strings.Join(row, "  |  "))
			}
			r.text(strings.Join(rows, "\n"), 9.5, 15, 4)
		}
	case "equation", "diagram":
		r.code(block.Text)
	case "pageLink", "bookmark", "video", "embed", "file":
		r.text(block.Text+"  "+block.URL, 10.5, 16, 6)
	case "password":
		r.text("🔒 "+block.Text, 10.5, 16, 6)
	case "toggle":
		r.text("▸ "+block.Text, 11, 17, 4)
	case "breadcrumb":
		r.text(block.Text, 9, 14, 2)
	default:
		r.text(block.Text, 11, 18, 0)
	}
	r.y += 4
}

func (r *pdfRenderer) code(text string) {
	lines := strings.Split(text, "\n")
	lineHeight := 13.0
	r.setFont(9)
	for _, line := range lines {
		for _, wrapped := range r.lines(line, 9, lineHeight, 12) {
			r.ensure(lineHeight)
			r.pdf.SetXY(r.x+8, r.y)
			_ = r.pdf.Text(wrapped)
			r.y += lineHeight
		}
	}
}

func escape(value string) string { return html.EscapeString(value) }
