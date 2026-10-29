package docagent

import (
	"regexp"
	"strconv"
	"strings"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/motion/server/internal/model"
	"github.com/motion/server/internal/richtext"
)

func textFromBlocks(blocks []model.Block) string {
	parts := make([]string, 0, len(blocks)*2)
	for _, block := range blocks {
		parts = append(parts, strings.ToLower(block.Text))
		if block.Table != nil {
			parts = append(parts, strings.ToLower(strings.Join(block.Table.Columns, " ")))
			for _, row := range block.Table.Rows {
				parts = append(parts, strings.ToLower(strings.Join(row, " ")))
			}
		}
	}
	return strings.Join(parts, "\n")
}

func markdownFor(page model.Page) string {
	var builder strings.Builder
	builder.WriteString("# " + strings.TrimSpace(page.Title) + "\n\n")
	for _, block := range page.Blocks {
		inline := richtext.Markdown(block.Rich, block.Text)
		switch block.Type {
		case "heading1":
			builder.WriteString("# " + inline + "\n\n")
		case "heading2":
			builder.WriteString("## " + inline + "\n\n")
		case "heading3":
			builder.WriteString("### " + inline + "\n\n")
		case "bulleted":
			builder.WriteString("- " + inline + "\n")
		case "numbered":
			builder.WriteString("1. " + inline + "\n")
		case "todo":
			check := " "
			if block.Checked {
				check = "x"
			}
			builder.WriteString("- [" + check + "] " + inline + "\n")
		case "quote":
			builder.WriteString("> " + inline + "\n\n")
		case "callout":
			builder.WriteString("> 💡 " + inline + "\n\n")
		case "code":
			builder.WriteString("```" + block.Language + "\n" + block.Text + "\n```\n\n")
		case "diagram":
			builder.WriteString("```mermaid\n" + block.Text + "\n```\n\n")
		case "table":
			if block.Table != nil {
				builder.WriteString("| " + strings.Join(block.Table.Columns, " | ") + " |\n")
				builder.WriteString("| " + strings.Repeat("--- | ", len(block.Table.Columns)) + "\n")
				for _, row := range block.Table.Rows {
					builder.WriteString("| " + strings.Join(row, " | ") + " |\n")
				}
				builder.WriteString("\n")
			}
		case "divider":
			builder.WriteString("---\n\n")
		case "image":
			builder.WriteString("![image](" + block.URL + ")\n\n")
		case "bookmark", "video", "embed", "file":
			label := strings.TrimSpace(block.Text)
			if label == "" {
				label = block.URL
			}
			builder.WriteString("[" + label + "](" + block.URL + ")\n\n")
		case "equation":
			builder.WriteString("$$\n" + block.Text + "\n$$\n\n")
		case "toc":
			builder.WriteString("**Table of contents**\n\n")
		case "gantt", "chart":
			if block.Text != "" {
				builder.WriteString("**" + block.Text + "**\n\n")
			}
			if block.Table != nil {
				builder.WriteString("| " + strings.Join(block.Table.Columns, " | ") + " |\n")
				builder.WriteString("| " + strings.Repeat("--- | ", len(block.Table.Columns)) + "\n")
				for _, row := range block.Table.Rows {
					builder.WriteString("| " + strings.Join(row, " | ") + " |\n")
				}
				builder.WriteString("\n")
			}
		case "qrcode", "barcode":
			builder.WriteString("[" + block.Type + "] " + block.Text + "\n\n")
		case "form":
			if block.Form != nil {
				builder.WriteString("**" + block.Form.Title + "**\n\n")
				for _, field := range block.Form.Fields {
					builder.WriteString("- " + field.Label + " (" + field.Type + ")\n")
				}
				builder.WriteString("\n")
			}
		case "pageLink":
			builder.WriteString("[" + inline + "](/page/" + block.URL + ")\n\n")
		case "toggle", "toggleHeading1", "toggleHeading2", "toggleHeading3":
			prefix := "> "
			if block.Type == "toggleHeading1" {
				prefix = "# "
			}
			if block.Type == "toggleHeading2" {
				prefix = "## "
			}
			if block.Type == "toggleHeading3" {
				prefix = "### "
			}
			builder.WriteString(prefix + block.Text + "\n\n")
		case "breadcrumb", "columns":
			if block.Table != nil {
				for _, row := range block.Table.Rows {
					builder.WriteString(strings.Join(row, " | ") + "\n\n")
				}
			}
		case "password":
			builder.WriteString("🔒 " + block.Text + "\n\n")
		default:
			builder.WriteString(block.Text + "\n\n")
		}
	}
	return builder.String()
}

