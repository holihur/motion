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
	return &model.TableData{
		Columns: columns, Rows: cleaned, Header: table.Header, RowNumbers: table.RowNumbers,
		Query:        sanitizeTableQuery(table.Query, columns),
		ColumnStyles: sanitizeTableCellStyles(table.ColumnStyles, len(columns)),
		RowStyles:    sanitizeTableCellStyles(table.RowStyles, len(cleaned)),
		Widths:       widths, Align: align,
	}
}

func sanitizeTableCellStyles(styles []*model.TableCellStyle, limit int) []*model.TableCellStyle {
	if len(styles) == 0 || limit <= 0 {
		return nil
	}
	if len(styles) > limit {
		styles = styles[:limit]
	}
	colors := map[string]bool{"": true, "gray": true, "brown": true, "orange": true, "yellow": true, "green": true, "blue": true, "purple": true, "pink": true, "red": true}
	out := make([]*model.TableCellStyle, len(styles))
	last := -1
	for i, style := range styles {
		if style == nil {
			continue
		}
		next := &model.TableCellStyle{BG: style.BG, Color: style.Color, Bold: style.Bold, Italic: style.Italic}
		if !colors[next.BG] {
			next.BG = ""
		}
		if !colors[next.Color] {
			next.Color = ""
		}
		if next.BG == "" && next.Color == "" && !next.Bold && !next.Italic {
			continue
		}
		out[i] = next
		last = i
	}
	if last < 0 {
		return nil
	}
	return out[:last+1]
}

func sanitizeTableQuery(query *model.TableQuery, columns []string) *model.TableQuery {
	if query == nil || len(query.Filters) == 0 {
		return nil
	}
	allowed := map[string]bool{}
	for _, column := range columns {
		allowed[column] = true
	}
	ops := map[string]bool{"contains": true, "equals": true, "notEquals": true, "isEmpty": true, "isNotEmpty": true, "gt": true, "lt": true, "gte": true, "lte": true}
	match := "all"
	if query.Match == "any" {
		match = "any"
	}
	filters := make([]model.TableFilter, 0, len(query.Filters))
	seen := map[string]bool{}
	for _, filter := range query.Filters {
		filter.Column = truncateRunes(strings.TrimSpace(filter.Column), 100)
		filter.Op = strings.TrimSpace(filter.Op)
		filter.Value = truncateRunes(strings.TrimSpace(filter.Value), 500)
		if !allowed[filter.Column] || !ops[filter.Op] {
			continue
		}
		key := filter.Column + "\x00" + filter.Op
		if seen[key] {
			continue
		}
		seen[key] = true
		filters = append(filters, filter)
		if len(filters) >= 12 {
			break
		}
	}
	if len(filters) == 0 {
		return nil
	}
	return &model.TableQuery{Match: match, Filters: filters}
}

func sanitizeDatabase(db *model.DatabaseData) *model.DatabaseData {
	if db == nil {
		return &model.DatabaseData{
			Columns:  []model.DatabaseColumn{{ID: "col1", Name: "Name", Type: "text"}, {ID: "col2", Name: "Status", Type: "status", Options: []string{"Todo", "Doing", "Done"}}, {ID: "col3", Name: "Date", Type: "date"}},
			Rows:     []map[string]string{{}, {}},
			ViewMode: "table",
		}
	}
	cols := db.Columns
	if len(cols) > 20 {
		cols = cols[:20]
	}
	if len(cols) == 0 {
		cols = []model.DatabaseColumn{{ID: "col1", Name: "Name", Type: "text"}}
	}
	seen := map[string]bool{}
	for i := range cols {
		if cols[i].ID == "" {
			cols[i].ID = "col" + strconv.Itoa(i+1)
		}
		cols[i].ID = truncateRunes(strings.TrimSpace(cols[i].ID), 40)
		if seen[cols[i].ID] {
			cols[i].ID += "_" + strconv.Itoa(i)
		}
		seen[cols[i].ID] = true
		cols[i].Name = truncateRunes(strings.TrimSpace(cols[i].Name), 100)
		if cols[i].Name == "" {
			cols[i].Name = "Column " + strconv.Itoa(i+1)
		}
		switch cols[i].Type {
		case "text", "select", "status", "person", "date", "number":
		default:
			cols[i].Type = "text"
		}
		if len(cols[i].Options) > 50 {
			cols[i].Options = cols[i].Options[:50]
		}
		for j := range cols[i].Options {
			cols[i].Options[j] = truncateRunes(cols[i].Options[j], 100)
		}
		if cols[i].Width < 60 || cols[i].Width > 600 {
			cols[i].Width = 160
		}
	}
	rows := db.Rows
	if len(rows) > 500 {
		rows = rows[:500]
	}
	for i := range rows {
		cleaned := map[string]string{}
		for _, col := range cols {
			if v, ok := rows[i][col.ID]; ok {
				cleaned[col.ID] = truncateRunes(strings.ReplaceAll(strings.ReplaceAll(v, "\x00", ""), "\n", " "), 2000)
			}
		}
		rows[i] = cleaned
	}
	mode := db.ViewMode
	if mode != "board" {
		mode = "table"
	}
	groupBy := truncateRunes(db.GroupBy, 40)
	return &model.DatabaseData{Columns: cols, Rows: rows, ViewMode: mode, GroupBy: groupBy}
}

func sanitizeTranslations(in map[string]string) map[string]string {
	if len(in) == 0 {
		return nil
	}
	out := make(map[string]string, 20)
	for key, value := range in {
		key = strings.TrimSpace(key)
		if key == "" || len([]rune(key)) > 40 {
			continue
		}
		value = truncateRunes(strings.TrimSpace(value), 5000)
		if value == "" {
			continue
		}
		out[key] = value
		if len(out) >= 20 {
			break
		}
	}
	if len(out) == 0 {
		return nil
	}
	return out
}
