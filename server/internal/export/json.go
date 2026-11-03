package export

import (
	"encoding/json"
	"time"

	"github.com/motion/server/internal/model"
)

// BlocksJSON is a portable backup of a page's blocks. It intentionally mirrors
// the stored block shape so it can be consumed by scripts or re-imported.
func BlocksJSON(page model.Page) ([]byte, error) {
	payload := struct {
		Version    int           `json:"version"`
		PageID     string        `json:"pageId"`
		Title      string        `json:"title"`
		Icon       string        `json:"icon,omitempty"`
		Cover      string        `json:"cover,omitempty"`
		Width      string        `json:"width,omitempty"`
		Theme      string        `json:"theme,omitempty"`
		ExportedAt time.Time     `json:"exportedAt"`
		Blocks     []model.Block `json:"blocks"`
	}{
		Version:    1,
		PageID:     page.ID.Hex(),
		Title:      page.Title,
		Icon:       page.Icon,
		Cover:      page.Cover,
		Width:      page.Width,
		Theme:      page.Theme,
		ExportedAt: time.Now().UTC(),
		Blocks:     page.Blocks,
	}
	return json.MarshalIndent(payload, "", "  ")
}
