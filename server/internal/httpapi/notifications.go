package httpapi

import (
	"context"
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/motion/server/internal/model"
)

// notifyUser persists a notification and pushes it over realtime.
// Failures are silent by design: notifications must never break the main flow.
func (s *Server) notifyUser(ctx context.Context, n model.Notification) {
	if n.UserID.IsZero() || n.WorkspaceID.IsZero() {
		return
	}
	if !s.notifyAllowed(ctx, n.UserID, n.Type) {
		return
	}
	n.ID = primitive.NewObjectID()
	n.CreatedAt = time.Now().UTC()
	if _, err := s.store.Notifications.InsertOne(ctx, n); err != nil {
		return
	}
	s.hub.BroadcastWorkspace(n.WorkspaceID.Hex(), map[string]any{
		"type": "notify", "workspaceId": n.WorkspaceID.Hex(),
		"userId": n.UserID.Hex(), "notificationId": n.ID.Hex(),
		"kind": n.Type, "title": n.Title,
	}, "")
	// 外发：配了 webhook 集成（含企微机器人）的工作区自动收到，可用 notification.* 订阅。
	s.webhooks.Emit(ctx, n.WorkspaceID, "notification.created", map[string]any{
		"notificationId": n.ID.Hex(), "userId": n.UserID.Hex(),
		"kind": n.Type, "title": n.Title, "body": n.Body,
		"pageId": n.PageID, "blockId": n.BlockID, "commentId": n.CommentID,
		"actor": n.ActorName,
	})
}

// extractMentionIDs returns mentioned user ids from a block's lexical rich state.
func extractMentionIDs(rich string) map[string]bool {
	out := map[string]bool{}
	rich = strings.TrimSpace(rich)
	if rich == "" {
		return out
	}
	var doc struct {
		Root *json.RawMessage `json:"root"`
	}
	if err := json.Unmarshal([]byte(rich), &doc); err != nil || doc.Root == nil {
		return out
	}
	var walk func(node map[string]any)
	walk = func(node map[string]any) {
		if node == nil {
			return
		}
		if typ, _ := node["type"].(string); typ == "mention" {
			if id, _ := node["userId"].(string); strings.TrimSpace(id) != "" {
				out[strings.TrimSpace(id)] = true
			}
		}
		if children, ok := node["children"].([]any); ok {
			for _, child := range children {
				if m, ok := child.(map[string]any); ok {
					walk(m)
				}
			}
		}
	}
	var root map[string]any
	if err := json.Unmarshal(*doc.Root, &root); err == nil {
		walk(root)
	}
	return out
}

func blockMentions(blocks []model.Block) map[string]map[string]bool {
	// blockID -> mentioned userIDs
	out := map[string]map[string]bool{}
	for _, b := range blocks {
		if ids := extractMentionIDs(b.Rich); len(ids) > 0 {
			out[b.ID] = ids
		}
	}
	return out
}

// notifyNewMentions diffs old vs new blocks and notifies newly @-mentioned members.
func (s *Server) notifyNewMentions(ctx context.Context, page model.Page, oldBlocks, newBlocks []model.Block, actorID primitive.ObjectID, actorName string) {
	before := blockMentions(oldBlocks)
	after := blockMentions(newBlocks)
	if len(after) == 0 {
		return
	}
	for blockID, ids := range after {
		seen := before[blockID]
		for userHex := range ids {
			if seen[userHex] {
				continue
			}
			uid, err := primitive.ObjectIDFromHex(userHex)
			if err != nil || uid == actorID {
				continue
			}
			// Must be a workspace member with access.
			if _, _, err := s.accessibleWorkspaceFor(ctx, page.WorkspaceID, uid); err != nil {
				continue
			}
			title := strings.TrimSpace(page.Title)
			if title == "" {
				title = "Untitled"
			}
			s.notifyUser(ctx, model.Notification{
				UserID: uid, WorkspaceID: page.WorkspaceID,
				ActorID: actorID, ActorName: actorName,
				Type: "mention", Title: actorName + " @了你",
				Body: "在「" + title + "」中提及了你",
				PageID: page.ID.Hex(), BlockID: blockID,
			})
		}
	}
}

// GET /notifications?unread=1&limit=
func (s *Server) listNotifications(w http.ResponseWriter, r *http.Request) {
	userID := currentUserID(r)
	filter := bson.M{"userId": userID}
	if strings.TrimSpace(r.URL.Query().Get("unread")) != "" {
		filter["read"] = false
	}
	limit := int64(50)
	if raw := strings.TrimSpace(r.URL.Query().Get("limit")); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 && n <= 200 {
			limit = int64(n)
		}
	}
	cur, err := s.store.Notifications.Find(r.Context(), filter,
		options.Find().SetSort(bson.D{{Key: "createdAt", Value: -1}}).SetLimit(limit))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load notifications")
		return
	}
	defer cur.Close(r.Context())
	items := make([]model.Notification, 0)
	if err := cur.All(r.Context(), &items); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load notifications")
		return
	}
	unread, _ := s.store.Notifications.CountDocuments(r.Context(), bson.M{"userId": userID, "read": false})
	writeJSON(w, http.StatusOK, map[string]any{"items": items, "unread": unread})
}

