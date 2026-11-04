package httpapi

import (
	"strings"
	"testing"
	"time"

	"github.com/motion/server/internal/model"
)

func TestParseSearchDate(t *testing.T) {
	from, ok := parseSearchDate("2026-01-02", false)
	if !ok || !from.Equal(time.Date(2026, 1, 2, 0, 0, 0, 0, time.UTC)) {
		t.Fatalf("unexpected start date: %v %v", from, ok)
	}
	to, ok := parseSearchDate("2026-01-02", true)
	if !ok || !to.Equal(time.Date(2026, 1, 3, 0, 0, 0, 0, time.UTC)) {
		t.Fatalf("unexpected end date: %v %v", to, ok)
	}
	if _, ok := parseSearchDate("not-a-date", false); ok {
		t.Fatal("invalid date should be rejected")
	}
}

func TestSearchScoreWeightsTitle(t *testing.T) {
	titleMatch := searchScore(model.PageSummary{Title: "Orion project", Text: ""}, []string{"orion"})
	textMatch := searchScore(model.PageSummary{Title: "Notes", Text: "orion project"}, []string{"orion"})
	if titleMatch <= textMatch {
		t.Fatalf("title match should rank higher: title=%d text=%d", titleMatch, textMatch)
	}
}

func TestSnippetAroundFallsBackToASearchTerm(t *testing.T) {
	text := strings.Repeat("prefix ", 30) + "the target phrase is here " + strings.Repeat("suffix ", 30)
	snippet := snippetAround(text, "missing target", 20)
	if !strings.Contains(snippet, "target") {
		t.Fatalf("snippet should center a matching term: %q", snippet)
	}
}
