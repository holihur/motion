package httpapi

import (
	"errors"
	"log/slog"
	"net/http"
	"net/url"
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

func (s *Server) websocketOriginAllowed(r *http.Request) bool {
	origin := strings.TrimSpace(r.Header.Get("Origin"))
	if origin == "" {
		return true
	}
	parsed, err := url.Parse(origin)
	if err != nil {
		return false
	}
	if strings.EqualFold(parsed.Host, r.Host) {
		return true
	}
	for _, allowed := range s.cfg.CORSOrigins {
		if strings.EqualFold(strings.TrimRight(allowed, "/"), strings.TrimRight(origin, "/")) {
			return true
		}
	}
	return false
}

type realtimeAuthMessage struct {
	Type     string `json:"type"`
	Token    string `json:"token"`
	PageID   string `json:"pageId"`
	ClientID string `json:"clientId"`
}

func (s *Server) realtimeUser(r *http.Request, token string) (primitive.ObjectID, error) {
	if isPersonalToken(token) {
		info, err := s.authenticatePAT(r, token)
		if err != nil {
			return primitive.NilObjectID, err
		}
		if !hasScope(info, "pages:read") {
			return primitive.NilObjectID, errors.New("missing pages:read scope")
		}
		return info.UserID, nil
	}
	return s.tokens.Parse(token)
}

func (s *Server) websocket(w http.ResponseWriter, r *http.Request) {
	token := strings.TrimSpace(r.URL.Query().Get("token"))
	if !s.websocketOriginAllowed(r) {
		writeErr(w, http.StatusForbidden, "websocket origin is not allowed")
		return
	}

	// Current clients authenticate in the first frame so bearer tokens never
	// appear in access logs or browser history. The query-token path remains
	// for older clients during upgrades.
	queryPageID := strings.TrimSpace(r.URL.Query().Get("pageId"))
	if token != "" {
		pageID, err := primitive.ObjectIDFromHex(queryPageID)
		if err != nil {
			writeErr(w, http.StatusBadRequest, "invalid page id")
			return
		}
		userID, err := s.realtimeUser(r, token)
		if err != nil {
			writeErr(w, http.StatusUnauthorized, "invalid or expired token")
			return
		}
		s.serveRealtime(w, r, pageID, userID, strings.TrimSpace(r.URL.Query().Get("clientId")))
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Warn("websocket upgrade failed", "error", err)
		return
	}
	_ = conn.SetReadDeadline(time.Now().Add(10 * time.Second))
	var auth realtimeAuthMessage
	if err := conn.ReadJSON(&auth); err != nil || auth.Type != "auth" {
		_ = conn.WriteJSON(map[string]string{"type": "error", "error": "authentication required"})
		_ = conn.Close()
		return
	}
	_ = conn.SetReadDeadline(time.Time{})
	pageID, err := primitive.ObjectIDFromHex(strings.TrimSpace(auth.PageID))
	if err != nil {
		_ = conn.WriteJSON(map[string]string{"type": "error", "error": "invalid page id"})
		_ = conn.Close()
		return
	}
	userID, err := s.realtimeUser(r, strings.TrimSpace(auth.Token))
	if err != nil {
		_ = conn.WriteJSON(map[string]string{"type": "error", "error": "invalid or expired token"})
		_ = conn.Close()
		return
	}
	s.serveRealtimeConn(w, r, conn, pageID, userID, strings.TrimSpace(auth.ClientID))
}

func (s *Server) serveRealtime(w http.ResponseWriter, r *http.Request, pageID, userID primitive.ObjectID, clientID string) {
	if !s.websocketOriginAllowed(r) {
		writeErr(w, http.StatusForbidden, "websocket origin is not allowed")
		return
	}
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Warn("websocket upgrade failed", "error", err)
		return
	}
	s.serveRealtimeConn(w, r, conn, pageID, userID, clientID)
}

func (s *Server) serveRealtimeConn(w http.ResponseWriter, r *http.Request, conn *websocket.Conn, pageID, userID primitive.ObjectID, clientID string) {
	_ = w
	page, _, err := s.accessiblePageFor(r.Context(), pageID, userID)
	if err != nil {
		_ = conn.WriteJSON(map[string]string{"type": "error", "error": "page not found"})
		_ = conn.Close()
		return
	}
	var user model.User
	if err := s.store.Users.FindOne(r.Context(), bson.M{"_id": userID}).Decode(&user); err != nil {
		_ = conn.WriteJSON(map[string]string{"type": "error", "error": "account no longer exists"})
		_ = conn.Close()
		return
	}
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
