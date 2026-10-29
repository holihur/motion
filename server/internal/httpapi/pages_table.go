package httpapi

import (
	"strconv"
	"strings"

	"github.com/motion/server/internal/model"
)

func sanitizeTable(table *model.TableData) *model.TableData {
	if table == nil {
		return &model.TableData{
			Columns: []string{"Column 1", "Column 2", "Column 3"},
			Rows:    [][]string{{"", "", ""}, {"", "", ""}},
			Header:  true,
		}
	}
	clean := func(value string) string {
		value = strings.ReplaceAll(strings.ReplaceAll(value, "\x00", ""), "\n", " ")
		if len([]rune(value)) > 1000 {
			value = string([]rune(value)[:1000])
		}
		return value
	}
	columns := table.Columns
	if len(columns) > 20 {
		columns = columns[:20]
	}
	if len(columns) == 0 {
		columns = []string{"Column 1", "Column 2"}
	}
	for i := range columns {
		columns[i] = clean(columns[i])
		if strings.TrimSpace(columns[i]) == "" {
			columns[i] = "Column " + strconv.Itoa(i+1)
		}
	}
	rows := table.Rows
	if len(rows) > 200 {
		rows = rows[:200]
	}
	cleaned := make([][]string, len(rows))
	for i, row := range rows {
		out := make([]string, len(columns))
		for j := range columns {
			if j < len(row) {
				out[j] = clean(row[j])
			}
		}
		cleaned[i] = out
	}
	widths := make([]int, len(columns))
	align := make([]string, len(columns))
	for i := range columns {
		width := 160
		if i < len(table.Widths) && table.Widths[i] >= 60 && table.Widths[i] <= 600 {
			width = table.Widths[i]
		}
		widths[i] = width
		value := "left"
		if i < len(table.Align) && (table.Align[i] == "left" || table.Align[i] == "center" || table.Align[i] == "right") {
			value = table.Align[i]
		}
		align[i] = value
	}
	return &model.TableData{Columns: columns, Rows: cleaned, Header: table.Header, Widths: widths, Align: align}
}

func truncateRunes(value string, limit int) string {
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return string(runes[:limit])
}
