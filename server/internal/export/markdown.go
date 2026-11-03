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
		case "checkbox", "switch":
			numbered = 0
			box := " "
			if b.Checked {
				box = "x"
			}
			sb.WriteString(fmt.Sprintf("%s- [%s] %s\n", indent, box, inline(text)))
		case "radio":
			numbered = 0
			mark := " "
			if b.Checked {
				mark = "x"
			}
			sb.WriteString(fmt.Sprintf("%s- (%s) %s\n", indent, mark, inline(text)))
		case "radioGroup":
			numbered = 0
			sb.WriteString("**" + inline(text) + "**\n")
			if b.Input != nil {
				for _, option := range b.Input.Options {
					mark := " "
					if b.Input.Value == option {
						mark = "x"
					}
					sb.WriteString("- (" + mark + ") " + option + "\n")
				}
			}
			sb.WriteString("\n")
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
		case "curl":
			numbered = 0
			sb.WriteString("```bash\n" + text + "\n```\n\n")
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
		case "poll":
			numbered = 0
			if b.Poll != nil {
				sb.WriteString("**" + b.Poll.Question + "**\n\n")
				total := 0
				for _, opt := range b.Poll.Options {
					total += len(opt.Votes)
				}
				for _, opt := range b.Poll.Options {
					sb.WriteString(fmt.Sprintf("- [ ] %s (%d/%d)\n", opt.Text, len(opt.Votes), total))
				}
				sb.WriteString("\n")
			}
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
		case "layout":
			numbered = 0
			if b.Layout != nil {
				for index, column := range b.Layout.Columns {
					if index > 0 {
						sb.WriteString("\n---\n\n")
					}
					sb.WriteString(renderLayoutMarkdown(column.Blocks))
				}
				sb.WriteString("\n")
			}
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
	for rowIndex := range b.Table.Rows {
		cells := make([]string, len(cols))
		for i := range cols {
			cells[i] = strings.ReplaceAll(b.Table.DisplayCell(rowIndex, i), "|", "\\|")
		}
		sb.WriteString("| " + strings.Join(cells, " | ") + " |\n")
	}
	return sb.String()
}

func renderLayoutMarkdown(blocks []model.Block) string {
	var sb strings.Builder
	for _, block := range blocks {
		switch block.Type {
		case "heading1", "toggleHeading1":
			sb.WriteString("# " + block.Text + "\n\n")
		case "heading2", "toggleHeading2":
			sb.WriteString("## " + block.Text + "\n\n")
		case "heading3", "toggleHeading3":
			sb.WriteString("### " + block.Text + "\n\n")
		case "bulleted":
			sb.WriteString("- " + block.Text + "\n")
		case "numbered":
			sb.WriteString("1. " + block.Text + "\n")
		case "todo":
			box := " "
			if block.Checked {
				box = "x"
			}
			sb.WriteString("- [" + box + "] " + block.Text + "\n")
		case "code", "curl":
			sb.WriteString("```" + block.Language + "\n" + block.Text + "\n```\n\n")
		case "table", "gantt", "chart", "columns":
			sb.WriteString(renderMDTable(block) + "\n")
		case "layout":
			if block.Layout != nil {
				for index, column := range block.Layout.Columns {
					if index > 0 {
						sb.WriteString("\n---\n\n")
					}
					sb.WriteString(renderLayoutMarkdown(column.Blocks))
				}
			}
		default:
			if strings.TrimSpace(block.Text) != "" {
				sb.WriteString(block.Text + "\n\n")
			}
		}
	}
	return sb.String()
}
