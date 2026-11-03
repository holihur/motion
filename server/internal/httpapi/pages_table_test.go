package httpapi

import (
	"strings"
	"testing"

	"github.com/motion/server/internal/model"
)

func TestSanitizeTableCellStyles(t *testing.T) {
	styles := sanitizeTableCellStyles([]*model.TableCellStyle{
		{BG: "blue", Color: "red", Bold: true},
		nil,
		{BG: "not-a-color", Color: "green", Italic: true},
		{},
	}, 4)
	if len(styles) != 3 {
		t.Fatalf("expected length 3, got %d", len(styles))
	}
	if styles[0].BG != "blue" || styles[0].Color != "red" || !styles[0].Bold {
		t.Fatalf("first style was not preserved: %#v", styles[0])
	}
	if styles[1] != nil {
		t.Fatalf("nil style should stay nil: %#v", styles[1])
	}
	if styles[2].BG != "" || styles[2].Color != "green" || !styles[2].Italic {
		t.Fatalf("invalid color was not removed: %#v", styles[2])
	}
}

func TestSanitizeTableQuery(t *testing.T) {
	columns := []string{"Name", "Status"}
	query := sanitizeTableQuery(&model.TableQuery{Match: "any", Filters: []model.TableFilter{
		{Column: "Name", Op: "contains", Value: "Alice"},
		{Column: "Missing", Op: "equals", Value: "x"},
		{Column: "Status", Op: "bad-op", Value: "x"},
		{Column: "Name", Op: "contains", Value: "duplicate"},
	}}, columns)
	if query == nil || query.Match != "any" || len(query.Filters) != 1 {
		t.Fatalf("unexpected sanitized query: %#v", query)
	}
	if query.Filters[0].Value != "Alice" {
		t.Fatalf("unexpected filter: %#v", query.Filters[0])
	}
}

func TestSanitizeTableColumnLayout(t *testing.T) {
	if got := sanitizeTableColumnOrder([]int{0, 1, 2}, 3); got != nil {
		t.Fatalf("identity order should be omitted: %#v", got)
	}
	if got := sanitizeTableColumnOrder([]int{2, 0}, 3); len(got) != 3 || got[0] != 2 || got[1] != 0 || got[2] != 1 {
		t.Fatalf("unexpected order: %#v", got)
	}
	if got := sanitizeHiddenColumns([]int{1, 1, 9}, 3); len(got) != 1 || got[0] != 1 {
		t.Fatalf("unexpected hidden columns: %#v", got)
	}
	if got := sanitizeHiddenColumns([]int{0, 1, 2}, 3); len(got) != 2 {
		t.Fatalf("all columns must not be hidden: %#v", got)
	}
}

func TestSanitizeTableFormulas(t *testing.T) {
	clean := func(value string) string { return strings.ReplaceAll(value, "\n", " ") }
	formulas := sanitizeTableFormulas(map[string]string{
		"0:0": "=SUM(B1:B2)",
		"1:1": "=A1*2",
		"0:2": "=A1",
		"9:0": "=A1",
		"bad": "=A1",
		"0:3": "SUM(A1)",
		"1:0": "",
	}, 2, 2, clean)
	if len(formulas) != 2 {
		t.Fatalf("expected 2 valid formulas, got %#v", formulas)
	}
	if formulas["0:0"] != "=SUM(B1:B2)" || formulas["1:1"] != "=A1*2" {
		t.Fatalf("unexpected formulas: %#v", formulas)
	}
	if got := sanitizeTableFormulas(nil, 2, 2, clean); got != nil {
		t.Fatalf("empty formulas should be omitted: %#v", got)
	}
	if got := sanitizeTableFormulas(map[string]string{"0:0": "no equals"}, 2, 2, clean); got != nil {
		t.Fatalf("non-formula values should be dropped: %#v", got)
	}
}

func TestSanitizeTableKeepsFormulas(t *testing.T) {
	table := sanitizeTable(&model.TableData{
		Columns:  []string{"A", "B"},
		Rows:     [][]string{{"1", "2"}, {"3", ""}},
		Header:   true,
		Formulas: map[string]string{"1:1": "=SUM(A1:A2)"},
	})
	if table.Formulas["1:1"] != "=SUM(A1:A2)" {
		t.Fatalf("formula was dropped by the HTTP sanitizer: %#v", table.Formulas)
	}
	if table.Rows[1][1] != "" {
		t.Fatalf("computed value must be preserved: %#v", table.Rows)
	}
}

