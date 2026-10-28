package httpapi

import (
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/gorilla/websocket"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/motion/server/internal/model"
	"github.com/motion/server/internal/realtime"
)

var upgrader = websocket.Upgrader{
	ReadBufferSize:  4096,
	WriteBufferSize: 4096,
	CheckOrigin:     func(_ *http.Request) bool { return true },
}

func (s *Server) websocket(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimSpace(r.URL.Query().Get("token"))
	if token == "" {
		writeErr(w, http.StatusUnauthorized, "missing token")
		return
	}
	pageID, err := primitive.ObjectIDFromHex(r.URL.Query().Get("pageId"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid page id")
		return
	}

	var userID primitive.ObjectID
	var method string
	if isPersonalToken(token) {
		info, err := s.authenticatePAT(r, token)
		if err != nil {
			writeErr(w, http.StatusUnauthorized, err.Error())
			return
		}
		if !hasScope(info, "pages:read") {
			writeErr(w, http.StatusForbidden, "this token is missing the required scope: pages:read")
			return
		}
		userID, method = info.UserID, info.Method
	} else {
		parsed, err := s.tokens.Parse(token)
		if err != nil {
			writeErr(w, http.StatusUnauthorized, "invalid or expired token")
			return
		}
		userID, method = parsed, "jwt"
	}
	_ = method

	page, _, err := s.accessiblePageFor(r.Context(), pageID, userID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "page not found")
		return
	}
	var user model.User
	if err := s.store.Users.FindOne(r.Context(), bson.M{"_id": userID}).Decode(&user); err != nil {
		writeErr(w, http.StatusUnauthorized, "account no longer exists")
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Warn("websocket upgrade failed", "error", err)
		return
	}

	clientID := strings.TrimSpace(r.URL.Query().Get("clientId"))
	if clientID == "" {
		clientID = primitive.NewObjectID().Hex()
	}
	client := &realtime.Client{
		Hub:         s.hub,
		Conn:        conn,
		Send:        make(chan []byte, 256),
		Done:        make(chan struct{}),
		PageID:      page.ID.Hex(),
		WorkspaceID: page.WorkspaceID.Hex(),
		ClientID:    clientID,
		UserID:      user.ID.Hex(),
		Name:        user.Name,
		Color:       realtime.ColorFor(user.ID.Hex()),
	}
	s.hub.Add(client)
	go client.WritePump()
	go client.ReadPump()
}

func (s *Server) broadcastTree(workspaceID primitive.ObjectID, clientID string) {
	s.hub.BroadcastWorkspace(workspaceID.Hex(), map[string]any{
		"type":        "tree",
		"workspaceId": workspaceID.Hex(),
	}, clientID)
}

func (s *Server) editorFor(r *http.Request) (string, string) {
	userID := currentUserID(r)
	var user model.User
	if err := s.store.Users.FindOne(r.Context(), bson.M{"_id": userID}).Decode(&user); err != nil {
		return userID.Hex(), "Someone"
	}
	return userID.Hex(), user.Name
}

var _ = time.Now

func clientID(r *http.Request) string {
	return strings.TrimSpace(r.Header.Get("X-Motion-Client"))
}
