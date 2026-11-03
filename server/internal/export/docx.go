package export

import (
	"archive/zip"
	"bytes"
	"fmt"
	"html"
	"strings"

	"github.com/motion/server/internal/model"
	"github.com/motion/server/internal/richtext"
)

func DOCX(page model.Page, diagrams ...map[string]Diagram) ([]byte, error) {
	assets := firstDiagramMap(diagrams)
	media := newDocxMedia()
	var body strings.Builder
	body.WriteString(docxParagraph(page.Title, 42, true, ""))
	links := newDocxLinks()
	for _, block := range page.Blocks {
		switch block.Type {
		case "heading1", "toggleHeading1":
			body.WriteString(docxRichParagraph(block, "", 32, true, "", links))
		case "heading2", "toggleHeading2":
			body.WriteString(docxRichParagraph(block, "", 26, true, "", links))
		case "heading3", "toggleHeading3":
			body.WriteString(docxRichParagraph(block, "", 22, true, "", links))
		case "bulleted":
			body.WriteString(docxRichParagraph(block, "• ", 0, false, "", links))
		case "numbered":
			body.WriteString(docxRichParagraph(block, "1. ", 0, false, "", links))
		case "todo":
			mark := "☐"
			if block.Checked {
				mark = "☑"
			}
			body.WriteString(docxRichParagraph(block, mark+" ", 0, false, "", links))
		case "checkbox", "switch":
			mark := "☐"
			if block.Checked {
				mark = "☑"
			}
			body.WriteString(docxRichParagraph(block, mark+" ", 0, false, "", links))
		case "radio":
			mark := "○"
			if block.Checked {
				mark = "◉"
			}
			body.WriteString(docxRichParagraph(block, mark+" ", 0, false, "", links))
		case "radioGroup":
			body.WriteString(docxParagraph(block.Text, 0, true, ""))
			if block.Input != nil {
				for _, option := range block.Input.Options {
					mark := "○"
					if block.Input.Value == option {
						mark = "◉"
					}
					body.WriteString(docxParagraph(mark+" "+option, 0, false, ""))
				}
			}
		case "quote":
			body.WriteString(docxRichParagraph(block, "“", 0, false, "F3F4F6", links))
		case "callout":
			body.WriteString(docxRichParagraph(block, "💡 ", 0, false, "E0F2FE", links))
		case "code", "curl":
			body.WriteString(docxParagraph(block.Text, 18, false, "F3F4F6", "Courier New"))
		case "divider":
			body.WriteString(docxParagraph("────────────────", 0, false, ""))
		case "image":
			body.WriteString(docxParagraph("[Image] "+block.Caption+" "+block.URL, 0, false, ""))
		case "table", "gantt", "chart", "columns":
			if block.Table != nil {
				body.WriteString(docxTable(block))
			}
		case "diagram":
			if asset, ok := assets[block.ID]; ok && (len(asset.PNG) > 0 || len(asset.SVG) > 0) {
				body.WriteString(media.drawing(asset))
			} else {
				body.WriteString(docxParagraph(block.Text, 18, false, "F3F4F6", "Courier New"))
			}
		case "equation":
			body.WriteString(docxParagraph(block.Text, 18, false, "F3F4F6", "Courier New"))
		case "pageLink", "bookmark", "video", "embed", "file":
			body.WriteString(docxParagraph(block.Text+"  "+block.URL, 0, false, ""))
		case "password":
			body.WriteString(docxParagraph("🔒 "+block.Text, 0, false, ""))
		case "toggle":
			body.WriteString(docxParagraph("▸ "+block.Text, 0, true, ""))
		case "form":
			if block.Form != nil {
				body.WriteString(docxParagraph(block.Form.Title, 28, true, ""))
				if block.Form.Description != "" {
					body.WriteString(docxParagraph(block.Form.Description, 0, false, ""))
				}
				for _, field := range block.Form.Fields {
					mark := ""
					if field.Required {
						mark = " *"
					}
					body.WriteString(docxParagraph("☐ "+field.Label+mark, 0, false, ""))
				}
			}
		case "qrcode", "barcode":
			body.WriteString(docxParagraph("["+block.Type+"] "+block.Text, 0, false, ""))
		default:
			body.WriteString(docxRichParagraph(block, "", 0, false, "", links))
		}
	}
	document := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture" xmlns:asvg="http://schemas.microsoft.com/office/drawing/2016/SVG/main"><w:body>` + body.String() + `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`
	files := map[string]string{
		"[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Default Extension="png" ContentType="image/png"/><Default Extension="svg" ContentType="image/svg+xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
		"_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
		"word/document.xml":            document,
		"word/_rels/document.xml.rels": links.rels(media),
		"word/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Noto Sans SC"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="character" w:styleId="Hyperlink"><w:name w:val="Hyperlink"/><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style></w:styles>`,
	}
	var out bytes.Buffer
	archive := zip.NewWriter(&out)
	for name, content := range files {
		writer, err := archive.Create(name)
		if err != nil {
			return nil, err
		}
		if _, err := writer.Write([]byte(content)); err != nil {
			return nil, err
		}
	}
	for _, entry := range media.entries {
		writer, err := archive.Create("word/" + entry.path)
		if err != nil {
			return nil, err
		}
		if _, err := writer.Write(entry.data); err != nil {
			return nil, err
		}
	}
	if err := archive.Close(); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

type docxLinks struct {
	ids  map[string]string
	list []string
}

func newDocxLinks() *docxLinks {
	return &docxLinks{ids: map[string]string{}}
}

func (l *docxLinks) id(url string) string {
	if id, ok := l.ids[url]; ok {
		return id
	}
	id := fmt.Sprintf("rId%d", len(l.list)+1)
	l.ids[url] = id
	l.list = append(l.list, url)
	return id
}

func (l *docxLinks) rels(media *docxMedia) string {
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`)
	for index, url := range l.list {
		b.WriteString(fmt.Sprintf(`<Relationship Id="rId%d" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="%s" TargetMode="External"/>`, index+1, html.EscapeString(url)))
	}
	if media != nil {
		for _, entry := range media.entries {
			b.WriteString(`<Relationship Id="` + entry.relID + `" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="` + entry.path + `"/>`)
		}
	}
	b.WriteString(`</Relationships>`)
	return b.String()
}

