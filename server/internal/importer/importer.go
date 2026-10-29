package importer

import (
	"crypto/rand"
	"encoding/hex"
	"strconv"
	"strings"

	"github.com/motion/server/internal/model"
)

// Result is what import handlers return: a title plus Motion blocks.
// Text may contain Markdown inline syntax; the frontend enriches Rich.
type Result struct {
	Title  string        `json:"title"`
	Blocks []model.Block `json:"blocks"`
}

var uidFallback uint64

func uid() string {
	var b [12]byte
	if _, err := rand.Read(b[:]); err == nil {
		return hex.EncodeToString(b[:])
	}
	uidFallback++
	return "imp" + strings.Repeat("0", 12) + strconv.FormatUint(uidFallback, 10)
}

func clamp(s string, limit int) string {
	r := []rune(s)
	if len(r) > limit {
		return string(r[:limit])
	}
	return s
}

// B builds a Motion block. Text supports Markdown inline syntax.
func B(blockType, text string) model.Block {
	return model.Block{ID: uid(), Type: blockType, Text: clamp(text, 50000)}
}

func withIndent(b model.Block, indent int) model.Block {
	if indent > 8 {
		indent = 8
	}
	b.Indent = indent
	return b
}

func checked(b model.Block, done bool) model.Block {
	b.Checked = done
	return b
}

func withLang(b model.Block, lang string) model.Block {
	b.Language = lang
	return b
}

func withURL(b model.Block, url, caption string) model.Block {
	b.URL = url
	b.Caption = caption
	return b
}

func tableBlock(columns []string, rows [][]string, indent int) model.Block {
	if len(columns) == 0 {
		columns = []string{"列 1"}
	}
	if len(columns) > 20 {
		columns = columns[:20]
	}
	if len(rows) > 200 {
		rows = rows[:200]
	}
	for i, row := range rows {
		fixed := make([]string, len(columns))
		copy(fixed, row)
		rows[i] = fixed
	}
	b := B("table", "")
	b.Table = &model.TableData{Columns: columns, Rows: rows, Header: true}
	return withIndent(b, indent)
}

func appendCapped(out []model.Block, b model.Block) []model.Block {
	if len(out) >= 1000 {
		return out
	}
	return append(out, b)
}
