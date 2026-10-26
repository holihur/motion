package blocks

import (
	"testing"

	"github.com/motion/server/internal/model"
)

func TestMergeKeepsRemoteChangesToOtherBlocks(t *testing.T) {
	base := []model.Block{
		{ID: "a", Type: "paragraph", Text: "base a"},
		{ID: "b", Type: "paragraph", Text: "base b"},
	}
	current := []model.Block{
		{ID: "a", Type: "paragraph", Text: "base a"},
		{ID: "b", Type: "paragraph", Text: "remote b"},
	}
	incoming := []model.Block{
		{ID: "a", Type: "paragraph", Text: "local a"},
		{ID: "b", Type: "paragraph", Text: "base b"},
	}
	merged := Merge(base, current, incoming)
	if len(merged) != 2 {
		t.Fatalf("expected 2 blocks, got %d", len(merged))
	}
	if merged[0].Text != "local a" || merged[1].Text != "remote b" {
		t.Fatalf("unexpected merge: %#v", merged)
	}
}

func TestMergePreservesRemoteAddedBlocks(t *testing.T) {
	base := []model.Block{{ID: "a", Text: "a"}}
	current := []model.Block{{ID: "a", Text: "a"}, {ID: "b", Text: "remote"}}
	incoming := []model.Block{{ID: "a", Text: "local"}}
	merged := Merge(base, current, incoming)
	if len(merged) != 2 || merged[1].ID != "b" {
		t.Fatalf("remote block was dropped: %#v", merged)
	}
}

func TestMergeAppliesLocalDeletes(t *testing.T) {
	base := []model.Block{{ID: "a", Text: "a"}, {ID: "b", Text: "b"}}
	current := []model.Block{{ID: "a", Text: "a"}, {ID: "b", Text: "b"}}
	incoming := []model.Block{{ID: "a", Text: "a"}}
	merged := Merge(base, current, incoming)
	if len(merged) != 1 || merged[0].ID != "a" {
		t.Fatalf("expected local delete to apply: %#v", merged)
	}
}