func docxRun(run richtext.Run, size int, bold bool) string {
	props := strings.Builder{}
	if size > 0 {
		props.WriteString(fmt.Sprintf(`<w:sz w:val="%d"/><w:szCs w:val="%d"/>`, size, size))
	}
	if bold || run.Bold {
		props.WriteString("<w:b/>")
	}
	if run.Italic {
		props.WriteString("<w:i/>")
	}
	if run.Underline {
		props.WriteString("<w:u w:val=\"single\"/>")
	}
	if run.Strike {
		props.WriteString("<w:strike/>")
	}
	if run.Code {
		props.WriteString(`<w:rFonts w:ascii="Courier New" w:hAnsi="Courier New"/><w:shd w:val="clear" w:color="auto" w:fill="F3F4F6"/>`)
	}
	if run.URL != "" {
		props.WriteString(`<w:rStyle w:val="Hyperlink"/>`)
	}
	text := html.EscapeString(run.Text)
	text = strings.ReplaceAll(text, "\n", `</w:t><w:br/><w:t xml:space="preserve">`)
	return `<w:r><w:rPr>` + props.String() + `</w:rPr><w:t xml:space="preserve">` + text + `</w:t></w:r>`
}

func docxRichParagraph(block model.Block, prefix string, size int, bold bool, shade string, links *docxLinks) string {
	runs := richtext.Runs(block.Rich, block.Text)
	if prefix != "" {
		runs = append([]richtext.Run{{Text: prefix}}, runs...)
	}
	if len(runs) == 0 {
		return docxParagraph(" ", size, bold, shade)
	}
	props := strings.Builder{}
	if size > 0 {
		props.WriteString(fmt.Sprintf(`<w:sz w:val="%d"/><w:szCs w:val="%d"/>`, size, size))
	}
	if bold {
		props.WriteString("<w:b/>")
	}
	if shade != "" {
		props.WriteString(`<w:shd w:val="clear" w:color="auto" w:fill="` + shade + `"/>`)
	}
	var body strings.Builder
	for _, run := range runs {
		r := docxRun(run, size, bold)
		if run.URL != "" {
			body.WriteString(`<w:hyperlink r:id="` + links.id(run.URL) + `">` + r + `</w:hyperlink>`)
		} else {
			body.WriteString(r)
		}
	}
	return `<w:p><w:pPr><w:spacing w:after="120"/>` + props.String() + `</w:pPr>` + body.String() + `</w:p>`
}

