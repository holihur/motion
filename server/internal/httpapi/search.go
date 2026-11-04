package httpapi

import (
	"net/http"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"time"
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
	_, role, err := s.accessibleWorkspace(r, wsID)
	if err != nil {
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
	terms := strings.Fields(query)
	if len(terms) > 8 {
		terms = terms[:8]
	}
	conditions := make([]bson.M, 0, len(terms))
	for _, term := range terms {
		pattern := primitive.Regex{Pattern: regexp.QuoteMeta(term), Options: "i"}
		conditions = append(conditions, bson.M{"$or": []bson.M{
			{"title": pattern},
			{"text": pattern},
		}})
	}

	filter := bson.M{
		"workspaceId": wsID,
		"archived":    false,
		"isLayout":    bson.M{"$ne": true},
	}
	if len(conditions) > 0 {
		filter["$and"] = conditions
	}

	// Optional block type filter. Unknown types are ignored rather than
	// producing an empty result for a stale client.
	if blockType := strings.TrimSpace(r.URL.Query().Get("type")); blockTypes[blockType] {
		filter["blocks.type"] = blockType
	}
	if author := strings.TrimSpace(r.URL.Query().Get("author")); author != "" {
		if uid, err := primitive.ObjectIDFromHex(author); err == nil {
			filter["createdBy"] = uid
		}
	}
	dateRange := bson.M{}
	if from, ok := parseSearchDate(r.URL.Query().Get("from"), false); ok {
		dateRange["$gte"] = from
	}
	if to, ok := parseSearchDate(r.URL.Query().Get("to"), true); ok {
		dateRange["$lt"] = to
	}
	if len(dateRange) > 0 {
		filter["updatedAt"] = dateRange
	}

	// Page-level revocations apply to search as well. Owners always retain
	// access, matching accessiblePageFor.
	if role != roleOwner {
		filter["$nor"] = []bson.M{{
			"shareOverrides": bson.M{"$elemMatch": bson.M{
				"userId": currentUserID(r).Hex(),
				"role":   "none",
			}},
		}}
	}

	sortKey := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("sort")))
	order := bson.D{{Key: "updatedAt", Value: -1}}
	limit := int64(30)
	if sortKey == "relevance" {
		limit = 100
	}
	switch sortKey {
	case "created":
		order = bson.D{{Key: "createdAt", Value: -1}}
	case "title":
		order = bson.D{{Key: "title", Value: 1}}
	}
	if v := r.URL.Query().Get("limit"); v != "" {
		if parsed, err := strconv.Atoi(v); err == nil && parsed > 0 && parsed <= 50 {
			limit = int64(parsed)
		}
	}

	cur, err := s.store.Pages.Find(r.Context(), filter, options.Find().
		SetProjection(bson.M{"blocks": 0}).
		SetSort(order).
		SetLimit(limit))
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
	if sortKey == "relevance" {
		sort.SliceStable(results, func(i, j int) bool {
			return searchScore(results[i], terms) > searchScore(results[j], terms)
		})
	}
	if len(results) > 30 {
		results = results[:30]
	}
	for index := range results {
		results[index].Snippet = snippetAround(results[index].Text, query, 88)
		results[index].Text = ""
	}
	writeJSON(w, http.StatusOK, results)
}

func parseSearchDate(value string, endOfDay bool) (time.Time, bool) {
	value = strings.TrimSpace(value)
	if value == "" {
		return time.Time{}, false
	}
	if parsed, err := time.Parse(time.RFC3339, value); err == nil {
		return parsed, true
	}
	parsed, err := time.Parse("2006-01-02", value)
	if err != nil {
		return time.Time{}, false
	}
	if endOfDay {
		parsed = parsed.Add(24 * time.Hour)
	}
	return parsed, true
}

func searchScore(page model.PageSummary, terms []string) int {
	title := strings.ToLower(page.Title)
	text := strings.ToLower(page.Text)
	score := 0
	for _, term := range terms {
		lower := strings.ToLower(term)
		score += strings.Count(title, lower) * 4
		score += strings.Count(text, lower)
	}
	return score
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
		for _, term := range strings.Fields(query) {
			if candidate := strings.Index(lowerText, strings.ToLower(term)); candidate >= 0 {
				index = candidate
				lowerQuery = strings.ToLower(term)
				break
			}
		}
	}
	if index < 0 {
		if utf8.RuneCountInString(text) <= radius*2 {
			return text
		}
		runes := []rune(text)
		return string(runes[:radius*2]) + "…"
	}
	runes := []rune(text)
	prefix := utf8.RuneCountInString(text[:index])
	queryRunes := utf8.RuneCountInString(lowerQuery)
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
