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

func DOCX(page model.Page) ([]byte, error) {
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
		case "quote":
			body.WriteString(docxRichParagraph(block, "“", 0, false, "F3F4F6", links))
		case "callout":
			body.WriteString(docxRichParagraph(block, "💡 ", 0, false, "E0F2FE", links))
		case "code":
			body.WriteString(docxParagraph(block.Text, 18, false, "F3F4F6", "Courier New"))
		case "divider":
			body.WriteString(docxParagraph("────────────────", 0, false, ""))
		case "image":
			body.WriteString(docxParagraph("[Image] "+block.Caption+" "+block.URL, 0, false, ""))
		case "table", "gantt", "chart", "columns":
			if block.Table != nil {
				body.WriteString(docxTable(block))
			}
		case "equation", "diagram":
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
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><w:body>` + body.String() + `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`
	files := map[string]string{
		"[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
		"_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
		"word/document.xml":            document,
		"word/_rels/document.xml.rels": links.rels(),
		"word/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Noto Sans SC"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults><w:style w:type="character" w:styleId="Hyperlink"><w:rPr><w:color w:val="0563C1"/><w:u w:val="single"/></w:rPr></w:style></w:styles>`,
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

func (l *docxLinks) rels() string {
	var b strings.Builder
	b.WriteString(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">`)
	for index, url := range l.list {
		b.WriteString(fmt.Sprintf(`<Relationship Id="rId%d" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/hyperlink" Target="%s" TargetMode="External"/>`, index+1, html.EscapeString(url)))
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
	for _, row := range block.Table.Rows {
		out.WriteString(`<w:tr>`)
		for index := range block.Table.Columns {
			value := ""
			if index < len(row) {
				value = row[index]
			}
			out.WriteString(`<w:tc>` + docxParagraph(value, 20, false, "") + `</w:tc>`)
		}
		out.WriteString(`</w:tr>`)
	}
	out.WriteString(`</w:tbl>`)
	return out.String()
}
