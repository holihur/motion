package importer

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"
	"time"

	"github.com/motion/server/internal/model"
)

const notionVersion = "2022-06-28"

var notionIDPattern = regexp.MustCompile(`[0-9a-fA-F]{32}|[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}`)

// NormalizeNotionPageID extracts a 32-hex page id from a URL or bare id.
func NormalizeNotionPageID(input string) (string, error) {
	m := notionIDPattern.FindString(strings.TrimSpace(input))
	if m == "" {
		return "", fmt.Errorf("no notion page id found")
	}
	return strings.ReplaceAll(strings.ToLower(m), "-", ""), nil
}

type notionClient struct {
	http  *http.Client
	token string
}

func newNotionClient(token string) *notionClient {
	return &notionClient{http: &http.Client{Timeout: 30 * time.Second}, token: strings.TrimSpace(token)}
}

func (c *notionClient) get(ctx context.Context, path string, out any) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://api.notion.com/v1"+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Notion-Version", notionVersion)
	req.Header.Set("Accept", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden {
		return fmt.Errorf("notion rejected the token (check the integration was shared with this page)")
	}
	if resp.StatusCode == http.StatusNotFound {
		return fmt.Errorf("notion page not found (is it shared with the integration?)")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("notion api error (%d): %s", resp.StatusCode, compactErr(data))
	}
	if out != nil {
		if err := json.Unmarshal(data, out); err != nil {
			return fmt.Errorf("could not parse notion response: %w", err)
		}
	}
	return nil
}

func compactErr(data []byte) string {
	var v struct {
		Message string `json:"message"`
	}
	if json.Unmarshal(data, &v) == nil && v.Message != "" {
		return v.Message
	}
	s := strings.TrimSpace(string(data))
	if len(s) > 200 {
		s = s[:200]
	}
	if s == "" {
		return "unknown error"
	}
	return s
}

type notionRich struct {
	Type        string `json:"type"`
	PlainText   string `json:"plain_text"`
	Href        string `json:"href"`
	Annotations struct {
		Bold          bool `json:"bold"`
		Italic        bool `json:"italic"`
		Strikethrough bool `json:"strikethrough"`
		Underline     bool `json:"underline"`
		Code          bool `json:"code"`
	} `json:"annotations"`
	Text struct {
		Content string `json:"content"`
		Link    *struct {
			URL string `json:"url"`
		} `json:"link"`
	} `json:"text"`
	Equation struct {
		Expression string `json:"expression"`
	} `json:"equation"`
}

func notionInline(spans []notionRich) string {
	var sb strings.Builder
	for _, s := range spans {
		content := s.PlainText
		if s.Type == "equation" {
			content = "$" + s.Equation.Expression + "$"
		} else if s.Type == "text" && s.Text.Content != "" {
			content = s.Text.Content
		}
		if content == "" {
			continue
		}
		link := s.Href
		if s.Type == "text" && s.Text.Link != nil && s.Text.Link.URL != "" {
			link = s.Text.Link.URL
		}
		a := s.Annotations
		switch {
		case a.Code:
			content = "`" + strings.ReplaceAll(content, "`", "") + "`"
		case a.Bold && a.Italic:
			content = "***" + content + "***"
		case a.Bold:
			content = "**" + content + "**"
		case a.Italic:
			content = "*" + content + "*"
		}
		if a.Strikethrough && !a.Code {
			content = "~~" + content + "~~"
		}
		if link != "" && !a.Code {
			content = "[" + content + "](" + link + ")"
		}
		sb.WriteString(content)
	}
	return sb.String()
}

