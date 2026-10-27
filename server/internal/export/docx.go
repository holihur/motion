package export

import (
	"archive/zip"
	"bytes"
	"fmt"
	"html"
	"strings"

	"github.com/motion/server/internal/model"
)

func DOCX(page model.Page) ([]byte, error) {
	var body strings.Builder
	body.WriteString(docxParagraph(page.Title, 42, true, ""))
	for _, block := range page.Blocks {
		switch block.Type {
		case "heading1", "toggleHeading1":
			body.WriteString(docxParagraph(block.Text, 32, true, ""))
		case "heading2", "toggleHeading2":
			body.WriteString(docxParagraph(block.Text, 26, true, ""))
		case "heading3", "toggleHeading3":
			body.WriteString(docxParagraph(block.Text, 22, true, ""))
		case "bulleted":
			body.WriteString(docxParagraph("• "+block.Text, 0, false, ""))
		case "numbered":
			body.WriteString(docxParagraph("1. "+block.Text, 0, false, ""))
		case "todo":
			mark := "☐"
			if block.Checked {
				mark = "☑"
			}
			body.WriteString(docxParagraph(mark+" "+block.Text, 0, false, ""))
		case "quote":
			body.WriteString(docxParagraph("“"+block.Text+"”", 0, false, "F3F4F6"))
		case "callout":
			body.WriteString(docxParagraph("💡 "+block.Text, 0, false, "E0F2FE"))
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
		default:
			body.WriteString(docxParagraph(block.Text, 0, false, ""))
		}
	}
	document := `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>` + body.String() + `<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134"/></w:sectPr></w:body></w:document>`
	files := map[string]string{
		"[Content_Types].xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
		"_rels/.rels": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
		"word/document.xml": document,
		"word/styles.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:eastAsia="Noto Sans SC"/><w:sz w:val="22"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`,
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