func truncateAgentsMarkdown(page model.Page, limit int) string {
	full := markdownFor(page)
	if len([]rune(full)) <= limit {
		return full
	}
	var builder strings.Builder
	builder.WriteString("# " + strings.TrimSpace(page.Title) + "\n\n")
	reserved := "\n… [truncated X blocks]\n"
	for i, block := range page.Blocks {
		var seg strings.Builder
		inline := richtext.Markdown(block.Rich, block.Text)
		switch block.Type {
		case "heading1":
			seg.WriteString("# " + inline + "\n\n")
		case "heading2":
			seg.WriteString("## " + inline + "\n\n")
		case "heading3":
			seg.WriteString("### " + inline + "\n\n")
		case "bulleted":
			seg.WriteString("- " + inline + "\n")
		case "numbered":
			seg.WriteString("1. " + inline + "\n")
		case "todo":
			check := " "
			if block.Checked {
				check = "x"
			}
			seg.WriteString("- [" + check + "] " + inline + "\n")
		case "quote":
			seg.WriteString("> " + inline + "\n\n")
		case "callout":
			seg.WriteString("> 💡 " + inline + "\n\n")
		case "code":
			seg.WriteString("```" + block.Language + "\n" + block.Text + "\n```\n\n")
		case "divider":
			seg.WriteString("---\n\n")
		default:
			seg.WriteString(inline + "\n\n")
		}
		segment := seg.String()
		if len([]rune(builder.String()))+len([]rune(segment))+len([]rune(reserved)) > limit {
			remaining := len(page.Blocks) - i
			builder.WriteString("\n… [truncated " + strconv.Itoa(remaining) + " blocks]\n")
			break
		}
		builder.WriteString(segment)
	}
	result := builder.String()
	if len([]rune(result)) > limit {
		runes := []rune(result)
		return string(runes[:limit]) + "\n… (truncated)"
	}
	return result
}

func parseMarkdown(markdown string) []model.Block {
	lines := strings.Split(strings.ReplaceAll(markdown, "\r\n", "\n"), "\n")
	blocks := make([]model.Block, 0, len(lines))
	inCode := false
	codeLanguage := "plain text"
	var codeLines []string
	flushCode := func() {
		text := strings.Join(codeLines, "\n")
		if strings.TrimSpace(text) != "" {
			blocks = append(blocks, model.Block{ID: primitive.NewObjectID().Hex(), Type: "code", Text: text, Language: codeLanguage})
		}
		codeLines = nil
		codeLanguage = "plain text"
	}
	numbered := regexp.MustCompile(`^(\d+)\.\s+(.*)$`)
	for _, raw := range lines {
		trimmed := strings.TrimSpace(raw)
		if strings.HasPrefix(trimmed, "```") {
			if inCode {
				inCode = false
				flushCode()
			} else {
				inCode = true
				codeLanguage = strings.TrimSpace(strings.TrimPrefix(trimmed, "```"))
				if codeLanguage == "" {
					codeLanguage = "plain text"
				}
			}
			continue
		}
		if inCode {
			codeLines = append(codeLines, raw)
			continue
		}
		line := strings.TrimRight(raw, " ")
		switch {
		case strings.HasPrefix(line, "### "):
			blocks = append(blocks, model.Block{ID: primitive.NewObjectID().Hex(), Type: "heading3", Text: strings.TrimSpace(line[4:])})
		case strings.HasPrefix(line, "## "):
			blocks = append(blocks, model.Block{ID: primitive.NewObjectID().Hex(), Type: "heading2", Text: strings.TrimSpace(line[3:])})
		case strings.HasPrefix(line, "# "):
			blocks = append(blocks, model.Block{ID: primitive.NewObjectID().Hex(), Type: "heading1", Text: strings.TrimSpace(line[2:])})
		case strings.HasPrefix(line, "- [ ] "):
			blocks = append(blocks, model.Block{ID: primitive.NewObjectID().Hex(), Type: "todo", Text: strings.TrimSpace(line[6:])})
		case strings.HasPrefix(line, "- [x] "), strings.HasPrefix(line, "- [X] "):
			blocks = append(blocks, model.Block{ID: primitive.NewObjectID().Hex(), Type: "todo", Text: strings.TrimSpace(line[6:]), Checked: true})
		case strings.HasPrefix(line, "- "), strings.HasPrefix(line, "* "):
			blocks = append(blocks, model.Block{ID: primitive.NewObjectID().Hex(), Type: "bulleted", Text: strings.TrimSpace(line[2:])})
		case strings.HasPrefix(line, "> "):
			blocks = append(blocks, model.Block{ID: primitive.NewObjectID().Hex(), Type: "quote", Text: strings.TrimSpace(line[2:])})
		case line == "---":
			blocks = append(blocks, model.Block{ID: primitive.NewObjectID().Hex(), Type: "divider"})
		case trimmed == "":
			continue
		default:
			if match := numbered.FindStringSubmatch(line); match != nil {
				blocks = append(blocks, model.Block{ID: primitive.NewObjectID().Hex(), Type: "numbered", Text: strings.TrimSpace(match[2])})
			} else {
				blocks = append(blocks, model.Block{ID: primitive.NewObjectID().Hex(), Type: "paragraph", Text: strings.TrimSpace(line)})
			}
		}
	}
	if inCode {
		flushCode()
	}
	if len(blocks) == 0 {
		blocks = append(blocks, model.Block{ID: primitive.NewObjectID().Hex(), Type: "paragraph", Text: ""})
	}
	return blocks
}
