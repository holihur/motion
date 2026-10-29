package export

import (
	"fmt"
	"strings"

	"github.com/motion/server/internal/model"
)

// Markdown renders a page as Markdown for workspace export / migration.
func Markdown(page model.Page) []byte {
	var sb strings.Builder
	title := strings.TrimSpace(page.Title)
	if title == "" {
		title = "Untitled"
	}
	sb.WriteString("# " + title + "\n\n")
	numbered := 0
	for _, b := range page.Blocks {
		indent := ""
		if b.Indent > 0 {
			indent = strings.Repeat("  ", b.Indent)
		}
		text := b.Text
		switch b.Type {
		case "heading1":
			numbered = 0
			sb.WriteString("# " + text + "\n\n")
		case "heading2":
			numbered = 0
			sb.WriteString("## " + text + "\n\n")
		case "heading3":
			numbered = 0
			sb.WriteString("### " + text + "\n\n")
		case "bulleted":
			numbered = 0
			sb.WriteString(indent + "- " + inline(text) + "\n")
		case "numbered":
			numbered++
			sb.WriteString(fmt.Sprintf("%s%d. %s\n", indent, numbered, inline(text)))
		case "todo":
			numbered = 0
			box := " "
			if b.Checked {
				box = "x"
			}
			sb.WriteString(fmt.Sprintf("%s- [%s] %s\n", indent, box, inline(text)))
		case "quote":
			numbered = 0
			sb.WriteString("> " + inline(text) + "\n\n")
		case "callout":
			numbered = 0
			sb.WriteString("> 💡 " + inline(text) + "\n\n")
		case "code":
			numbered = 0
			lang := strings.TrimSpace(b.Language)
			if lang == "" || lang == "auto" {
				lang = ""
			}
			sb.WriteString("```" + lang + "\n" + text + "\n```\n\n")
		case "divider":
			numbered = 0
			sb.WriteString("\n---\n\n")
		case "image":
			numbered = 0
			caption := b.Caption
			if caption == "" {
				caption = "image"
			}
			sb.WriteString(fmt.Sprintf("![%s](%s)\n\n", caption, b.URL))
		case "bookmark":
			numbered = 0
			t := text
			if t == "" {
				t = b.URL
			}
			sb.WriteString(fmt.Sprintf("[%s](%s)\n\n", t, b.URL))
		case "table":
			numbered = 0
			sb.WriteString(renderMDTable(b) + "\n")
		case "toggle", "toggleHeading1", "toggleHeading2", "toggleHeading3":
			numbered = 0
			sb.WriteString("### " + inline(text) + "\n\n")
		case "paragraph":
			numbered = 0
			if strings.TrimSpace(text) != "" {
				sb.WriteString(inline(text) + "\n\n")
			}
		default:
			if strings.TrimSpace(text) != "" {
				numbered = 0
				sb.WriteString(inline(text) + "\n\n")
			}
		}
	}
	return []byte(sb.String())
}

func inline(s string) string {
	return strings.TrimSpace(s)
}

func renderMDTable(b model.Block) string {
	if b.Table == nil || len(b.Table.Columns) == 0 {
		return ""
	}
	var sb strings.Builder
	cols := b.Table.Columns
	sb.WriteString("| " + strings.Join(cols, " | ") + " |\n")
	seps := make([]string, len(cols))
	for i := range seps {
		seps[i] = "---"
	}
	sb.WriteString("| " + strings.Join(seps, " | ") + " |\n")
	for _, row := range b.Table.Rows {
		cells := make([]string, len(cols))
		for i := range cols {
			if i < len(row) {
				cells[i] = strings.ReplaceAll(row[i], "|", "\\|")
			}
		}
		sb.WriteString("| " + strings.Join(cells, " | ") + " |\n")
	}
	return sb.String()
}
