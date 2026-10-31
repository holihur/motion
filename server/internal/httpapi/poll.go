package httpapi

import (
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/motion/server/internal/model"
)

// sanitizePoll caps poll payloads on save paths.
func sanitizePoll(poll *model.PollData) *model.PollData {
	if poll == nil {
		return nil
	}
	poll.Question = truncateRunes(strings.ReplaceAll(poll.Question, "\x00", ""), 500)
	if len(poll.Options) > 20 {
		poll.Options = poll.Options[:20]
	}
	for i := range poll.Options {
		poll.Options[i].Text = truncateRunes(strings.ReplaceAll(poll.Options[i].Text, "\x00", ""), 200)
		if len(poll.Options[i].Votes) > 10000 {
			poll.Options[i].Votes = poll.Options[i].Votes[:10000]
		}
		if strings.TrimSpace(poll.Options[i].ID) == "" {
			poll.Options[i].ID = primitive.NewObjectID().Hex()
		}
	}
	return poll
}

// POST /api/pages/{pageID}/blocks/{blockID}/vote {optionIds: []string}
func (s *Server) votePoll(w http.ResponseWriter, r *http.Request) {
	pageID, err := primitive.ObjectIDFromHex(chiURLParam(r, "pageID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid page id")
		return
	}
	page, ok := s.editablePage(w, r, pageID)
	if !ok {
		return
	}
	if page.Archived {
		writeErr(w, http.StatusForbidden, "page is in Trash; restore it before voting")
		return
	}
	blockID := strings.TrimSpace(chiURLParam(r, "blockID"))
	var req struct {
		OptionIDs []string `json:"optionIds"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	idx := -1
	for i, b := range page.Blocks {
		if b.ID == blockID {
			idx = i
			break
		}
	}
	if idx < 0 {
		writeErr(w, http.StatusNotFound, "block not found")
		return
	}
	block := page.Blocks[idx]
	if block.Type != "poll" || block.Poll == nil {
		writeErr(w, http.StatusBadRequest, "not a poll block")
		return
	}
	if block.Poll.Closed {
		writeErr(w, http.StatusBadRequest, "this poll is closed")
		return
	}
	want := map[string]bool{}
	for _, id := range req.OptionIDs {
		id = strings.TrimSpace(id)
		if id != "" {
			want[id] = true
		}
		if !block.Poll.Multiple {
			break
		}
	}
	if len(want) == 0 {
		writeErr(w, http.StatusBadRequest, "pick at least one option")
		return
	}
	valid := map[string]bool{}
	for _, opt := range block.Poll.Options {
		valid[opt.ID] = true
	}
	for id := range want {
		if !valid[id] {
			writeErr(w, http.StatusBadRequest, "unknown option")
			return
		}
	}
	me := currentUserID(r).Hex()
	for i := range block.Poll.Options {
		kept := block.Poll.Options[i].Votes[:0]
		for _, v := range block.Poll.Options[i].Votes {
			if v != me {
				kept = append(kept, v)
			}
		}
		if want[block.Poll.Options[i].ID] {
			kept = append(kept, me)
		}
		block.Poll.Options[i].Votes = kept
	}
	page.Blocks[idx] = block
	rev := page.BlocksRev + 1
	if rev < 1 {
		rev = 1
	}
	now := time.Now().UTC()
	if _, err := s.store.Pages.UpdateByID(r.Context(), page.ID, bson.M{"$set": bson.M{
		"blocks": page.Blocks, "blocksRev": rev,
		"text": textFromBlocks(page.Blocks), "updatedAt": now,
	}}); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not save vote")
		return
	}
	_, name := s.editorFor(r)
	userID := currentUserID(r).Hex()
	order := make([]string, len(page.Blocks))
	for i, b := range page.Blocks {
		order[i] = b.ID
	}
	s.hub.Broadcast(page.ID.Hex(), map[string]any{
		"type": "ops", "pageId": page.ID.Hex(), "clientId": clientID(r),
		"blocksRev": rev, "order": order, "upserts": []model.Block{block}, "deletes": []string{},
		"updatedAt": now,
		"editor": map[string]string{"userId": userID, "name": name},
	}, clientID(r))
	writeJSON(w, http.StatusOK, block)
}
