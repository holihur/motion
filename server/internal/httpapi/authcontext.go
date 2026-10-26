package httpapi

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/motion/server/internal/model"
)

type AuthInfo struct {
	UserID   primitive.ObjectID
	Method   string // "jwt" or "pat"
	TokenID  primitive.ObjectID
	Scopes   map[string]bool
	Expires  *time.Time
}

const authInfoKey ctxKey = "authInfo"

func withAuthInfo(ctx context.Context, info AuthInfo) context.Context {
	return context.WithValue(ctx, authInfoKey, info)
}

func currentAuth(r *http.Request) AuthInfo {
	info, _ := r.Context().Value(authInfoKey).(AuthInfo)
	return info
}

func jwtAuth(userID primitive.ObjectID) AuthInfo {
	return AuthInfo{UserID: userID, Method: "jwt", Scopes: map[string]bool{"*": true}}
}

func scopeHash(raw string) string {
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:])
}

func (s *Server) authenticatePAT(r *http.Request, token string) (AuthInfo, error) {
	var record model.APIToken
	if err := s.store.Tokens.FindOne(r.Context(), bson.M{"hash": scopeHash(token)}).Decode(&record); err != nil {
		return AuthInfo{}, err
	}
	now := time.Now().UTC()
	if record.ExpiresAt != nil && record.ExpiresAt.Before(now) {
		return AuthInfo{}, errTokenExpired
	}
	var user model.User
	if err := s.store.Users.FindOne(r.Context(), bson.M{"_id": record.UserID}).Decode(&user); err != nil {
		return AuthInfo{}, errInvalidToken
	}
	scopes := make(map[string]bool, len(record.Scopes))
	for _, scope := range record.Scopes {
		scopes[scope] = true
	}
	go func(id primitive.ObjectID) {
		ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
		defer cancel()
		_, _ = s.store.Tokens.UpdateByID(ctx, id, bson.M{"$set": bson.M{"lastUsedAt": now}})
	}(record.ID)

	return AuthInfo{
		UserID:  record.UserID,
		Method:  "pat",
		TokenID: record.ID,
		Scopes:  scopes,
		Expires: record.ExpiresAt,
	}, nil
}

func hasScope(info AuthInfo, scope string) bool {
	if info.Method == "jwt" || info.Scopes["*"] || info.Scopes[scope] {
		return true
	}
	return false
}

func (s *Server) requireScope(scope string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if !hasScope(currentAuth(r), scope) {
				writeErr(w, http.StatusForbidden, "this token is missing the required scope: "+scope)
				return
			}
			next.ServeHTTP(w, r)
		})
	}
}

func isPersonalToken(token string) bool {
	return strings.HasPrefix(token, "motion_pat_")
}

var (
	errInvalidToken = &authError{message: "invalid access token"}
	errTokenExpired = &authError{message: "access token has expired"}
)

type authError struct{ message string }

func (e *authError) Error() string { return e.message }
