package httpapi

import (
	"net/http"
	"regexp"
	"strings"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/motion/server/internal/model"
)

func (s *Server) search(w http.ResponseWriter, r *http.Request) {
	wsID, err := primitive.ObjectIDFromHex(chiURLParam(r, "workspaceID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if _, _, err := s.accessibleWorkspace(r, wsID); err != nil {
		writeErr(w, http.StatusNotFound, "workspace not found")
		return
	}

	query := strings.TrimSpace(r.URL.Query().Get("q"))
	if query == "" {
		writeJSON(w, http.StatusOK, []model.PageSummary{})
		return
	}
	if len([]rune(query)) > 100 {
		query = string([]rune(query)[:100])
	}
	pattern := primitive.Regex{Pattern: regexp.QuoteMeta(query), Options: "i"}

	cur, err := s.store.Pages.Find(r.Context(), bson.M{
		"workspaceId": wsID,
		"archived":    false,
		"$or": []bson.M{
			{"title": pattern},
			{"text": pattern},
		},
	}, options.Find().
		SetProjection(bson.M{"blocks": 0, "text": 0}).
		SetSort(bson.D{{Key: "updatedAt", Value: -1}}).
		SetLimit(30))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "search failed")
		return
	}
	defer cur.Close(r.Context())

	results := make([]model.PageSummary, 0)
	if err := cur.All(r.Context(), &results); err != nil {
		writeErr(w, http.StatusInternalServerError, "search failed")
		return
	}
	writeJSON(w, http.StatusOK, results)
}
