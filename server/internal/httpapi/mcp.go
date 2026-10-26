package httpapi

import (
	"net/http"
	"strings"

	"go.mongodb.org/mongo-driver/bson"

	"github.com/motion/server/internal/mcpserver"
	"github.com/motion/server/internal/model"
)

func (s *Server) mcpEndpoint(w http.ResponseWriter, r *http.Request) {
	if !s.siteSnapshot().MCPEnabled {
		writeErr(w, http.StatusForbidden, "MCP is disabled by the instance administrator")
		return
	}
	header := r.Header.Get("Authorization")
	if !strings.HasPrefix(header, "Bearer ") {
		w.Header().Set("WWW-Authenticate", `Bearer realm="motion"`)
		writeErr(w, http.StatusUnauthorized, "missing bearer token")
		return
	}
	raw := strings.TrimPrefix(header, "Bearer ")
	var info AuthInfo
	if isPersonalToken(raw) {
		pat, err := s.authenticatePAT(r, raw)
		if err != nil {
			writeErr(w, http.StatusUnauthorized, err.Error())
			return
		}
		info = pat
	} else {
		userID, err := s.tokens.Parse(raw)
		if err != nil {
			writeErr(w, http.StatusUnauthorized, "invalid or expired token")
			return
		}
		info = jwtAuth(userID)
	}
	if !hasScope(info, "pages:read") {
		writeErr(w, http.StatusForbidden, "this token is missing the required scope: pages:read")
		return
	}
	var user model.User
	if err := s.store.Users.FindOne(r.Context(), bson.M{"_id": info.UserID}).Decode(&user); err != nil {
		writeErr(w, http.StatusUnauthorized, "account no longer exists")
		return
	}
	ctx := mcpserver.WithAuth(r.Context(), mcpserver.Auth{
		UserID: info.UserID, Name: user.Name, Scopes: info.Scopes,
	})
	s.mcp.Handler().ServeHTTP(w, r.WithContext(ctx))
}
