package httpapi

import (
	"encoding/csv"
	"net/http"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// GET /api/workspaces/{workspaceID}/audit/export -> CSV
func (s *Server) exportAudit(w http.ResponseWriter, r *http.Request) {
	wsID, err := primitive.ObjectIDFromHex(chiURLParam(r, "workspaceID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if _, ok := s.requireEditor(w, r, wsID); !ok {
		return
	}
	filter := bson.M{"workspaceId": wsID}
	cur, err := s.store.Audit.Find(r.Context(), filter, options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}).SetLimit(10000))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load audit logs")
		return
	}
	defer cur.Close(r.Context())
	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", "attachment; filename=\"audit-"+wsID.Hex()+".csv\"")
	cw := csv.NewWriter(w)
	_ = cw.Write([]string{"createdAt", "actorName", "action", "targetType", "targetId", "summary"})
	for cur.Next(r.Context()) {
		var raw bson.M
		if err := cur.Decode(&raw); err != nil {
			continue
		}
		createdAt := stringField(raw, "createdAt")
		if v, ok := raw["createdAt"].(primitive.DateTime); ok {
			createdAt = v.Time().UTC().Format("2006-01-02T15:04:05Z")
		}
		actor := stringField(raw, "actorName")
		action := stringField(raw, "action")
		targetType := stringField(raw, "targetType")
		targetID := stringField(raw, "targetId")
		summary := stringField(raw, "summary")
		_ = cw.Write([]string{createdAt, actor, action, targetType, targetID, summary})
	}
	cw.Flush()
}

func stringField(m bson.M, key string) string {
	if v, ok := m[key].(string); ok {
		return v
	}
	return ""
}