type notionBlock struct {
	ID          string `json:"id"`
	Type        string `json:"type"`
	HasChildren bool   `json:"has_children"`
	Paragraph   *struct {
		Rich []notionRich `json:"rich_text"`
	} `json:"paragraph"`
	Heading1 *struct {
		Rich []notionRich `json:"rich_text"`
	} `json:"heading_1"`
	Heading2 *struct {
		Rich []notionRich `json:"rich_text"`
	} `json:"heading_2"`
	Heading3 *struct {
		Rich []notionRich `json:"rich_text"`
	} `json:"heading_3"`
	Bulleted *struct {
		Rich []notionRich `json:"rich_text"`
	} `json:"bulleted_list_item"`
	Numbered *struct {
		Rich []notionRich `json:"rich_text"`
	} `json:"numbered_list_item"`
	ToDo *struct {
		Rich    []notionRich `json:"rich_text"`
		Checked bool         `json:"checked"`
	} `json:"to_do"`
	Toggle *struct {
		Rich []notionRich `json:"rich_text"`
	} `json:"toggleable_heading_1"`
	Toggle2 *struct {
		Rich []notionRich `json:"rich_text"`
	} `json:"toggleable_heading_2"`
	Toggle3 *struct {
		Rich []notionRich `json:"rich_text"`
	} `json:"toggleable_heading_3"`
	ToggleBlock *struct {
		Rich []notionRich `json:"rich_text"`
	} `json:"toggle"`
	Quote *struct {
		Rich []notionRich `json:"rich_text"`
	} `json:"quote"`
	Callout *struct {
		Rich []notionRich `json:"rich_text"`
		Icon *struct {
			Emoji string `json:"emoji"`
		} `json:"icon"`
	} `json:"callout"`
	Code *struct {
		Rich     []notionRich `json:"rich_text"`
		Language string       `json:"language"`
	} `json:"code"`
	Image *struct {
		Caption []notionRich `json:"caption"`
		Type    string       `json:"type"`
		File    *struct {
			URL string `json:"url"`
		} `json:"file"`
		External *struct {
			URL string `json:"url"`
		} `json:"external"`
	} `json:"image"`
	Bookmark *struct {
		URL     string       `json:"url"`
		Caption []notionRich `json:"caption"`
	} `json:"bookmark"`
	ChildPage *struct {
		Title string `json:"title"`
	} `json:"child_page"`
	TableRow *struct {
		Cells [][]notionRich `json:"cells"`
	} `json:"table_row"`
}

type notionChildrenResp struct {
	Results    []notionBlock `json:"results"`
	HasMore    bool          `json:"has_more"`
	NextCursor string        `json:"next_cursor"`
}

func notionCodeLang(lang string) string {
	l := strings.ToLower(strings.TrimSpace(lang))
	if l == "" || l == "plain text" {
		return "auto"
	}
	return l
}

