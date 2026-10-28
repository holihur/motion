package adf

import (
	"strings"

	"github.com/motion/server/internal/model"
)

var adfLanguages = map[string]bool{
	"plain": true, "bash": true, "c": true, "cpp": true, "csharp": true,
	"css": true, "diff": true, "dockerfile": true, "go": true, "graphql": true,
	"html": true, "java": true, "javascript": true, "json": true, "jsx": true,
	"kotlin": true, "less": true, "lua": true, "makefile": true, "markdown": true,
	"objectivec": true, "perl": true, "php": true, "powershell": true, "python": true,
	"r": true, "ruby": true, "rust": true, "sass": true, "scala": true, "scss": true,
	"shell": true, "sql": true, "swift": true, "typescript": true, "tsx": true,
	"xml": true, "yaml": true,
}

func text(value string, marks ...string) map[string]any {
	node := map[string]any{"type": "text", "text": value}
	if len(marks) > 0 {
		items := make([]map[string]any, 0, len(marks))
		for _, mark := range marks {
			items = append(items, map[string]any{"type": mark})
		}
		node["marks"] = items
	}
	return node
}

func paragraph(value string) map[string]any {
	return map[string]any{"type": "paragraph", "content": []any{text(value)}}
}

func listItem(value string) map[string]any {
	return map[string]any{"type": "listItem", "content": []any{paragraph(value)}}
}

func tableCell(value string, header bool) map[string]any {
	kind := "tableCell"
	if header {
		kind = "tableHeader"
	}
	return map[string]any{"type": kind, "attrs": map[string]any{}, "content": []any{paragraph(value)}}
}

// Document converts a Motion page into Atlassian Document Format (ADF).
func Document(page model.Page) map[string]any {
	content := make([]any, 0, len(page.Blocks))
	for _, block := range page.Blocks {
		content = append(content, blockNode(block)...)
	}
	if len(content) == 0 {
		content = append(content, paragraph(""))
	}
	return map[string]any{
		"version": 1, "type": "doc", "content": content,
	}
}

func blockNode(block model.Block) []any {
	switch block.Type {
	case "heading1", "toggleHeading1":
		return []any{map[string]any{"type": "heading", "attrs": map[string]any{"level": 1}, "content": []any{text(block.Text)}}}
	case "heading2", "toggleHeading2":
		return []any{map[string]any{"type": "heading", "attrs": map[string]any{"level": 2}, "content": []any{text(block.Text)}}}
	case "heading3", "toggleHeading3":
		return []any{map[string]any{"type": "heading", "attrs": map[string]any{"level": 3}, "content": []any{text(block.Text)}}}
	case "bulleted":
		return []any{map[string]any{"type": "bulletList", "content": []any{listItem(block.Text)}}}
	case "numbered":
		return []any{map[string]any{"type": "orderedList", "content": []any{listItem(block.Text)}}}
	case "todo":
		state := "TODO"
		if block.Checked {
			state = "DONE"
		}
		return []any{map[string]any{"type": "taskList", "attrs": map[string]any{"localId": block.ID}, "content": []any{
			map[string]any{"type": "taskItem", "attrs": map[string]any{"localId": block.ID, "state": state}, "content": []any{text(block.Text)}},
		}}}
	case "quote":
		return []any{map[string]any{"type": "blockquote", "content": []any{paragraph(block.Text)}}}
	case "callout":
		return []any{map[string]any{"type": "panel", "attrs": map[string]any{"panelType": "info"}, "content": []any{paragraph("💡 " + block.Text)}}}
	case "code":
		language := strings.ToLower(strings.TrimSpace(block.Language))
		if !adfLanguages[language] {
			language = "plain"
		}
		return []any{map[string]any{"type": "codeBlock", "attrs": map[string]any{"language": language}, "content": []any{text(block.Text)}}}
	case "divider":
		return []any{map[string]any{"type": "rule"}}
	case "image":
		if block.URL == "" {
			return nil
		}
		return []any{map[string]any{"type": "mediaSingle", "attrs": map[string]any{"layout": "center"}, "content": []any{
			map[string]any{"type": "media", "attrs": map[string]any{"type": "external", "url": block.URL}},
		}}}
	case "table", "gantt", "chart", "columns":
		if block.Table == nil || len(block.Table.Columns) == 0 {
			return nil
		}
		rows := make([]any, 0, len(block.Table.Rows)+1)
		header := make([]any, 0, len(block.Table.Columns))
		for _, column := range block.Table.Columns {
			header = append(header, tableCell(column, true))
		}
		rows = append(rows, map[string]any{"type": "tableRow", "content": header})
		for _, row := range block.Table.Rows {
			cells := make([]any, 0, len(block.Table.Columns))
			for index := range block.Table.Columns {
				value := ""
				if index < len(row) {
					value = row[index]
				}
				cells = append(cells, tableCell(value, false))
			}
			rows = append(rows, map[string]any{"type": "tableRow", "content": cells})
		}
		return []any{map[string]any{"type": "table", "content": rows}}
	case "diagram", "equation":
		return []any{map[string]any{"type": "codeBlock", "attrs": map[string]any{"language": "plain"}, "content": []any{text(block.Text)}}}
	case "pageLink":
		return []any{map[string]any{"type": "paragraph", "content": []any{text("🔗 " + block.Text)}}}
	case "bookmark", "video", "embed", "file":
		if block.URL == "" {
			return []any{paragraph(block.Text)}
		}
		label := block.Text
		if label == "" {
			label = block.URL
		}
		return []any{map[string]any{"type": "paragraph", "content": []any{map[string]any{
			"type": "text", "text": label, "marks": []any{map[string]any{"type": "link", "attrs": map[string]any{"href": block.URL}}},
		}}}}
	case "password":
		return []any{paragraph("🔒 " + block.Text)}
	case "toggle":
		return []any{map[string]any{"type": "expand", "attrs": map[string]any{"title": block.Text}, "content": []any{paragraph("")}}}
	case "breadcrumb":
		return []any{paragraph("📍 " + block.Text)}
	default:
		return []any{paragraph(block.Text)}
	}
}
