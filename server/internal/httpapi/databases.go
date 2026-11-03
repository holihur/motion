package httpapi

import (
	"net/http"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/motion/server/internal/model"
)

type workspaceDatabase struct {
	PageID    string                 `json:"pageId"`
	PageTitle string                 `json:"pageTitle"`
	BlockID   string                 `json:"blockId"`
	Columns   []model.DatabaseColumn `json:"columns"`
	Rows      []map[string]string    `json:"rows"`
	RowIDs    []string               `json:"rowIds"`
}

// listWorkspaceDatabases exposes database blocks so relation/rollup columns can
// reference a database on another page in the same workspace.
func (s *Server) listWorkspaceDatabases(w http.ResponseWriter, r *http.Request) {
	wsID := objectIDFromParam(r, "workspaceID")
	if wsID.IsZero() {
		writeErr(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if _, _, err := s.accessibleWorkspace(r, wsID); err != nil {
		writeErr(w, http.StatusNotFound, "workspace not found")
		return
	}
	cur, err := s.store.Pages.Find(r.Context(), bson.M{
		"workspaceId": wsID,
		"archived":    false,
		"blocks.type": "database",
	}, options.Find().SetProjection(bson.M{"title": 1, "blocks": 1}).SetLimit(100))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load databases")
		return
	}
	defer cur.Close(r.Context())
	var pages []model.Page
	if err := cur.All(r.Context(), &pages); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load databases")
		return
	}
	out := make([]workspaceDatabase, 0)
	for _, page := range pages {
		for _, block := range page.Blocks {
			if block.Type != "database" {
				continue
			}
			db := sanitizeDatabase(block.Database)
			if block.Database == nil || len(block.Database.RowIDs) != len(block.Database.Rows) {
				_, _ = s.store.Pages.UpdateOne(r.Context(),
					bson.M{"_id": page.ID, "blocks.id": block.ID},
					bson.M{"$set": bson.M{"blocks.$.database.rowIds": db.RowIDs}},
				)
			}
			out = append(out, workspaceDatabase{
				PageID: page.ID.Hex(), PageTitle: page.Title, BlockID: block.ID,
				Columns: db.Columns, Rows: db.Rows, RowIDs: db.RowIDs,
			})
			if len(out) >= 200 {
				break
			}
		}
		if len(out) >= 200 {
			break
		}
	}
	writeJSON(w, http.StatusOK, out)
}