func docxParagraph(text string, size int, bold bool, shade string, font ...string) string {
	if text == "" {
		text = " "
	}
	props := strings.Builder{}
	if size > 0 {
		props.WriteString(fmt.Sprintf(`<w:sz w:val="%d"/><w:szCs w:val="%d"/>`, size, size))
	}
	if bold {
		props.WriteString("<w:b/>")
	}
	if len(font) > 0 {
		props.WriteString(fmt.Sprintf(`<w:rFonts w:ascii="%s" w:hAnsi="%s"/>`, html.EscapeString(font[0]), html.EscapeString(font[0])))
	}
	shading := ""
	if shade != "" {
		shading = `<w:shd w:val="clear" w:color="auto" w:fill="` + shade + `"/>`
	}
	escaped := html.EscapeString(text)
	escaped = strings.ReplaceAll(escaped, "\n", "</w:t><w:br/><w:t xml:space=\"preserve\">")
	return `<w:p><w:pPr><w:spacing w:after="120"/>` + shading + `</w:pPr><w:r><w:rPr>` + props.String() + `</w:rPr><w:t xml:space="preserve">` + escaped + `</w:t></w:r></w:p>`
}

func docxTable(block model.Block) string {
	if block.Table == nil || len(block.Table.Columns) == 0 {
		return ""
	}
	var out strings.Builder
	out.WriteString(`<w:tbl><w:tblPr><w:tblW w:w="0" w:type="auto"/><w:tblBorders>`)
	for _, edge := range []string{"top", "left", "bottom", "right", "insideH", "insideV"} {
		out.WriteString(`<w:` + edge + ` w:val="single" w:sz="4" w:color="D1D5DB"/>`)
	}
	out.WriteString(`</w:tblBorders></w:tblPr><w:tr>`)
	for _, column := range block.Table.Columns {
		out.WriteString(`<w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="F3F4F6"/></w:tcPr>` + docxParagraph(column, 20, true, "") + `</w:tc>`)
	}
	out.WriteString(`</w:tr>`)
	for rowIndex := range block.Table.Rows {
		out.WriteString(`<w:tr>`)
		for index := range block.Table.Columns {
			out.WriteString(`<w:tc>` + docxParagraph(block.Table.DisplayCell(rowIndex, index), 20, false, "") + `</w:tc>`)
		}
		out.WriteString(`</w:tr>`)
	}
	out.WriteString(`</w:tbl>`)
	return out.String()
}

type docxMediaEntry struct {
	relID string
	path  string
	data  []byte
}

type docxMedia struct {
	entries  []docxMediaEntry
	nextID   int
	drawings int
}

func newDocxMedia() *docxMedia {
	return &docxMedia{}
}

func (m *docxMedia) add(ext string, data []byte) (relID, path string) {
	m.nextID++
	relID = fmt.Sprintf("img%d", m.nextID)
	path = fmt.Sprintf("media/diagram%d.%s", m.nextID, ext)
	m.entries = append(m.entries, docxMediaEntry{relID: relID, path: path, data: data})
	return relID, path
}

func (m *docxMedia) drawing(asset Diagram) string {
	var pngRel, svgRel string
	if len(asset.PNG) > 0 {
		pngRel, _ = m.add("png", asset.PNG)
	}
	if len(asset.SVG) > 0 {
		svgRel, _ = m.add("svg", asset.SVG)
	}
	if pngRel == "" {
		pngRel = svgRel
	}
	width, height := asset.Width, asset.Height
	if width <= 0 || height <= 0 {
		width, height = 800, 600
	}
	if width > 600 {
		height = height * 600 / width
		width = 600
	}
	cx, cy := int64(width)*9525, int64(height)*9525
	m.drawings++
	id := m.drawings
	blip := `<a:blip r:embed="` + pngRel + `">`
	if svgRel != "" && svgRel != pngRel {
		blip += `<a:extLst><a:ext uri="{96DAC541-7B7A-43D3-8B79-37D633B846F1}"><asvg:svgBlip r:embed="` + svgRel + `"/></a:ext></a:extLst>`
	}
	blip += `</a:blip>`
	return `<w:p><w:pPr><w:spacing w:after="160"/></w:pPr><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="` + fmt.Sprint(cx) + `" cy="` + fmt.Sprint(cy) + `"/><wp:effectExtent l="0" t="0" r="0" b="0"/><wp:docPr id="` + fmt.Sprint(id) + `" name="Diagram ` + fmt.Sprint(id) + `"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="0" name="diagram"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill>` + blip + `<a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="` + fmt.Sprint(cx) + `" cy="` + fmt.Sprint(cy) + `"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
}
