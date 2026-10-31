package importer

import (
	"bytes"
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

// NormalizeFeishuDocID extracts a doc id from a link or bare id.
func NormalizeFeishuDocID(input string) (string, error) {
	s := strings.TrimSpace(input)
	if m := regexp.MustCompile(`/(docx|wiki|docs)/([A-Za-z0-9]+)`).FindStringSubmatch(s); m != nil {
		return m[2], nil
	}
	if m := regexp.MustCompile(`[A-Za-z0-9]{20,}`).FindString(s); m != "" {
		return m, nil
	}
	return "", fmt.Errorf("no feishu document id found")
}

type feishuClient struct {
	http      *http.Client
	appID     string
	appSecret string
	token     string
	tokenExp  time.Time
}

func newFeishuClient(appID, appSecret string) *feishuClient {
	return &feishuClient{http: &http.Client{Timeout: 30 * time.Second}, appID: appID, appSecret: appSecret}
}

func (c *feishuClient) auth(ctx context.Context) error {
	if c.token != "" && time.Now().Before(c.tokenExp) {
		return nil
	}
	body, _ := json.Marshal(map[string]string{"app_id": c.appID, "app_secret": c.appSecret})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, "https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("could not reach feishu: %w", err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	var v struct {
		Code              int    `json:"code"`
		Msg               string `json:"msg"`
		TenantAccessToken string `json:"tenant_access_token"`
		Expire            int    `json:"expire"`
	}
	if err := json.Unmarshal(data, &v); err != nil {
		return fmt.Errorf("could not parse feishu auth response: %w", err)
	}
	if v.Code != 0 {
		return fmt.Errorf("feishu auth failed: %s", v.Msg)
	}
	c.token = v.TenantAccessToken
	c.tokenExp = time.Now().Add(time.Duration(v.Expire-300) * time.Second)
	return nil
}


func (c *feishuClient) get(ctx context.Context, path string, out any) error {
	if err := c.auth(ctx); err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://open.feishu.cn"+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	var envelope struct {
		Code int             `json:"code"`
		Msg  string          `json:"msg"`
		Data json.RawMessage `json:"data"`
	}
	if err := json.Unmarshal(data, &envelope); err != nil {
		return fmt.Errorf("could not parse feishu response: %w", err)
	}
	if envelope.Code != 0 {
		return fmt.Errorf("feishu api error: %s", envelope.Msg)
	}
	if out != nil && len(envelope.Data) > 0 {
		if err := json.Unmarshal(envelope.Data, out); err != nil {
			return fmt.Errorf("could not parse feishu data: %w", err)
		}
	}
	return nil
}

type feishuTextElement struct {
	TextRun *struct {
		Content string `json:"content"`
		Style   *struct {
			Bold          bool `json:"bold"`
			Italic        bool `json:"italic"`
			Strikethrough bool `json:"strikethrough"`
			Underline     bool `json:"underline"`
			InlineCode    bool `json:"inline_code"`
			Link          *struct {
				URL string `json:"url"`
			} `json:"link"`
		} `json:"text_element_style"`
	} `json:"text_run"`
	MentionUser *struct {
		UserID string `json:"user_id"`
	} `json:"mention_user"`
	Equation *struct {
		Content string `json:"content"`
	} `json:"equation_symbol"`
}

type feishuBlock struct {
	BlockID   string `json:"block_id"`
	ParentID  string `json:"parent_id"`
	BlockType int    `json:"block_type"`
	Text      *struct {
		Elements []feishuTextElement `json:"elements"`
		Style    *struct {
			Align int `json:"align"`
		} `json:"style"`
	} `json:"text"`
	Heading1 *struct {
		Elements []feishuTextElement `json:"elements"`
	} `json:"heading1"`
	Heading2 *struct {
		Elements []feishuTextElement `json:"elements"`
	} `json:"heading2"`
	Heading3 *struct {
		Elements []feishuTextElement `json:"elements"`
	} `json:"heading3"`
	Heading4 *struct {
		Elements []feishuTextElement `json:"elements"`
	} `json:"heading4"`
	Heading5 *struct {
		Elements []feishuTextElement `json:"elements"`
	} `json:"heading5"`
	Bullet *struct {
		Elements []feishuTextElement `json:"elements"`
	} `json:"bullet"`
	Ordered *struct {
		Elements []feishuTextElement `json:"elements"`
	} `json:"ordered"`
	Code *struct {
		Elements []feishuTextElement `json:"elements"`
		Style    *struct {
			Language int `json:"language"`
		} `json:"style"`
	} `json:"code"`
	Quote *struct {
		Elements []feishuTextElement `json:"elements"`
	} `json:"quote"`
	Todo *struct {
		Elements []feishuTextElement `json:"elements"`
		Style    *struct {
			Done bool `json:"done"`
		} `json:"style"`
	} `json:"todo"`
	TableCell *struct {
		RowIdx int `json:"row_index"`
		ColIdx int `json:"col_index"`
	} `json:"table_cell"`
}

