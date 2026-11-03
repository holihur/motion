package httpapi

import (
	"sort"
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
	columnTypes := make([]string, len(columns))
	columnOptions := make([][]string, len(columns))
	hasTypes := false
	hasOptions := false
	for i := range columns {
		columnType := "text"
		if i < len(table.ColumnTypes) {
			switch table.ColumnTypes[i] {
			case "checkbox", "switch", "select":
				columnType = table.ColumnTypes[i]
			}
		}
		columnTypes[i] = columnType
		if columnType != "text" {
			hasTypes = true
		}
		if columnType == "select" {
			seen := map[string]bool{}
			options := make([]string, 0, 4)
			if i < len(table.ColumnOptions) {
				for _, option := range table.ColumnOptions[i] {
					option = truncateRunes(strings.TrimSpace(clean(option)), 100)
					if option == "" || seen[option] {
						continue
					}
					seen[option] = true
					options = append(options, option)
					if len(options) >= 50 {
						break
					}
				}
			}
			columnOptions[i] = options
			if len(options) > 0 {
				hasOptions = true
			}
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
				value := clean(row[j])
				if columnTypes[j] == "checkbox" || columnTypes[j] == "switch" {
					if model.TruthyTableCell(value) {
						value = "true"
					} else {
						value = ""
					}
				}
				out[j] = value
			}
		}
		cleaned[i] = out
	}
	if !hasTypes {
		columnTypes = nil
	}
	if !hasOptions {
		columnOptions = nil
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
		Query:         sanitizeTableQuery(table.Query, columns),
		ColumnStyles:  sanitizeTableCellStyles(table.ColumnStyles, len(columns)),
		RowStyles:     sanitizeTableCellStyles(table.RowStyles, len(cleaned)),
		ColumnOrder:   sanitizeTableColumnOrder(table.ColumnOrder, len(columns)),
		HiddenColumns: sanitizeHiddenColumns(table.HiddenColumns, len(columns)),
		FreezeFirst:   table.FreezeFirst,
		FrozenColumns: sanitizeFrozenColumns(table.FrozenColumns, len(columns)),
		StickyHeader:  table.StickyHeader,
		Widths:        widths, Align: align,
		Formulas:      sanitizeTableFormulas(table.Formulas, len(columns), len(cleaned), clean),
		ColumnTypes:   columnTypes,
		ColumnOptions: columnOptions,
	}
}

// sanitizeTableFormulas keeps only formulas that point at a real cell, start
// with "=", and stay small enough to be safe to ship to the client.
// NOTE: formula results are stored in Rows, so these entries are only needed to
// keep the source editable; dropping one leaves the computed value intact.
func sanitizeTableFormulas(formulas map[string]string, columns, rows int, clean func(string) string) map[string]string {
	if len(formulas) == 0 || columns <= 0 || rows <= 0 {
		return nil
	}
	out := make(map[string]string, len(formulas))
	// Iterate in a stable order so the cap below always keeps the same cells.
	keys := make([]string, 0, len(formulas))
	for key := range formulas {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	for _, key := range keys {
		value := formulas[key]
		if len(out) >= 200 {
			break
		}
		parts := strings.SplitN(key, ":", 2)
		if len(parts) != 2 {
			continue
		}
		row, rowErr := strconv.Atoi(parts[0])
		column, columnErr := strconv.Atoi(parts[1])
		if rowErr != nil || columnErr != nil || row < 0 || row >= rows || column < 0 || column >= columns {
			continue
		}
		formula := strings.TrimSpace(clean(value))
		if !strings.HasPrefix(formula, "=") || len([]rune(formula)) > 500 {
			continue
		}
		out[strconv.Itoa(row)+":"+strconv.Itoa(column)] = formula
	}
	if len(out) == 0 {
		return nil
	}
	return out
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

func sanitizeTableColumnOrder(order []int, count int) []int {
	if count <= 0 || len(order) == 0 {
		return nil
	}
	seen := make([]bool, count)
	out := make([]int, 0, count)
	for _, index := range order {
		if index >= 0 && index < count && !seen[index] {
			seen[index] = true
			out = append(out, index)
		}
	}
	for index := 0; index < count; index++ {
		if !seen[index] {
			out = append(out, index)
		}
	}
	identity := true
	for index, value := range out {
		if index != value {
			identity = false
			break
		}
	}
	if identity {
		return nil
	}
	return out
}

func sanitizeFrozenColumns(frozen []int, count int) []int {
	if count <= 1 || len(frozen) == 0 {
		return nil
	}
	seen := make([]bool, count)
	out := make([]int, 0, len(frozen))
	for _, index := range frozen {
		if index >= 0 && index < count && !seen[index] {
			seen[index] = true
			out = append(out, index)
		}
	}
	sort.Ints(out)
	if len(out) == 0 {
		return nil
	}
	return out
}

func sanitizeHiddenColumns(hidden []int, count int) []int {
	if count <= 1 || len(hidden) == 0 {
		return nil
	}
	seen := make([]bool, count)
	out := make([]int, 0, len(hidden))
	for _, index := range hidden {
		if index >= 0 && index < count && !seen[index] {
			seen[index] = true
			out = append(out, index)
		}
	}
	sort.Ints(out)
	if len(out) >= count {
		out = out[:count-1]
	}
	if len(out) == 0 {
		return nil
	}
	return out
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

func sanitizeInput(input *model.InputData) *model.InputData {
	if input == nil {
		input = &model.InputData{}
	}
	options := make([]string, 0, len(input.Options))
	seen := map[string]bool{}
	for _, option := range input.Options {
		option = truncateRunes(strings.TrimSpace(option), 200)
		if option == "" || seen[option] {
			continue
		}
		seen[option] = true
		options = append(options, option)
		if len(options) >= 30 {
			break
		}
	}
	if len(options) == 0 {
		options = []string{"Option 1", "Option 2"}
	}
	value := truncateRunes(strings.TrimSpace(input.Value), 200)
	if value != "" && !seen[value] {
		value = ""
	}
	return &model.InputData{Options: options, Value: value}
}
