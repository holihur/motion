package blocks

import (
	"encoding/json"

	"github.com/motion/server/internal/model"
)

// Key returns a stable representation of a block's content, ignoring its
// position. It is used for three-way merges during collaborative editing.
func Key(block model.Block) string {
	data, _ := json.Marshal(struct {
		Type     string           `json:"t"`
		Text     string           `json:"x"`
		Rich     string           `json:"r,omitempty"`
		Checked  bool             `json:"c"`
		Language string           `json:"l"`
		Color    string           `json:"o"`
		URL      string           `json:"u"`
		Caption  string           `json:"p"`
		Table    *model.TableData `json:"tb,omitempty"`
	}{block.Type, block.Text, block.Rich, block.Checked, block.Language, block.Color, block.URL, block.Caption, block.Table})
	return string(data)
}

func Same(a, b model.Block) bool {
	return a.ID == b.ID && Key(a) == Key(b)
}

// Merge performs a block-level three-way merge.
//
// base is the server state the client last saw, current is the latest server
// state, and incoming is the client's new state. Local changes are applied on
// top of remote changes; when both sides changed the same block, the incoming
// version wins (last-write-wins per block). Blocks added by other collaborators
// are preserved.
func Merge(base, current, incoming []model.Block) []model.Block {
	baseByID := make(map[string]model.Block, len(base))
	for _, block := range base {
		baseByID[block.ID] = block
	}
	currentByID := make(map[string]model.Block, len(current))
	for _, block := range current {
		currentByID[block.ID] = block
	}

	out := make([]model.Block, 0, max(len(incoming), len(current)))
	seen := make(map[string]bool, len(incoming))
	for _, next := range incoming {
		seen[next.ID] = true
		existing, exists := currentByID[next.ID]
		if !exists {
			out = append(out, next)
			continue
		}
		before, hadBase := baseByID[next.ID]
		if hadBase && Key(before) == Key(next) && Key(before) != Key(existing) {
			// Only the other collaborator changed this block; keep their edit.
			out = append(out, existing)
		} else {
			// Local edit wins (including the both-changed case: last writer wins).
			out = append(out, next)
		}
	}

	// Keep blocks that another collaborator added (or changed while this client
	// deleted them) instead of dropping them silently.
	for _, existing := range current {
		if seen[existing.ID] {
			continue
		}
		if before, hadBase := baseByID[existing.ID]; hadBase && Key(before) == Key(existing) {
			continue // client deleted a block nobody else touched
		}
		out = append(out, existing)
	}

	return out
}
