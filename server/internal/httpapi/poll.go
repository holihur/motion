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
// Viewers may vote; the update is guarded by blocksRev and retried so a vote
// cannot silently overwrite a concurrent page edit.
func (s *Server) votePoll(w http.ResponseWriter, r *http.Request) {
	pageID, err := primitive.ObjectIDFromHex(chiURLParam(r, "pageID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid page id")
		return
	}
	page, _, err := s.accessiblePage(r, pageID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "page not found")
		return
	}
	if page.Archived {
		writeErr(w, http.StatusForbidden, "page is in Trash; restore it before voting")
		return
	}
	if page.Locked {
		writeErr(w, http.StatusForbidden, "page is locked; unlock it before voting")
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
	want := map[string]bool{}
	for _, id := range req.OptionIDs {
		id = strings.TrimSpace(id)
		if id != "" {
			want[id] = true
		}
	}
	if len(want) == 0 || len(want) > 20 {
		writeErr(w, http.StatusBadRequest, "pick at least one option")
		return
	}
	me := currentUserID(r).Hex()
	var updated model.Block
	saved := false
	for attempt := 0; attempt < 5; attempt++ {
		if attempt > 0 {
			page, _, err = s.accessiblePage(r, pageID)
			if err != nil || page.Archived || page.Locked {
				break
			}
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
		if !block.Poll.Multiple && len(want) > 1 {
			writeErr(w, http.StatusBadRequest, "this poll accepts a single option")
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
		options := make([]model.PollOption, len(block.Poll.Options))
		for i, opt := range block.Poll.Options {
			votes := make([]string, 0, len(opt.Votes)+1)
			for _, vote := range opt.Votes {
				if vote != me {
					votes = append(votes, vote)
				}
			}
			if want[opt.ID] {
				votes = append(votes, me)
			}
			options[i] = model.PollOption{ID: opt.ID, Text: opt.Text, Votes: votes}
		}
		block.Poll.Options = options
		page.Blocks[idx] = block
		rev := page.BlocksRev + 1
		if rev < 1 {
			rev = 1
		}
		now := time.Now().UTC()
		result, err := s.store.Pages.UpdateOne(r.Context(), bson.M{"_id": page.ID, "blocksRev": page.BlocksRev}, bson.M{"$set": bson.M{
			"blocks": page.Blocks, "blocksRev": rev,
			"text": textFromBlocks(page.Blocks), "updatedAt": now,
		}})
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "could not save vote")
			return
		}
		if result.MatchedCount == 0 {
			continue
		}
		updated = block
		saved = true
		_, name := s.editorFor(r)
		order := make([]string, len(page.Blocks))
		for i, b := range page.Blocks {
			order[i] = b.ID
		}
		s.hub.Broadcast(page.ID.Hex(), map[string]any{
			"type": "ops", "pageId": page.ID.Hex(), "clientId": clientID(r),
			"blocksRev": rev, "order": order, "upserts": []model.Block{block}, "deletes": []string{},
			"updatedAt": now,
			"editor":    map[string]string{"userId": me, "name": name},
		}, clientID(r))
		break
	}
	if !saved {
		writeErr(w, http.StatusConflict, "page changed on another device; try again")
		return
	}
	writeJSON(w, http.StatusOK, updated)
}