func TestSanitizeTableInputColumns(t *testing.T) {
	table := sanitizeTable(&model.TableData{
		Columns:       []string{"Task", "Done", "Status", "Enabled", "Extra"},
		Rows:          [][]string{{"Write", "yes", "Done", "TRUE", "x"}, {"Ship", "", "Todo", "false", "y"}},
		Header:        true,
		ColumnTypes:   []string{"text", "checkbox", "select", "switch", "bogus"},
		ColumnOptions: [][]string{nil, nil, {"Done", "Todo", "Done", " "}, nil, nil},
	})
	if len(table.ColumnTypes) != 5 || table.ColumnTypes[0] != "text" || table.ColumnTypes[1] != "checkbox" || table.ColumnTypes[2] != "select" || table.ColumnTypes[3] != "switch" || table.ColumnTypes[4] != "text" {
		t.Fatalf("unexpected column types: %#v", table.ColumnTypes)
	}
	if len(table.ColumnOptions) != 5 || len(table.ColumnOptions[2]) != 2 || table.ColumnOptions[2][0] != "Done" || table.ColumnOptions[2][1] != "Todo" {
		t.Fatalf("unexpected column options: %#v", table.ColumnOptions)
	}
	if table.Rows[0][1] != "true" || table.Rows[1][1] != "" || table.Rows[0][3] != "true" || table.Rows[1][3] != "" {
		t.Fatalf("checkbox/switch values were not normalized: %#v", table.Rows)
	}
	if got := table.DisplayCell(0, 1); got != "☑" {
		t.Fatalf("unexpected checked display: %q", got)
	}
	if got := table.DisplayCell(1, 1); got != "☐" {
		t.Fatalf("unexpected unchecked display: %q", got)
	}
	if got := table.DisplayCell(0, 3); got != "On" {
		t.Fatalf("unexpected switch display: %q", got)
	}
	if got := table.DisplayCell(1, 3); got != "Off" {
		t.Fatalf("unexpected switch display: %q", got)
	}
	if plain := sanitizeTable(&model.TableData{Columns: []string{"A"}, Rows: [][]string{{"x"}}, Header: true}); plain.ColumnTypes != nil || plain.ColumnOptions != nil {
		t.Fatalf("text-only tables should omit input metadata: %#v %#v", plain.ColumnTypes, plain.ColumnOptions)
	}
}

func TestSanitizeInput(t *testing.T) {
	input := sanitizeInput(&model.InputData{Options: []string{" A ", "", "A", "B"}, Value: "B"})
	if len(input.Options) != 2 || input.Options[0] != "A" || input.Options[1] != "B" || input.Value != "B" {
		t.Fatalf("unexpected sanitized input: %#v", input)
	}
	cleared := sanitizeInput(&model.InputData{Options: []string{"A"}, Value: "missing"})
	if cleared.Value != "" {
		t.Fatalf("selection outside the options should be cleared: %#v", cleared)
	}
	fallback := sanitizeInput(nil)
	if len(fallback.Options) != 2 {
		t.Fatalf("empty radio groups need default options: %#v", fallback)
	}
}

func TestSanitizeLayout(t *testing.T) {
	layout := sanitizeLayout(&model.LayoutData{Columns: []model.LayoutColumn{
		{Blocks: []model.Block{
			{ID: "p1", Type: "paragraph", Text: "nested"},
			{ID: "c1", Type: "content", Text: "not allowed"},
			{ID: "f1", Type: "form", Form: &model.FormData{Title: strings.Repeat("x", 300), Fields: []model.FormField{{Label: "name"}}}},
		}},
		{Blocks: []model.Block{{ID: "p2", Type: "todo", Text: "task", Checked: true}}},
		{Blocks: []model.Block{{ID: "p3", Type: "paragraph", Text: "third"}}},
		{Blocks: []model.Block{{ID: "p4", Type: "paragraph", Text: "fourth"}}},
		{Blocks: []model.Block{{ID: "p5", Type: "paragraph", Text: "dropped"}}},
	}}, 0)
	if len(layout.Columns) != 4 {
		t.Fatalf("layout columns must be capped at 4: %d", len(layout.Columns))
	}
	if len(layout.Columns[0].Blocks) != 2 || layout.Columns[0].Blocks[0].Text != "nested" {
		t.Fatalf("unexpected nested blocks: %#v", layout.Columns[0].Blocks)
	}
	if len([]rune(layout.Columns[0].Blocks[1].Form.Title)) != 200 {
		t.Fatalf("nested form title was not truncated: %d", len([]rune(layout.Columns[0].Blocks[1].Form.Title)))
	}
	if len(layout.Columns[1].Blocks) != 1 || !layout.Columns[1].Blocks[0].Checked {
		t.Fatalf("nested todo was not preserved: %#v", layout.Columns[1].Blocks)
	}

	narrow := sanitizeLayout(&model.LayoutData{Columns: []model.LayoutColumn{{}}}, 0)
	if len(narrow.Columns) != 2 {
		t.Fatalf("layout should be padded to two columns: %d", len(narrow.Columns))
	}
	if deep := sanitizeLayout(nil, 3); deep != nil {
		t.Fatalf("layout depth must be capped: %#v", deep)
	}
}

func TestSanitizeTableKeepsFractionalWidths(t *testing.T) {
	table := sanitizeTable(&model.TableData{
		Columns: []string{"A", "B", "C"},
		Rows:    [][]string{{"", "", ""}},
		Widths:  []float64{50, 50, 33.333333333333336},
	})
	if len(table.Widths) != 3 || table.Widths[0] != 50 || table.Widths[1] != 50 {
		t.Fatalf("unexpected widths: %#v", table.Widths)
	}
	if table.Widths[2] < 33 || table.Widths[2] > 34 {
		t.Fatalf("fractional column width was not preserved: %#v", table.Widths)
	}
}
