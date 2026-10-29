package importer

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"

	"github.com/motion/server/internal/model"
)

var yuqueURLPattern = regexp.MustCompile(`https?://([^/]+)/([^/]+)/([^/]+)/([^/?#]+)`)

// ImportYuqueDoc fetches a Yuque doc (markdown body) into Motion blocks.
// docInput may be a full doc URL or "login/book/slug".
func ImportYuqueDoc(ctx context.Context, token, docInput string) (Result, error) {
	token = strings.TrimSpace(token)
	if token == "" {
		return Result{}, fmt.Errorf("yuque token is required")
	}
	host, login, book, slug := "yuque.com", "", "", ""
	if m := yuqueURLPattern.FindStringSubmatch(strings.TrimSpace(docInput)); m != nil {
		host, login, book, slug = m[1], m[2], m[3], m[4]
	} else {
		parts := strings.Split(strings.Trim(strings.TrimSpace(docInput), "/"), "/")
		if len(parts) == 3 {
			login, book, slug = parts[0], parts[1], parts[2]
		} else {
			return Result{}, fmt.Errorf("unrecognized yuque link (expected https://host/login/book/slug)")
		}
	}
	apiURL := "https://" + host + "/api/v2/repos/" + url.PathEscape(login) + "/" + url.PathEscape(book) + "/docs/" + url.PathEscape(slug)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, apiURL, nil)
	if err != nil {
		return Result{}, err
	}
	req.Header.Set("X-Auth-Token", token)
	req.Header.Set("Accept", "application/json")
	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return Result{}, fmt.Errorf("could not reach yuque: %w", err)
	}
	defer resp.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if resp.StatusCode == http.StatusUnauthorized {
		return Result{}, fmt.Errorf("yuque rejected the token")
	}
	if resp.StatusCode == http.StatusNotFound {
		return Result{}, fmt.Errorf("yuque doc not found (is it public or shared with you?)")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return Result{}, fmt.Errorf("yuque api error (%d)", resp.StatusCode)
	}
	var payload struct {
		Data struct {
			Title string `json:"title"`
			Body  string `json:"body"`
		} `json:"data"`
	}
	if err := json.Unmarshal(data, &payload); err != nil {
		return Result{}, fmt.Errorf("could not parse yuque response: %w", err)
	}
	title := strings.TrimSpace(payload.Data.Title)
	if title == "" {
		title = "语雀导入"
	}
	return Result{Title: title, Blocks: markdownToBlocks(payload.Data.Body)}, nil
}

