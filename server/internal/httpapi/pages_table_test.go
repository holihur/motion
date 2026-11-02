package httpapi

import (
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