// POST /notifications/{notificationID}/read
func (s *Server) readNotification(w http.ResponseWriter, r *http.Request) {
	id, err := primitive.ObjectIDFromHex(chiURLParam(r, "notificationID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid notification id")
		return
	}
	userID := currentUserID(r)
	now := time.Now().UTC()
	res, err := s.store.Notifications.UpdateOne(r.Context(),
		bson.M{"_id": id, "userId": userID},
		bson.M{"$set": bson.M{"read": true, "readAt": now}})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not update notification")
		return
	}
	if res.MatchedCount == 0 {
		writeErr(w, http.StatusNotFound, "notification not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// POST /notifications/read-all
func (s *Server) readAllNotifications(w http.ResponseWriter, r *http.Request) {
	userID := currentUserID(r)
	now := time.Now().UTC()
	_, err := s.store.Notifications.UpdateMany(r.Context(),
		bson.M{"userId": userID, "read": false},
		bson.M{"$set": bson.M{"read": true, "readAt": now}})
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not update notifications")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

// notifyCommentReply notifies the parent comment author of a reply.
func (s *Server) notifyCommentReply(ctx context.Context, page model.Page, parent model.Comment, reply model.Comment, actorName string) {
	if parent.AuthorID.IsZero() || parent.AuthorID == reply.AuthorID {
		return
	}
	if _, _, err := s.accessibleWorkspaceFor(ctx, page.WorkspaceID, parent.AuthorID); err != nil {
		return
	}
	title := strings.TrimSpace(page.Title)
	if title == "" {
		title = "Untitled"
	}
	s.notifyUser(ctx, model.Notification{
		UserID: parent.AuthorID, WorkspaceID: page.WorkspaceID,
		ActorID: reply.AuthorID, ActorName: actorName,
		Type: "comment_reply", Title: actorName + " 回复了你的评论",
		Body: "在「" + title + "」：" + truncateRunes(reply.Body, 120),
		PageID: page.ID.Hex(), BlockID: reply.BlockID, CommentID: reply.ID.Hex(),
	})
}
// notifyAllowed checks the recipient's preferences (default: all enabled).
func (s *Server) notifyAllowed(ctx context.Context, userID primitive.ObjectID, kind string) bool {
	var user model.User
	if err := s.store.Users.FindOne(ctx, bson.M{"_id": userID}).Decode(&user); err != nil {
		return true
	}
	if user.NotifyPrefs == nil {
		return true
	}
	pref := user.NotifyPrefs
	switch kind {
	case "mention":
		return pref.Mention == nil || *pref.Mention
	case "comment_reply":
		return pref.Reply == nil || *pref.Reply
	case "agent_done", "agent_failed":
		return pref.AgentDone == nil || *pref.AgentDone
	default:
		return true
	}
}

// GET /notifications/prefs
func (s *Server) getNotifyPrefs(w http.ResponseWriter, r *http.Request) {
	userID := currentUserID(r)
	var user model.User
	if err := s.store.Users.FindOne(r.Context(), bson.M{"_id": userID}).Decode(&user); err != nil {
		writeErr(w, http.StatusUnauthorized, "account no longer exists")
		return
	}
	prefs := model.NotifyPrefs{}
	if user.NotifyPrefs != nil {
		prefs = *user.NotifyPrefs
	}
	writeJSON(w, http.StatusOK, prefsWithDefaults(prefs))
}

func prefsWithDefaults(prefs model.NotifyPrefs) map[string]bool {
	on := func(b *bool) bool { return b == nil || *b }
	return map[string]bool{
		"mention":   on(prefs.Mention),
		"reply":     on(prefs.Reply),
		"agentDone": on(prefs.AgentDone),
		"browser":   prefs.Browser != nil && *prefs.Browser,
	}
}

// PUT /notifications/prefs
func (s *Server) saveNotifyPrefs(w http.ResponseWriter, r *http.Request) {
	userID := currentUserID(r)
	var req map[string]bool
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	boolPtr := func(b bool) *bool { v := b; return &v }
	prefs := model.NotifyPrefs{}
	if v, ok := req["mention"]; ok {
		prefs.Mention = boolPtr(v)
	}
	if v, ok := req["reply"]; ok {
		prefs.Reply = boolPtr(v)
	}
	if v, ok := req["agentDone"]; ok {
		prefs.AgentDone = boolPtr(v)
	}
	if v, ok := req["browser"]; ok {
		prefs.Browser = boolPtr(v)
	}
	if _, err := s.store.Users.UpdateByID(r.Context(), userID, bson.M{"$set": bson.M{
		"notifyPrefs": prefs, "updatedAt": time.Now().UTC(),
	}}); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not save preferences")
		return
	}
	writeJSON(w, http.StatusOK, prefsWithDefaults(prefs))
}