// TestYuqueToken validates a Yuque token via /api/v2/user.
func TestYuqueToken(ctx context.Context, token string) error {
	token = strings.TrimSpace(token)
	if token == "" {
		return fmt.Errorf("yuque token is required")
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, "https://www.yuque.com/api/v2/user", nil)
	if err != nil {
		return err
	}
	req.Header.Set("X-Auth-Token", token)
	client := &http.Client{Timeout: 20 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("could not reach yuque: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusUnauthorized {
		return fmt.Errorf("yuque rejected the token")
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		return fmt.Errorf("yuque api error (%d)", resp.StatusCode)
	}
	return nil
}

// markdownToBlocks converts a Markdown subset (yuque lake body) to blocks.
func markdownToBlocks(md string) []model.Block {
	var out []model.Block
	lines := strings.Split(strings.ReplaceAll(md, "\r\n", "\n"), "\n")
	i := 0
	flush := func(b model.Block) {
		out = appendCapped(out, b)
	}
	for i < len(lines) {
		if len(out) >= 1000 {
			break
		}
		line := lines[i]
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			i++
			continue
		}
		// fenced code
		if strings.HasPrefix(trimmed, "```") {
			lang := strings.TrimSpace(strings.TrimPrefix(trimmed, "```"))
			if lang == "" {
				lang = "auto"
			}
			var code []string
			i++
			for i < len(lines) && !strings.HasPrefix(strings.TrimSpace(lines[i]), "```") {
				code = append(code, lines[i])
				i++
			}
			i++
			flush(withLang(B("code", strings.Join(code, "\n")), lang))
			continue
		}
		// table
		if strings.Contains(line, "|") && i+1 < len(lines) && isMDTableSep(lines[i+1]) {
			cols := mdCells(line)
			var rows [][]string
			i += 2
			for i < len(lines) && len(rows) < 200 && strings.Contains(lines[i], "|") && strings.TrimSpace(lines[i]) != "" {
				cells := mdCells(lines[i])
				row := make([]string, len(cols))
				copy(row, cells)
				rows = append(rows, row)
				i++
			}
			flush(tableBlock(cols, rows, 0))
			continue
		}
		// divider
		if trimmed == "---" || trimmed == "***" || trimmed == "___" {
			flush(B("divider", ""))
			i++
			continue
		}
		// image alone
		if m := regexp.MustCompile(`^!\[([^\]]*)\]\(([^)\s]+)\)\s*$`).FindStringSubmatch(trimmed); m != nil {
			flush(withURL(B("image", ""), m[2], m[1]))
			i++
			continue
		}
		// heading
		if strings.HasPrefix(trimmed, "#") {
			level := 0
			for level < len(trimmed) && trimmed[level] == '#' {
				level++
			}
			text := strings.TrimSpace(trimmed[level:])
			if level >= 3 {
				flush(B("heading3", text))
			} else if level == 2 {
				flush(B("heading2", text))
			} else {
				flush(B("heading1", text))
			}
			i++
			continue
		}
		// todo
		if m := regexp.MustCompile(`^[-*+]\s+\[([ xX])\]\s+(.*)$`).FindStringSubmatch(trimmed); m != nil {
			flush(checked(B("todo", m[2]), m[1] == "x" || m[1] == "X"))
			i++
			continue
		}
		// bullet / numbered
		if m := regexp.MustCompile(`^[-*+]\s+(.*)$`).FindStringSubmatch(trimmed); m != nil {
			flush(B("bulleted", m[1]))
			i++
			continue
		}
		if m := regexp.MustCompile(`^\d+[.)]\s+(.*)$`).FindStringSubmatch(trimmed); m != nil {
			flush(B("numbered", m[1]))
			i++
			continue
		}
		// quote
		if strings.HasPrefix(trimmed, ">") {
			flush(B("quote", strings.TrimSpace(strings.TrimPrefix(trimmed, ">"))))
			i++
			continue
		}
		// yuque alert/callout: :::info ... :::
		if strings.HasPrefix(trimmed, ":::") {
			var parts []string
			i++
			for i < len(lines) && !strings.HasPrefix(strings.TrimSpace(lines[i]), ":::") {
				parts = append(parts, strings.TrimSpace(lines[i]))
				i++
			}
			i++
			call := B("callout", strings.Join(parts, "\n"))
			call.Color = "amber"
			flush(call)
			continue
		}
		// paragraph: gather until blank
		var para []string
		for i < len(lines) && strings.TrimSpace(lines[i]) != "" {
			para = append(para, strings.TrimSpace(lines[i]))
			i++
			// stop before next block construct
			if i < len(lines) {
				n := strings.TrimSpace(lines[i])
				if strings.HasPrefix(n, "#") || strings.HasPrefix(n, "```") || strings.HasPrefix(n, ">") ||
					strings.HasPrefix(n, "- ") || strings.HasPrefix(n, "* ") || regexp.MustCompile(`^\d+[.)]\s`).MatchString(n) {
					break
				}
			}
		}
		flush(B("paragraph", strings.Join(para, "\n")))
	}
	return out
}

func isMDTableSep(line string) bool {
	t := strings.TrimSpace(line)
	if !strings.Contains(t, "|") && !strings.Contains(t, "-") {
		return false
	}
	m, _ := regexp.MatchString(`^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$`, t)
	return m
}

func mdCells(line string) []string {
	t := strings.TrimSpace(line)
	t = strings.TrimPrefix(t, "|")
	t = strings.TrimSuffix(t, "|")
	parts := strings.Split(t, "|")
	for i, p := range parts {
		parts[i] = strings.TrimSpace(p)
	}
	return parts
}

