package httpapi

import (
	"net/http"
	"regexp"
	"strings"
	"unicode/utf8"

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
		SetProjection(bson.M{"blocks": 0}).
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
	for index := range results {
		results[index].Snippet = snippetAround(results[index].Text, query, 88)
		results[index].Text = ""
	}
	writeJSON(w, http.StatusOK, results)
}

func snippetAround(text, query string, radius int) string {
	text = strings.Join(strings.Fields(text), " ")
	if text == "" {
		return ""
	}
	lowerText := strings.ToLower(text)
	lowerQuery := strings.ToLower(query)
	index := strings.Index(lowerText, lowerQuery)
	if index < 0 {
		if utf8.RuneCountInString(text) <= radius*2 {
			return text
		}
		runes := []rune(text)
		return string(runes[:radius*2]) + "…"
	}
	runes := []rune(text)
	prefix := utf8.RuneCountInString(text[:index])
	queryRunes := utf8.RuneCountInString(query)
	start := max(0, prefix-radius)
	end := min(len(runes), prefix+queryRunes+radius)
	chunk := string(runes[start:end])
	if start > 0 {
		chunk = "…" + chunk
	}
	if end < len(runes) {
		chunk += "…"
	}
	return chunk
}
