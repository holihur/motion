package staticpublish

import (
	"fmt"
	"html"
	"net/url"
	"regexp"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/motion/server/internal/model"
)

var slugPattern = regexp.MustCompile(`[^a-z0-9]+`)

// Slug makes a stable, readable file name from a page title.
func Slug(title string, id primitive.ObjectID) string {
	value := strings.ToLower(strings.TrimSpace(title))
	value = slugPattern.ReplaceAllString(value, "-")
	value = strings.Trim(value, "-")
	if value == "" {
		value = "page-" + id.Hex()[:8]
	}
	if len(value) > 60 {
		value = strings.Trim(value[:60], "-")
	}
	return value
}

type Site struct {
	RootID      primitive.ObjectID
	Pages       []model.Page
	PublicBase  string
	GeneratedAt time.Time
}

type pageFile struct {
	path string
	html string
}

// Render builds an index.html for the root page and one file per descendant.
func Render(rootID primitive.ObjectID, pages []model.Page, publicBase string) (map[string][]byte, error) {
	base := strings.TrimRight(strings.TrimSpace(publicBase), "/")
	byID := make(map[string]model.Page, len(pages))
	children := make(map[string][]model.Page)
	for _, page := range pages {
		byID[page.ID.Hex()] = page
		if page.ParentID != nil {
			children[page.ParentID.Hex()] = append(children[page.ParentID.Hex()], page)
		}
	}
	root, ok := byID[rootID.Hex()]
	if !ok {
		return nil, fmt.Errorf("page not found")
	}

	order := make([]model.Page, 0, len(pages))
	visited := map[string]bool{}
	var walk func(page model.Page)
	walk = func(page model.Page) {
		if visited[page.ID.Hex()] {
			return
		}
		visited[page.ID.Hex()] = true
		order = append(order, page)
		for _, child := range children[page.ID.Hex()] {
			walk(child)
		}
	}
	walk(root)

	used := map[string]bool{}
	files := make(map[string]string, len(order))
	for index, page := range order {
		slug := "index"
		if index > 0 {
			slug = Slug(page.Title, page.ID)
			baseSlug := slug
			for suffix := 2; used[slug]; suffix++ {
				slug = fmt.Sprintf("%s-%d", baseSlug, suffix)
			}
			used[slug] = true
		}
		files[page.ID.Hex()] = slug + ".html"
	}
	out := make(map[string][]byte, len(order))
	for _, page := range order {
		file := files[page.ID.Hex()]
		out[file] = []byte(renderPage(page, children[page.ID.Hex()], files, base))
	}
	return out, nil
}