func feishuInline(elements []feishuTextElement) string {
	var sb strings.Builder
	for _, el := range elements {
		switch {
		case el.TextRun != nil:
			content := el.TextRun.Content
			st := el.TextRun.Style
			if st != nil {
				switch {
				case st.InlineCode:
					content = "`" + strings.ReplaceAll(content, "`", "") + "`"
				case st.Bold && st.Italic:
					content = "***" + content + "***"
				case st.Bold:
					content = "**" + content + "**"
				case st.Italic:
					content = "*" + content + "*"
				}
				if st.Strikethrough && !st.InlineCode {
					content = "~~" + content + "~~"
				}
				if st.Link != nil && st.Link.URL != "" && !st.InlineCode {
					content = "[" + content + "](" + st.Link.URL + ")"
				}
			}
			sb.WriteString(content)
		case el.MentionUser != nil:
			sb.WriteString("@成员")
		case el.Equation != nil:
			sb.WriteString("$" + el.Equation.Content + "$")
		}
	}
	return sb.String()
}

func feishuCodeLang(n int) string {
	switch n {
	case 1:
		return "plain"
	case 2:
		return "abap"
	case 3:
		return "ada"
	case 4:
		return "apache"
	case 5:
		return "apex"
	case 6:
		return "applescript"
	case 7:
		return "c"
	case 8:
		return "cpp"
	case 9:
		return "csharp"
	case 10:
		return "css"
	case 11:
		return "dart"
	case 12:
		return "go"
	case 13:
		return "java"
	case 14:
		return "javascript"
	case 15:
		return "json"
	case 16:
		return "kotlin"
	case 17:
		return "markdown"
	case 18:
		return "matlab"
	case 19:
		return "php"
	case 20:
		return "python"
	case 21:
		return "r"
	case 22:
		return "ruby"
	case 23:
		return "rust"
	case 24:
		return "shell"
	case 25:
		return "sql"
	case 26:
		return "swift"
	case 27:
		return "typescript"
	case 28:
		return "xml"
	case 29:
		return "yaml"
	default:
		return "auto"
	}
}

// TestFeishu validates a Feishu app id/secret by fetching a tenant token.
func TestFeishu(ctx context.Context, appID, appSecret string) error {
	if strings.TrimSpace(appID) == "" || strings.TrimSpace(appSecret) == "" {
		return fmt.Errorf("feishu app id and app secret are required")
	}
	return newFeishuClient(strings.TrimSpace(appID), strings.TrimSpace(appSecret)).auth(ctx)
}

