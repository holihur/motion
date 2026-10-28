// Package richtext turns Lexical editor state into safe HTML or Markdown for
// exports and published pages. Lexical stores inline marks in Block.Rich.
package richtext

import (
	"encoding/json"
	"html"
	"net/url"
	"strings"
)

type node struct {
	Type     string `json:"type"`
	Text     string `json:"text"`
	URL      string `json:"url"`
	Format   int    `json:"format"`
	Children []node `json:"children"`
}

type state struct {
	Root node `json:"root"`
}

const (
	formatBold          = 1
	formatItalic        = 2
	formatStrikethrough = 4
	formatUnderline     = 8
	formatCode          = 16
)

func parse(rich string) (node, bool) {
	if strings.TrimSpace(rich) == "" {
		return node{}, false
	}
	var value state
	if err := json.Unmarshal([]byte(rich), &value); err != nil {
		return node{}, false
	}
	return value.Root, true
}

func escapeLines(value string) string {
	return strings.ReplaceAll(html.EscapeString(value), "\n", "<br>")
}

func safeHref(value, base string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "#"
	}
	if strings.HasPrefix(value, "/") {
		if base != "" {
			return html.EscapeString(strings.TrimRight(base, "/") + value)
		}
		return html.EscapeString(value)
	}
	parsed, err := url.Parse(value)
	if err != nil {
		return "#"
	}
	scheme := strings.ToLower(parsed.Scheme)
	if scheme != "http" && scheme != "https" && scheme != "mailto" {
		return "#"
	}
	parsed.Scheme = scheme
	return html.EscapeString(parsed.String())
}

func formatText(value string, format int) string {
	content := html.EscapeString(value)
	if format&formatCode != 0 {
		content = "<code>" + content + "</code>"
	}
	if format&formatBold != 0 {
		content = "<strong>" + content + "</strong>"
	}
	if format&formatItalic != 0 {
		content = "<em>" + content + "</em>"
	}
	if format&formatUnderline != 0 {
		content = "<u>" + content + "</u>"
	}
	if format&formatStrikethrough != 0 {
		content = "<s>" + content + "</s>"
	}
	return content
}

func (n node) html(base string) string {
	switch n.Type {
	case "text", "mention":
		return formatText(n.Text, n.Format)
	case "linebreak":
		return "<br>"
	case "link":
		content := n.childrenHTML(base)
		if content == "" {
			content = html.EscapeString(n.URL)
		}
		return `<a href="` + safeHref(n.URL, base) + `">` + content + `</a>`
	default:
		return n.childrenHTML(base)
	}
}

func (n node) childrenHTML(base string) string {
	var out strings.Builder
	for _, child := range n.Children {
		out.WriteString(child.html(base))
	}
	return out.String()
}

// HTML returns inline HTML for a Lexical rich value, falling back to escaped
// plain text when the saved state is absent or malformed.
func HTML(rich, fallback, base string) string {
	root, ok := parse(rich)
	if !ok {
		return escapeLines(fallback)
	}
	var out strings.Builder
	for index, child := range root.Children {
		if index > 0 {
			out.WriteString("<br>")
		}
		out.WriteString(child.html(base))
	}
	if out.Len() == 0 {
		return escapeLines(fallback)
	}
	return out.String()
}

// Markdown is useful for MCP clients and copy/export paths.
func Markdown(rich, fallback string) string {
	root, ok := parse(rich)
	if !ok {
		return fallback
	}
	var out strings.Builder
	for index, child := range root.Children {
		if index > 0 {
			out.WriteString("\n")
		}
		out.WriteString(child.markdown())
	}
	if out.Len() == 0 {
		return fallback
	}
	return out.String()
}

func (n node) markdown() string {
	switch n.Type {
	case "text", "mention":
		return markdownText(n.Text, n.Format)
	case "linebreak":
		return "\n"
	case "link":
		content := n.childrenMarkdown()
		if content == "" {
			content = n.URL
		}
		return "[" + content + "](" + n.URL + ")"
	default:
		return n.childrenMarkdown()
	}
}

func (n node) childrenMarkdown() string {
	var out strings.Builder
	for _, child := range n.Children {
		out.WriteString(child.markdown())
	}
	return out.String()
}

func markdownText(value string, format int) string {
	content := value
	code := format&formatCode != 0
	if code {
		ticks := "`"
		for strings.Contains(content, ticks) {
			ticks += "`"
		}
		content = ticks + content + ticks
	}
	if format&formatBold != 0 {
		content = "**" + content + "**"
	}
	if format&formatItalic != 0 {
		content = "*" + content + "*"
	}
	if format&formatUnderline != 0 {
		content = "<u>" + content + "</u>"
	}
	if format&formatStrikethrough != 0 {
		content = "~~" + content + "~~"
	}
	return content
}