// ImportNotionPage pulls a Notion page (and nested blocks) into Motion blocks.
func ImportNotionPage(ctx context.Context, token, pageInput string) (Result, error) {
	pageID, err := NormalizeNotionPageID(pageInput)
	if err != nil {
		return Result{}, err
	}
	client := newNotionClient(token)
	if strings.TrimSpace(token) == "" {
		return Result{}, fmt.Errorf("notion token is required")
	}

	title := "Notion 导入"
	var pageResp struct {
		Properties map[string]struct {
			ID    string `json:"id"`
			Type  string `json:"type"`
			Title []notionRich `json:"title"`
		} `json:"properties"`
	}
	if err := client.get(ctx, "/pages/"+pageID, &pageResp); err == nil {
		for _, prop := range pageResp.Properties {
			if prop.Type == "title" && len(prop.Title) > 0 {
				if t := notionInline(prop.Title); t != "" {
					title = t
				}
				break
			}
		}
	}

	var out []model.Block
	var walk func(blockID string, indent, depth int) error
	walk = func(blockID string, indent, depth int) error {
		if depth > 6 || len(out) >= 1000 {
			return nil
		}
		cursor := ""
		for {
			path := "/blocks/" + blockID + "/children?page_size=100"
			if cursor != "" {
				path += "&start_cursor=" + cursor
			}
			var resp notionChildrenResp
			if err := client.get(ctx, path, &resp); err != nil {
				return err
			}
			// Notion tables: collect consecutive table_row children into one table block.
			var tableCols []string
			var tableRows [][]string
			flushTable := func() {
				if len(tableRows) > 0 {
					out = appendCapped(out, tableBlock(tableCols, tableRows, indent))
					tableCols = nil
					tableRows = nil
				}
			}
			for _, b := range resp.Results {
				if b.Type != "table_row" {
					flushTable()
				}
				switch b.Type {
				case "paragraph":
					if b.Paragraph != nil {
						if t := notionInline(b.Paragraph.Rich); t != "" {
							out = appendCapped(out, withIndent(B("paragraph", t), indent))
						}
					}
				case "heading_1":
					if b.Heading1 != nil {
						out = appendCapped(out, withIndent(B("heading1", notionInline(b.Heading1.Rich)), indent))
					}
				case "heading_2":
					if b.Heading2 != nil {
						out = appendCapped(out, withIndent(B("heading2", notionInline(b.Heading2.Rich)), indent))
					}
				case "heading_3":
					if b.Heading3 != nil {
						out = appendCapped(out, withIndent(B("heading3", notionInline(b.Heading3.Rich)), indent))
					}
				case "bulleted_list_item":
					if b.Bulleted != nil {
						out = appendCapped(out, withIndent(B("bulleted", notionInline(b.Bulleted.Rich)), indent))
					}
				case "numbered_list_item":
					if b.Numbered != nil {
						out = appendCapped(out, withIndent(B("numbered", notionInline(b.Numbered.Rich)), indent))
					}
				case "to_do":
					if b.ToDo != nil {
						out = appendCapped(out, withIndent(checked(B("todo", notionInline(b.ToDo.Rich)), b.ToDo.Checked), indent))
					}
				case "toggleable_heading_1":
					if b.Toggle != nil {
						out = appendCapped(out, withIndent(B("toggleHeading1", notionInline(b.Toggle.Rich)), indent))
					}
				case "toggleable_heading_2":
					if b.Toggle2 != nil {
						out = appendCapped(out, withIndent(B("toggleHeading2", notionInline(b.Toggle2.Rich)), indent))
					}
				case "toggleable_heading_3":
					if b.Toggle3 != nil {
						out = appendCapped(out, withIndent(B("toggleHeading3", notionInline(b.Toggle3.Rich)), indent))
					}
				case "toggle":
					if b.ToggleBlock != nil {
						out = appendCapped(out, withIndent(B("toggle", notionInline(b.ToggleBlock.Rich)), indent))
					}
				case "quote":
					if b.Quote != nil {
						if t := notionInline(b.Quote.Rich); t != "" {
							out = appendCapped(out, withIndent(B("quote", t), indent))
						}
					}
				case "callout":
					if b.Callout != nil {
						t := notionInline(b.Callout.Rich)
						if b.Callout.Icon != nil && b.Callout.Icon.Emoji != "" {
							t = b.Callout.Icon.Emoji + " " + t
						}
						if t != "" {
							call := B("callout", t)
							call.Color = "amber"
							out = appendCapped(out, withIndent(call, indent))
						}
					}
				case "code":
					if b.Code != nil {
						out = appendCapped(out, withIndent(withLang(B("code", notionCodeText(b.Code.Rich)), notionCodeLang(b.Code.Language)), indent))
					}
				case "divider":
					out = appendCapped(out, withIndent(B("divider", ""), indent))
				case "image":
					if b.Image != nil {
						url := ""
						if b.Image.File != nil {
							url = b.Image.File.URL
						} else if b.Image.External != nil {
							url = b.Image.External.URL
						}
						if url != "" {
							out = appendCapped(out, withIndent(withURL(B("image", ""), url, notionInline(b.Image.Caption)), indent))
						}
					}
				case "bookmark":
					if b.Bookmark != nil && b.Bookmark.URL != "" {
						t := notionInline(b.Bookmark.Caption)
						if t == "" {
							t = b.Bookmark.URL
						}
						out = appendCapped(out, withIndent(withURL(B("bookmark", t), b.Bookmark.URL, ""), indent))
					}
				case "table":
					// children are table_row; recurse with a marker indent
					if b.HasChildren {
						if err := walk(b.ID, indent, depth+1); err != nil {
							return err
						}
					}
				case "table_row":
					if b.TableRow != nil {
						row := make([]string, len(b.TableRow.Cells))
						for i, cell := range b.TableRow.Cells {
							row[i] = notionInline(cell)
						}
						if len(tableCols) == 0 {
							tableCols = make([]string, len(row))
							for i := range tableCols {
								tableCols[i] = fmt.Sprintf("列 %d", i+1)
							}
						}
						tableRows = append(tableRows, row)
					}
				case "child_page":
					if b.ChildPage != nil {
						out = appendCapped(out, withIndent(B("heading3", "📄 "+b.ChildPage.Title), indent))
						out = appendCapped(out, withIndent(B("paragraph", "（子页面，请单独导入）"), indent))
					}
				case "column_list", "column", "synced_block":
					// transparent containers
				default:
					// skip embeds/video/etc silently to avoid noise
				}
				if b.HasChildren && b.Type != "table" && b.Type != "child_page" {
					next := indent
					switch b.Type {
					case "toggle", "toggleable_heading_1", "toggleable_heading_2", "toggleable_heading_3",
						"bulleted_list_item", "numbered_list_item", "to_do":
						next = indent + 1
					}
					if err := walk(b.ID, next, depth+1); err != nil {
						return err
					}
				}
			}
			flushTable()
			if !resp.HasMore {
				break
			}
			cursor = resp.NextCursor
			if cursor == "" {
				break
			}
		}
		return nil
	}
	if err := walk(pageID, 0, 0); err != nil {
		return Result{}, err
	}
	return Result{Title: title, Blocks: out}, nil
}

// TestNotionToken validates a Notion token via /v1/users/me.
func TestNotionToken(ctx context.Context, token string) error {
	client := newNotionClient(token)
	var out struct {
		Object string `json:"object"`
	}
	return client.get(ctx, "/users/me", &out)
}

func notionCodeText(spans []notionRich) string {
	var sb strings.Builder
	for i, s := range spans {
		if i > 0 {
			sb.WriteString("\n")
		}
		sb.WriteString(s.PlainText)
	}
	return sb.String()
}