func renderPage(page model.Page, childPages []model.Page, files map[string]string, base string) string {
	var body strings.Builder
	for _, block := range page.Blocks {
		body.WriteString(renderBlock(block, files, base))
	}
	var childList strings.Builder
	if len(childPages) > 0 {
		childList.WriteString(`<nav class="children"><h2>Pages in this section</h2><ul>`)
		for _, child := range childPages {
			href := files[child.ID.Hex()]
			if href == "" {
				continue
			}
			childList.WriteString(`<li><a href="` + html.EscapeString(href) + `">` + iconHTML(child.Icon) + ` ` + html.EscapeString(titleOf(child)) + `</a></li>`)
		}
		childList.WriteString(`</ul></nav>`)
	}
	title := titleOf(page)
	return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>` + html.EscapeString(title) + `</title>
<meta name="generator" content="Motion">
<style>` + siteCSS + `</style>
</head>
<body>
<main>
<header class="page-head">
<div class="icon">` + iconHTML(page.Icon) + `</div>
<h1>` + html.EscapeString(title) + `</h1>
<div class="meta">Updated ` + page.UpdatedAt.UTC().Format("January 2, 2006") + `</div>
</header>
<article>
` + body.String() + `
</article>
` + childList.String() + `
<footer>Published with Motion · ` + time.Now().UTC().Format("2006-01-02") + `</footer>
</main>
</body>
</html>`
}

func titleOf(page model.Page) string {
	if strings.TrimSpace(page.Title) == "" {
		return "Untitled"
	}
	return page.Title
}

func iconHTML(icon string) string {
	if strings.TrimSpace(icon) == "" {
		return "📄"
	}
	return html.EscapeString(icon)
}

func escapeLines(text string) string {
	return strings.ReplaceAll(html.EscapeString(text), "\n", "<br>")
}

func safeURL(value, base string) string {
	value = strings.TrimSpace(value)
	if value == "" {
		return "#"
	}
	if strings.HasPrefix(value, "/") {
		if base != "" {
			return base + value
		}
		return value
	}
	parsed, err := url.Parse(value)
	if err != nil || (parsed.Scheme != "http" && parsed.Scheme != "https" && parsed.Scheme != "mailto") {
		return "#"
	}
	return parsed.String()
}

func pageHref(id string, files map[string]string, base string) string {
	if file := files[id]; file != "" {
		return file
	}
	if base != "" {
		return base + "/page/" + id
	}
	return "#"
}

func renderBlock(block model.Block, files map[string]string, base string) string {
	text := escapeLines(block.Text)
	switch block.Type {
	case "heading1":
		return `<h1>` + text + `</h1>`
	case "heading2", "toggleHeading2":
		return `<h2>` + text + `</h2>`
	case "heading3", "toggleHeading3":
		return `<h3>` + text + `</h3>`
	case "toggleHeading1":
		return `<h1>` + text + `</h1>`
	case "bulleted":
		return `<ul><li>` + text + `</li></ul>`
	case "numbered":
		return `<ol><li>` + text + `</li></ol>`
	case "todo":
		check := ""
		if block.Checked {
			check = " checked"
		}
		return `<div class="todo"><input type="checkbox" disabled` + check + `> <span>` + text + `</span></div>`
	case "quote":
		return `<blockquote>` + text + `</blockquote>`
	case "callout":
		return `<div class="callout">💡 <div>` + text + `</div></div>`
	case "code":
		lang := html.EscapeString(block.Language)
		return `<pre><code class="language-` + lang + `">` + html.EscapeString(block.Text) + `</code></pre>`
	case "divider":
		return `<hr>`
	case "image":
		if block.URL == "" {
			return ""
		}
		return `<figure><img src="` + html.EscapeString(safeURL(block.URL, base)) + `" alt="` + html.EscapeString(block.Caption) + `" loading="lazy">` + caption(block.Caption) + `</figure>`
	case "table":
		return renderTable(block.Table, base)
	case "diagram":
		return `<pre class="diagram">` + html.EscapeString(block.Text) + `</pre>`
	case "equation":
		return `<pre class="equation">` + html.EscapeString(block.Text) + `</pre>`
	case "gantt", "chart", "columns":
		return renderTable(block.Table, base)
	case "pageLink":
		return `<p><a class="page-link" href="` + html.EscapeString(pageHref(block.URL, files, base)) + `">🔗 ` + text + `</a></p>`
	case "bookmark", "video", "embed", "file":
		return `<p><a class="embed-link" href="` + html.EscapeString(safeURL(block.URL, base)) + `">` + text + `</a></p>`
	case "password":
		return `<div class="locked">🔒 ` + text + ` <small>(encrypted in Motion)</small></div>`
	case "breadcrumb":
		return `<p class="breadcrumb">📍 ` + text + `</p>`
	case "toggle":
		return `<details class="toggle"><summary>` + text + `</summary><div class="toggle-body">Collapsed content is available in Motion.</div></details>`
	case "paragraph", "":
		return `<p>` + text + `</p>`
	default:
		return `<p>` + text + `</p>`
	}
}

func caption(value string) string {
	if strings.TrimSpace(value) == "" {
		return ""
	}
	return `<figcaption>` + html.EscapeString(value) + `</figcaption>`
}

func renderTable(table *model.TableData, base string) string {
	if table == nil || len(table.Columns) == 0 {
		return ""
	}
	var b strings.Builder
	b.WriteString(`<table><thead><tr>`)
	for _, column := range table.Columns {
		b.WriteString(`<th>` + html.EscapeString(column) + `</th>`)
	}
	b.WriteString(`</tr></thead><tbody>`)
	for _, row := range table.Rows {
		b.WriteString(`<tr>`)
		for index := range table.Columns {
			cell := ""
			if index < len(row) {
				cell = row[index]
			}
			b.WriteString(`<td>` + escapeLines(cell) + `</td>`)
		}
		b.WriteString(`</tr>`)
	}
	b.WriteString(`</tbody></table>`)
	return b.String()
}

const siteCSS = `
:root{color-scheme:light dark;--fg:#1f2937;--muted:#6b7280;--bg:#ffffff;--card:#f8fafc;--border:#e5e7eb;--brand:#0ea5e9}
@media(prefers-color-scheme:dark){:root{--fg:#e5e7eb;--muted:#9ca3af;--bg:#0f172a;--card:#111c33;--border:#26344d;--brand:#38bdf8}}
*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--fg);font:16px/1.7 ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif}
main{max-width:780px;margin:0 auto;padding:56px 24px 80px}.page-head .icon{font-size:42px;line-height:1}.page-head h1{font-size:40px;line-height:1.15;letter-spacing:-.025em;margin:8px 0}
.meta{color:var(--muted);font-size:13px;margin-bottom:36px}article h1{font-size:30px;margin:32px 0 12px}article h2{font-size:24px;margin:28px 0 10px}article h3{font-size:19px;margin:22px 0 8px}
p{margin:10px 0}blockquote{border-left:3px solid var(--border);margin:16px 0;padding:2px 18px;color:var(--muted)}
pre{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:14px;overflow:auto;font-size:13px;line-height:1.6}code{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
table{border-collapse:collapse;width:100%;margin:18px 0;font-size:14px}th,td{border:1px solid var(--border);padding:8px 10px;text-align:left}th{background:var(--card)}
img{max-width:100%;height:auto;border-radius:10px}figure{margin:18px 0}figcaption{text-align:center;color:var(--muted);font-size:12px;margin-top:6px}
.callout{background:var(--card);border:1px solid var(--border);border-radius:10px;padding:12px 14px;margin:16px 0;display:flex;gap:10px}
.todo{display:flex;gap:8px;margin:8px 0}.todo input{margin-top:6px}.todo input:checked+span{color:var(--muted);text-decoration:line-through}
.locked{background:var(--card);border:1px dashed var(--border);border-radius:10px;padding:12px 14px;color:var(--muted)}
.page-link,.embed-link{color:var(--brand);text-decoration:none}.page-link:hover,.embed-link:hover{text-decoration:underline}
.breadcrumb{color:var(--muted);font-size:13px}.toggle summary{cursor:pointer;font-weight:600}
.children{margin-top:48px;border-top:1px solid var(--border);padding-top:20px}.children h2{font-size:15px;color:var(--muted);text-transform:uppercase;letter-spacing:.08em}
.children ul{list-style:none;padding:0;display:flex;flex-wrap:wrap;gap:8px}.children a{display:inline-block;border:1px solid var(--border);border-radius:999px;padding:6px 12px;color:inherit;text-decoration:none;font-size:14px}.children a:hover{background:var(--card)}
footer{margin-top:60px;color:var(--muted);font-size:12px}hr{border:0;border-top:1px solid var(--border);margin:24px 0}
`