// ImportFeishuDoc pulls a Feishu docx document into Motion blocks.
func ImportFeishuDoc(ctx context.Context, appID, appSecret, docInput string) (Result, error) {
	docID, err := NormalizeFeishuDocID(docInput)
	if err != nil {
		return Result{}, err
	}
	if strings.TrimSpace(appID) == "" || strings.TrimSpace(appSecret) == "" {
		return Result{}, fmt.Errorf("feishu app id and app secret are required")
	}
	client := newFeishuClient(strings.TrimSpace(appID), strings.TrimSpace(appSecret))

	title := "飞书导入"
	var meta struct {
		Document struct {
			Title string `json:"title"`
		} `json:"document"`
	}
	if err := client.get(ctx, "/open-apis/docx/v1/documents/"+docID, &meta); err == nil && meta.Document.Title != "" {
		title = meta.Document.Title
	}

	// Fetch all blocks (flat list with parent ids).
	byID := map[string]*feishuBlock{}
	var order []string
	pageToken := ""
	for {
		path := "/open-apis/docx/v1/documents/" + docID + "/blocks?page_size=500"
		if pageToken != "" {
			path += "&page_token=" + pageToken
		}
		var data struct {
			Items     []feishuBlock `json:"items"`
			PageToken string        `json:"page_token"`
			HasMore   bool          `json:"has_more"`
		}
		if err := client.get(ctx, path, &data); err != nil {
			return Result{}, err
		}
		for i := range data.Items {
			b := data.Items[i]
			if _, ok := byID[b.BlockID]; ok {
				continue
			}
			cp := b
			byID[b.BlockID] = &cp
			order = append(order, b.BlockID)
		}
		if !data.HasMore || data.PageToken == "" {
			break
		}
		pageToken = data.PageToken
		if len(order) >= 2000 {
			break
		}
	}

	depthOf := func(id string) int {
		depth := 0
		cur := id
		for i := 0; i < 8; i++ {
			b, ok := byID[cur]
			if !ok || b.ParentID == "" || b.ParentID == docID {
				break
			}
			depth++
			cur = b.ParentID
		}
		return depth
	}

	var out []model.Block
	// table assembly: table block id -> rows
	type cell struct {
		row, col int
		text     string
	}
	tables := map[string][]cell{}
	for _, id := range order {
		b := byID[id]
		if b == nil {
			continue
		}
		// table cells belong to a table parent somewhere up the chain
		if b.BlockType == 23 && b.TableCell != nil {
			parent := b.ParentID
			text := ""
			// cell text lives in its children; collect direct text children
			for _, cid := range order {
				cb := byID[cid]
				if cb != nil && cb.ParentID == id && cb.Text != nil {
					if text != "" {
						text += "\n"
					}
					text += feishuInline(cb.Text.Elements)
				}
			}
			tables[parent] = append(tables[parent], cell{row: b.TableCell.RowIdx, col: b.TableCell.ColIdx, text: text})
			continue
		}
	}
	emittedTables := map[string]bool{}
	emitTable := func(tableID string, indent int) {
		if emittedTables[tableID] {
			return
		}
		emittedTables[tableID] = true
		cells := tables[tableID]
		if len(cells) == 0 {
			return
		}
		maxRow, maxCol := 0, 0
		for _, c := range cells {
			if c.row > maxRow {
				maxRow = c.row
			}
			if c.col > maxCol {
				maxCol = c.col
			}
		}
		cols := make([]string, maxCol+1)
		for i := range cols {
			cols[i] = fmt.Sprintf("列 %d", i+1)
		}
		rows := make([][]string, maxRow+1)
		for i := range rows {
			rows[i] = make([]string, len(cols))
		}
		for _, c := range cells {
			rows[c.row][c.col] = c.text
		}
		out = appendCapped(out, tableBlock(cols, rows, indent))
	}

	for _, id := range order {
		if len(out) >= 1000 {
			break
		}
		b := byID[id]
		if b == nil {
			continue
		}
		indent := depthOf(id)
		switch b.BlockType {
		case 2: // text
			if b.Text != nil {
				if t := strings.TrimSpace(feishuInline(b.Text.Elements)); t != "" {
					out = appendCapped(out, withIndent(B("paragraph", t), indent))
				}
			}
		case 3:
			if b.Heading1 != nil {
				out = appendCapped(out, withIndent(B("heading1", feishuInline(b.Heading1.Elements)), indent))
			}
		case 4:
			if b.Heading2 != nil {
				out = appendCapped(out, withIndent(B("heading2", feishuInline(b.Heading2.Elements)), indent))
			}
		case 5:
			if b.Heading3 != nil {
				out = appendCapped(out, withIndent(B("heading3", feishuInline(b.Heading3.Elements)), indent))
			}
		case 6, 7:
			var els []feishuTextElement
			if b.Heading4 != nil {
				els = b.Heading4.Elements
			} else if b.Heading5 != nil {
				els = b.Heading5.Elements
			}
			out = appendCapped(out, withIndent(B("heading3", feishuInline(els)), indent))
		case 12:
			if b.Bullet != nil {
				out = appendCapped(out, withIndent(B("bulleted", feishuInline(b.Bullet.Elements)), indent))
			}
		case 13:
			if b.Ordered != nil {
				out = appendCapped(out, withIndent(B("numbered", feishuInline(b.Ordered.Elements)), indent))
			}
		case 14:
			if b.Code != nil {
				lang := "auto"
				if b.Code.Style != nil {
					lang = feishuCodeLang(b.Code.Style.Language)
				}
				out = appendCapped(out, withIndent(withLang(B("code", feishuInline(b.Code.Elements)), lang), indent))
			}
		case 15:
			if b.Quote != nil {
				if t := strings.TrimSpace(feishuInline(b.Quote.Elements)); t != "" {
					out = appendCapped(out, withIndent(B("quote", t), indent))
				}
			}
		case 17:
			if b.Todo != nil {
				done := false
				if b.Todo.Style != nil {
					done = b.Todo.Style.Done
				}
				out = appendCapped(out, withIndent(checked(B("todo", feishuInline(b.Todo.Elements)), done), indent))
			}
		case 22: // divider (22)
			out = appendCapped(out, withIndent(B("divider", ""), indent))
		case 27: // image
			out = appendCapped(out, withIndent(B("paragraph", "🖼️ 图片（飞书图片需手动重新上传）"), indent))
		case 18: // table
			emitTable(id, indent)
		case 23: // table_cell handled above
		case 19, 20, 21, 24, 25, 26, 28, 29, 30, 31, 32, 33, 34:
			// grid/column/iframe/etc: container or unsupported, skip quietly
		default:
			if b.Text != nil {
				if t := strings.TrimSpace(feishuInline(b.Text.Elements)); t != "" {
					out = appendCapped(out, withIndent(B("paragraph", t), indent))
				}
			}
		}
	}
	return Result{Title: title, Blocks: out}, nil
}
