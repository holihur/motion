package httpapi

import (
	"crypto/rand"
	"encoding/base64"
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/motion/server/internal/model"
)

var allowedScopes = map[string]string{
	"workspace:read":  "Read workspaces, members and pages",
	"workspace:write": "Manage workspaces and members",
	"pages:read":      "Read pages and revision history",
	"pages:write":     "Create, edit and delete pages",
	"ai:use":          "Use AI and the document agent",
}

func (s *Server) listTokens(w http.ResponseWriter, r *http.Request) {
	if currentAuth(r).Method != "jwt" {
		writeErr(w, http.StatusForbidden, "personal access tokens can only be managed from a signed-in session")
		return
	}
	cur, err := s.store.Tokens.Find(r.Context(),
		bson.M{"userId": currentUserID(r)},
		options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}),
	)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load tokens")
		return
	}
	defer cur.Close(r.Context())
	tokens := make([]model.APIToken, 0)
	if err := cur.All(r.Context(), &tokens); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load tokens")
		return
	}
	writeJSON(w, http.StatusOK, tokens)
}

type createTokenRequest struct {
	Name          string   `json:"name"`
	Scopes        []string `json:"scopes"`
	ExpiresInDays *int     `json:"expiresInDays"`
}

func (s *Server) createToken(w http.ResponseWriter, r *http.Request) {
	if currentAuth(r).Method != "jwt" {
		writeErr(w, http.StatusForbidden, "personal access tokens can only be managed from a signed-in session")
		return
	}
	var req createTokenRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	if req.Name == "" || len(req.Name) > 80 {
		writeErr(w, http.StatusBadRequest, "token name must be between 1 and 80 characters")
		return
	}
	seen := map[string]bool{}
	scopes := make([]string, 0, len(req.Scopes))
	for _, scope := range req.Scopes {
		scope = strings.TrimSpace(scope)
		if _, ok := allowedScopes[scope]; !ok {
			writeErr(w, http.StatusBadRequest, "unknown scope: "+scope)
			return
		}
		if !seen[scope] {
			seen[scope] = true
			scopes = append(scopes, scope)
		}
	}
	if len(scopes) == 0 {
		writeErr(w, http.StatusBadRequest, "choose at least one scope")
		return
	}

	var expiresAt *time.Time
	if req.ExpiresInDays != nil && *req.ExpiresInDays > 0 {
		if *req.ExpiresInDays > 3650 {
			writeErr(w, http.StatusBadRequest, "token expiry cannot exceed 10 years")
			return
		}
		expiry := time.Now().UTC().AddDate(0, 0, *req.ExpiresInDays)
		expiresAt = &expiry
	}

	random := make([]byte, 32)
	if _, err := rand.Read(random); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not create token")
		return
	}
	raw := "motion_pat_" + base64.RawURLEncoding.EncodeToString(random)
	record := model.APIToken{
		ID:        primitive.NewObjectID(),
		UserID:    currentUserID(r),
		Name:      req.Name,
		Prefix:    raw[:20],
		Hash:      scopeHash(raw),
		Scopes:    scopes,
		ExpiresAt: expiresAt,
		CreatedAt: time.Now().UTC(),
	}
	if _, err := s.store.Tokens.InsertOne(r.Context(), record); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not create token")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"token": raw, "accessToken": record})
}

func (s *Server) deleteToken(w http.ResponseWriter, r *http.Request) {
	if currentAuth(r).Method != "jwt" {
		writeErr(w, http.StatusForbidden, "personal access tokens can only be managed from a signed-in session")
		return
	}
	tokenID, err := primitive.ObjectIDFromHex(chiURLParam(r, "tokenID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid token id")
		return
	}
	result, err := s.store.Tokens.DeleteOne(r.Context(), bson.M{"_id": tokenID, "userId": currentUserID(r)})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not revoke token")
		return
	}
	if result.DeletedCount == 0 {
		writeErr(w, http.StatusNotFound, "token not found")
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
