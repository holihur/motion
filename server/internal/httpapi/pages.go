package httpapi

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"
	"time"
	"unicode/utf8"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/motion/server/internal/blocks"
	"github.com/motion/server/internal/model"
	"github.com/motion/server/internal/realtime"
)

var blockTypes = map[string]bool{
	"paragraph":      true,
	"heading1":       true,
	"heading2":       true,
	"heading3":       true,
	"bulleted":       true,
	"numbered":       true,
	"todo":           true,
	"quote":          true,
	"callout":        true,
	"code":           true,
	"divider":        true,
	"image":          true,
	"table":          true,
	"diagram":        true,
	"password":       true,
	"bookmark":       true,
	"video":          true,
	"embed":          true,
	"file":           true,
	"equation":       true,
	"toc":            true,
	"gantt":          true,
	"chart":          true,
	"toggle":         true,
	"toggleHeading1": true,
	"toggleHeading2": true,
	"toggleHeading3": true,
	"pageLink":       true,
	"breadcrumb":     true,
	"columns":        true,
	"qrcode":         true,
	"barcode":        true,
	"form":           true,
	"map":            true,
	"content":        true,
}

type createPageRequest struct {
	WorkspaceID string  `json:"workspaceId"`
	ParentID    *string `json:"parentId"`
	Title       *string `json:"title"`
	Icon        string  `json:"icon"`
}

func (s *Server) createPage(w http.ResponseWriter, r *http.Request) {
	var req createPageRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	wsID, err := primitive.ObjectIDFromHex(req.WorkspaceID)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid workspace id")
		return
	}
	if _, ok := s.requireEditor(w, r, wsID); !ok {
		return
	}

	var parentID *primitive.ObjectID
	if req.ParentID != nil && strings.TrimSpace(*req.ParentID) != "" {
		pid, err := primitive.ObjectIDFromHex(*req.ParentID)
		if err != nil {
			writeErr(w, http.StatusBadRequest, "invalid parent page id")
			return
		}
		var parent model.Page
		if err := s.store.Pages.FindOne(r.Context(), bson.M{"_id": pid, "workspaceId": wsID}).Decode(&parent); err != nil {
			writeErr(w, http.StatusBadRequest, "parent page not found")
			return
		}
		parentID = &pid
	}

	title := "Untitled"
	if req.Title != nil {
		title = strings.TrimSpace(*req.Title)
	}
	if utf8.RuneCountInString(title) > 200 {
		writeErr(w, http.StatusBadRequest, "title is too long")
		return
	}
	icon := strings.TrimSpace(req.Icon)

	order, err := s.nextOrder(r, wsID, parentID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not prepare page")
		return
	}

	now := time.Now().UTC()
	page := model.Page{
		ID:          primitive.NewObjectID(),
		WorkspaceID: wsID,
		ParentID:    parentID,
		Title:       title,
		Icon:        icon,
		Cover:       "",
		Blocks:      []model.Block{{ID: primitive.NewObjectID().Hex(), Type: "paragraph", Text: ""}},
		BlocksRev:   1,
		Text:        "",
		Order:       order,
		CreatedBy:   currentUserID(r),
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if _, err := s.store.Pages.InsertOne(r.Context(), page); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not create page")
		return
	}
	s.broadcastTree(wsID, clientID(r))
	writeJSON(w, http.StatusCreated, page)
}

func (s *Server) nextOrder(r *http.Request, wsID primitive.ObjectID, parentID *primitive.ObjectID) (float64, error) {
	filter := bson.M{"workspaceId": wsID, "parentId": parentID}
	if parentID == nil {
		filter["parentId"] = nil
	}
	var last model.Page
	err := s.store.Pages.FindOne(r.Context(), filter,
		options.FindOne().SetSort(bson.D{{Key: "order", Value: -1}}).SetProjection(bson.M{"order": 1}),
	).Decode(&last)
	if err == mongo.ErrNoDocuments {
		return 1024, nil
	}
	if err != nil {
		return 0, err
	}
	return last.Order + 1024, nil
}

func (s *Server) getPage(w http.ResponseWriter, r *http.Request) {
	pageID, err := primitive.ObjectIDFromHex(chiURLParam(r, "pageID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid page id")
		return
	}
	page, role, err := s.accessiblePage(r, pageID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "page not found")
		return
	}
	page.Role = role
	if page.Blocks == nil {
		page.Blocks = []model.Block{}
	}
	writeJSON(w, http.StatusOK, page)
}

func (s *Server) updatePage(w http.ResponseWriter, r *http.Request) {
	pageID, err := primitive.ObjectIDFromHex(chiURLParam(r, "pageID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid page id")
		return
	}
	page, ok := s.editablePage(w, r, pageID)
	if !ok {
		return
	}

	var raw map[string]json.RawMessage
	if err := decodeJSON(r, &raw); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}

	updates := bson.M{}
	unset := bson.M{}
	now := time.Now().UTC()

	if value, ok := raw["title"]; ok {
		var title string
		if err := json.Unmarshal(value, &title); err != nil {
			writeErr(w, http.StatusBadRequest, "invalid title")
			return
		}
		title = strings.TrimSpace(title)
		if utf8.RuneCountInString(title) > 200 {
			writeErr(w, http.StatusBadRequest, "title is too long")
			return
		}
		updates["title"] = title
	}
	if value, ok := raw["icon"]; ok {
		var icon string
		if err := json.Unmarshal(value, &icon); err != nil {
			writeErr(w, http.StatusBadRequest, "invalid icon")
			return
		}
		updates["icon"] = strings.TrimSpace(icon)
	}
	if value, ok := raw["cover"]; ok {
		var cover string
		if err := json.Unmarshal(value, &cover); err != nil {
			writeErr(w, http.StatusBadRequest, "invalid cover")
			return
		}
		updates["cover"] = strings.TrimSpace(cover)
	}
	if value, ok := raw["isLayout"]; ok {
		var isLayout bool
		if err := json.Unmarshal(value, &isLayout); err != nil {
			writeErr(w, http.StatusBadRequest, "invalid layout flag")
			return
		}
		updates["isLayout"] = isLayout
		if isLayout {
			updates["layoutId"] = ""
		}
	}
	if value, ok := raw["theme"]; ok {
		var theme string
		if err := json.Unmarshal(value, &theme); err != nil {
			writeErr(w, http.StatusBadRequest, "invalid theme")
			return
		}
		theme = strings.TrimSpace(theme)
		if len(theme) > 40 {
			writeErr(w, http.StatusBadRequest, "invalid theme")
			return
		}
		updates["theme"] = theme
	}
	if value, ok := raw["favorite"]; ok {
		var favorite bool
		if err := json.Unmarshal(value, &favorite); err != nil {
			writeErr(w, http.StatusBadRequest, "invalid favorite")
			return
		}
		updates["favorite"] = favorite
	}

	if value, ok := raw["parentId"]; ok {
		var parentHex *string
		if err := json.Unmarshal(value, &parentHex); err != nil {
			writeErr(w, http.StatusBadRequest, "invalid parent page id")
			return
		}
		var newParent *primitive.ObjectID
		if parentHex != nil && strings.TrimSpace(*parentHex) != "" {
			pid, err := primitive.ObjectIDFromHex(*parentHex)
			if err != nil {
				writeErr(w, http.StatusBadRequest, "invalid parent page id")
				return
			}
			if pid == pageID {
				writeErr(w, http.StatusBadRequest, "a page cannot be its own parent")
				return
			}
			descendants, err := s.descendantIDs(r, page.WorkspaceID, pageID)
			if err != nil {
				writeErr(w, http.StatusInternalServerError, "could not move page")
				return
			}
			if descendants[pid] {
				writeErr(w, http.StatusBadRequest, "a page cannot be moved inside itself")
				return
			}
			var parent model.Page
			if err := s.store.Pages.FindOne(r.Context(), bson.M{"_id": pid, "workspaceId": page.WorkspaceID}).Decode(&parent); err != nil {
				writeErr(w, http.StatusBadRequest, "parent page not found")
				return
			}
			newParent = &pid
		}
		if newParent == nil {
			updates["parentId"] = nil
		} else {
			updates["parentId"] = *newParent
		}
		order, err := s.nextOrder(r, page.WorkspaceID, newParent)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "could not move page")
			return
		}
		updates["order"] = order
	}

	isLayoutRequested := strings.EqualFold(string(raw["isLayout"]), "true")
	if value, ok := raw["layoutId"]; ok && !page.IsLayout && !isLayoutRequested {
		var layoutID string
		_ = json.Unmarshal(value, &layoutID)
		layoutID = strings.TrimSpace(layoutID)
		if layoutID != "" {
			lid, err := primitive.ObjectIDFromHex(layoutID)
			if err != nil || lid == pageID {
				writeErr(w, http.StatusBadRequest, "invalid layout page")
				return
			}
			var layout model.Page
			if err := s.store.Pages.FindOne(r.Context(), bson.M{"_id": lid, "workspaceId": page.WorkspaceID, "archived": false}).Decode(&layout); err != nil || !layout.IsLayout || layout.LayoutID != "" {
				writeErr(w, http.StatusBadRequest, "layout page not found or invalid")
				return
			}
			updates["layoutId"] = layoutID
		} else {
			updates["layoutId"] = ""
		}
	}
	if value, ok := raw["archived"]; ok {
		var archived bool
		if err := json.Unmarshal(value, &archived); err != nil {
			writeErr(w, http.StatusBadRequest, "invalid archived value")
			return
		}
		if archived {
			if page.IsLayout {
				count, err := s.store.Pages.CountDocuments(r.Context(), bson.M{"layoutId": pageID, "archived": false})
				if err != nil {
					writeErr(w, http.StatusInternalServerError, "could not check layout references")
					return
				}
				if count > 0 {
					writeErr(w, http.StatusBadRequest, "this layout is still used by pages; detach it first")
					return
				}
			}
			ids, err := s.descendantIDs(r, page.WorkspaceID, pageID)
			if err != nil {
				writeErr(w, http.StatusInternalServerError, "could not archive page")
				return
			}
			ids[pageID] = true
			list := keysOf(ids)
			if _, err := s.store.Pages.UpdateMany(r.Context(), bson.M{"_id": bson.M{"$in": list}},
				bson.M{"$set": bson.M{"archived": true, "archivedAt": now, "updatedAt": now}}); err != nil {
				writeErr(w, http.StatusInternalServerError, "could not archive page")
				return
			}
		} else {
			ids, err := s.restoreIDs(r, page)
			if err != nil {
				writeErr(w, http.StatusInternalServerError, "could not restore page")
				return
			}
			if _, err := s.store.Pages.UpdateMany(r.Context(), bson.M{"_id": bson.M{"$in": ids}},
				bson.M{"$set": bson.M{"archived": false, "updatedAt": now}, "$unset": bson.M{"archivedAt": ""}}); err != nil {
				writeErr(w, http.StatusInternalServerError, "could not restore page")
				return
			}
		}
	}

	if len(updates) > 0 || len(unset) > 0 {
		updates["updatedAt"] = now
		update := bson.M{"$set": updates}
		if len(unset) > 0 {
			update["$unset"] = unset
		}
		if _, err := s.store.Pages.UpdateByID(r.Context(), pageID, update); err != nil {
			writeErr(w, http.StatusInternalServerError, "could not update page")
			return
		}
	}

	if err := s.store.Pages.FindOne(r.Context(), bson.M{"_id": pageID}).Decode(&page); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load page")
		return
	}
	if _, changed := updates["title"]; changed || updates["icon"] != nil || updates["cover"] != nil ||
		updates["favorite"] != nil || updates["archived"] != nil || updates["parentId"] != nil || updates["theme"] != nil || updates["layoutId"] != nil || updates["isLayout"] != nil {
		_, name := s.editorFor(r)
		userID := currentUserID(r).Hex()
		s.hub.Broadcast(page.ID.Hex(), map[string]any{
			"type":     "meta",
			"pageId":   page.ID.Hex(),
			"clientId": clientID(r),
			"page": map[string]any{
				"title": page.Title, "icon": page.Icon, "cover": page.Cover,
				"favorite": page.Favorite, "archived": page.Archived,
			},
			"editor": map[string]string{"userId": userID, "name": name, "color": realtime.ColorFor(userID)},
		}, clientID(r))
		s.broadcastTree(page.WorkspaceID, clientID(r))
	}
	writeJSON(w, http.StatusOK, page)
}

func (s *Server) descendantIDs(r *http.Request, wsID, rootID primitive.ObjectID) (map[primitive.ObjectID]bool, error) {
	cur, err := s.store.Pages.Find(r.Context(), bson.M{"workspaceId": wsID},
		options.Find().SetProjection(bson.M{"parentId": 1}))
	if err != nil {
		return nil, err
	}
	defer cur.Close(r.Context())

	var all []struct {
		ID       primitive.ObjectID  `bson:"_id"`
		ParentID *primitive.ObjectID `bson:"parentId"`
	}
	if err := cur.All(r.Context(), &all); err != nil {
		return nil, err
	}

	children := map[primitive.ObjectID][]primitive.ObjectID{}
	for _, p := range all {
		if p.ParentID != nil {
			children[*p.ParentID] = append(children[*p.ParentID], p.ID)
		}
	}

	found := map[primitive.ObjectID]bool{}
	queue := []primitive.ObjectID{rootID}
	for len(queue) > 0 {
		current := queue[0]
		queue = queue[1:]
		for _, child := range children[current] {
			if !found[child] {
				found[child] = true
				queue = append(queue, child)
			}
		}
	}
	return found, nil
}

func (s *Server) restoreIDs(r *http.Request, page model.Page) ([]primitive.ObjectID, error) {
	ids := map[primitive.ObjectID]bool{page.ID: true}
	descendants, err := s.descendantIDs(r, page.WorkspaceID, page.ID)
	if err != nil {
		return nil, err
	}
	for id := range descendants {
		ids[id] = true
	}

	// Restore ancestors too, so a restored page never lives under a trashed parent.
	parent := page.ParentID
	for parent != nil {
		if ids[*parent] {
			break
		}
		ids[*parent] = true
		var p model.Page
		if err := s.store.Pages.FindOne(r.Context(), bson.M{"_id": *parent}).Decode(&p); err != nil {
			break
		}
		parent = p.ParentID
	}
	return keysOf(ids), nil
}

func keysOf(m map[primitive.ObjectID]bool) []primitive.ObjectID {
	out := make([]primitive.ObjectID, 0, len(m))
	for id := range m {
		out = append(out, id)
	}
	return out
}

type saveBlocksRequest struct {
	Blocks []model.Block  `json:"blocks"`
	Base   *[]model.Block `json:"base,omitempty"`
}

func (s *Server) saveBlocks(w http.ResponseWriter, r *http.Request) {
	pageID, err := primitive.ObjectIDFromHex(chiURLParam(r, "pageID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid page id")
		return
	}
	page, ok := s.editablePage(w, r, pageID)
	if !ok {
		return
	}

	var req saveBlocksRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(req.Blocks) > 2000 {
		writeErr(w, http.StatusBadRequest, "a page cannot contain more than 2000 blocks")
		return
	}
	if req.Base != nil && len(*req.Base) > 2000 {
		writeErr(w, http.StatusBadRequest, "the base snapshot is too large")
		return
	}

	seen := make(map[string]bool, len(req.Blocks))
	for i := range req.Blocks {
		b := &req.Blocks[i]
		if !blockTypes[b.Type] {
			writeErr(w, http.StatusBadRequest, "unknown block type: "+b.Type)
			return
		}
		if utf8.RuneCountInString(b.Text) > 50000 {
			writeErr(w, http.StatusBadRequest, "a block is too long")
			return
		}
		if b.ID == "" || seen[b.ID] {
			b.ID = primitive.NewObjectID().Hex()
		}
		seen[b.ID] = true
		b.Text = strings.ReplaceAll(strings.ReplaceAll(b.Text, "\x00", ""), "\r\n", "\n")
		if len(b.Language) > 40 {
			b.Language = b.Language[:40]
		}
		if b.Type == "table" || b.Type == "gantt" || b.Type == "chart" || b.Type == "columns" {
			b.Table = sanitizeTable(b.Table)
		}
		if b.Type == "form" && b.Form != nil {
			b.Form.Title = truncateRunes(b.Form.Title, 200)
			b.Form.Description = truncateRunes(b.Form.Description, 1000)
			b.Form.SubmitLabel = truncateRunes(b.Form.SubmitLabel, 60)
			if len(b.Form.Fields) > 50 {
				b.Form.Fields = b.Form.Fields[:50]
			}
			for i := range b.Form.Fields {
				field := &b.Form.Fields[i]
				field.Label = truncateRunes(field.Label, 200)
				if len(field.Options) > 50 {
					field.Options = field.Options[:50]
				}
				for j := range field.Options {
					field.Options[j] = truncateRunes(field.Options[j], 200)
				}
			}
		}
		if b.Indent < 0 {
			b.Indent = 0
		}
		if b.Indent > 8 {
			b.Indent = 8
		}
		if b.Type == "password" {
			if len(b.Ciphertext) > 200_000 || len(b.Salt) > 100 || len(b.IV) > 100 {
				writeErr(w, http.StatusBadRequest, "encrypted area is too large")
				return
			}
			b.Rich = ""
		}
	}

	merged := req.Blocks
	if req.Base != nil {
		merged = blocks.Merge(*req.Base, page.Blocks, req.Blocks)
	}
	now := time.Now().UTC()
	rev := page.BlocksRev + 1
	if rev < 1 {
		rev = 1
	}
	if _, err := s.store.Pages.UpdateByID(r.Context(), pageID, bson.M{"$set": bson.M{
		"blocks":    merged,
		"blocksRev": rev,
		"text":      textFromBlocks(merged),
		"updatedAt": now,
	}}); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not save page")
		return
	}

	_, name := s.editorFor(r)
	userID := currentUserID(r).Hex()
	s.hub.Broadcast(page.ID.Hex(), map[string]any{
		"type":      "blocks",
		"pageId":    page.ID.Hex(),
		"clientId":  clientID(r),
		"blocks":    merged,
		"blocksRev": rev,
		"updatedAt": now,
		"editor":    map[string]string{"userId": userID, "name": name, "color": realtime.ColorFor(userID)},
	}, clientID(r))

	snapshot := page
	snapshot.Blocks = merged
	s.maybeSnapshot(r, snapshot, name)
	writeJSON(w, http.StatusOK, map[string]any{"blocks": merged, "blocksRev": rev, "updatedAt": now})
}

type blockSyncRequest struct {
	BaseRev int64         `json:"baseRev"`
	Order   []string      `json:"order"`
	Upserts []model.Block `json:"upserts"`
	Deletes []string      `json:"deletes"`
}

// syncBlocks applies a compact page delta: the final order, changed blocks and
// deleted ids. It rejects stale writers so clients can fall back to the
// three-way merge endpoint instead of overwriting a collaborator.
func (s *Server) syncBlocks(w http.ResponseWriter, r *http.Request) {
	pageID, err := primitive.ObjectIDFromHex(chiURLParam(r, "pageID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid page id")
		return
	}
	page, ok := s.editablePage(w, r, pageID)
	if !ok {
		return
	}
	var req blockSyncRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if len(req.Order) > 2000 || len(req.Upserts) > 2000 || len(req.Deletes) > 2000 {
		writeErr(w, http.StatusBadRequest, "page delta is too large")
		return
	}
	if req.BaseRev != page.BlocksRev {
		writeJSON(w, http.StatusConflict, map[string]any{
			"error": "page changed on another device", "blocksRev": page.BlocksRev,
		})
		return
	}
	seen := make(map[string]bool, len(req.Upserts))
	for i := range req.Upserts {
		b := &req.Upserts[i]
		if !blockTypes[b.Type] {
			writeErr(w, http.StatusBadRequest, "unknown block type: "+b.Type)
			return
		}
		if utf8.RuneCountInString(b.Text) > 50000 {
			writeErr(w, http.StatusBadRequest, "a block is too long")
			return
		}
		if b.ID == "" || seen[b.ID] {
			b.ID = primitive.NewObjectID().Hex()
		}
		seen[b.ID] = true
		b.Text = strings.ReplaceAll(strings.ReplaceAll(b.Text, "\x00", ""), "\r\n", "\n")
		if len(b.Language) > 40 {
			b.Language = b.Language[:40]
		}
		if b.Type == "table" || b.Type == "gantt" || b.Type == "chart" || b.Type == "columns" {
			b.Table = sanitizeTable(b.Table)
		}
		if b.Type == "form" && b.Form != nil {
			b.Form.Title = truncateRunes(b.Form.Title, 200)
			b.Form.Description = truncateRunes(b.Form.Description, 1000)
			b.Form.SubmitLabel = truncateRunes(b.Form.SubmitLabel, 60)
			if len(b.Form.Fields) > 50 {
				b.Form.Fields = b.Form.Fields[:50]
			}
			for i := range b.Form.Fields {
				field := &b.Form.Fields[i]
				field.Label = truncateRunes(field.Label, 200)
				if len(field.Options) > 50 {
					field.Options = field.Options[:50]
				}
				for j := range field.Options {
					field.Options[j] = truncateRunes(field.Options[j], 200)
				}
			}
		}
		if b.Indent < 0 {
			b.Indent = 0
		}
		if b.Indent > 8 {
			b.Indent = 8
		}
		if b.Type == "password" {
			if len(b.Ciphertext) > 200_000 || len(b.Salt) > 100 || len(b.IV) > 100 {
				writeErr(w, http.StatusBadRequest, "encrypted area is too large")
				return
			}
			b.Rich = ""
		}
	}
	byID := make(map[string]model.Block, len(page.Blocks)+len(req.Upserts))
	for _, b := range page.Blocks {
		byID[b.ID] = b
	}
	for _, id := range req.Deletes {
		delete(byID, id)
	}
	for _, b := range req.Upserts {
		byID[b.ID] = b
	}
	next := make([]model.Block, 0, len(byID))
	used := make(map[string]bool, len(byID))
	for _, id := range req.Order {
		if b, ok := byID[id]; ok && !used[id] {
			next = append(next, b)
			used[id] = true
		}
	}
	// Preserve blocks another collaborator added while this client was editing.
	for _, b := range page.Blocks {
		if !used[b.ID] {
			if _, exists := byID[b.ID]; exists {
				next = append(next, byID[b.ID])
				used[b.ID] = true
			}
		}
	}
	for _, b := range req.Upserts {
		if !used[b.ID] {
			next = append(next, b)
			used[b.ID] = true
		}
	}
	now := time.Now().UTC()
	rev := page.BlocksRev + 1
	if rev < 1 {
		rev = 1
	}
	if _, err := s.store.Pages.UpdateByID(r.Context(), pageID, bson.M{"$set": bson.M{
		"blocks": next, "blocksRev": rev, "text": textFromBlocks(next), "updatedAt": now,
	}}); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not save page")
		return
	}
	order := make([]string, len(next))
	for i, b := range next {
		order[i] = b.ID
	}
	_, name := s.editorFor(r)
	userID := currentUserID(r).Hex()
	s.hub.Broadcast(page.ID.Hex(), map[string]any{
		"type": "ops", "pageId": page.ID.Hex(), "clientId": clientID(r),
		"blocksRev": rev, "order": order, "upserts": req.Upserts, "deletes": req.Deletes,
		"updatedAt": now,
		"editor":    map[string]string{"userId": userID, "name": name, "color": realtime.ColorFor(userID)},
	}, clientID(r))
	snapshot := page
	snapshot.Blocks = next
	s.maybeSnapshot(r, snapshot, name)
	writeJSON(w, http.StatusOK, map[string]any{
		"blocksRev": rev, "order": order, "upserts": req.Upserts, "deletes": req.Deletes, "updatedAt": now,
	})
}

func (s *Server) duplicatePage(w http.ResponseWriter, r *http.Request) {
	pageID, err := primitive.ObjectIDFromHex(chiURLParam(r, "pageID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid page id")
		return
	}
	original, ok := s.editablePage(w, r, pageID)
	if !ok {
		return
	}

	order, err := s.nextOrder(r, original.WorkspaceID, original.ParentID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not duplicate page")
		return
	}
	now := time.Now().UTC()
	blocks := make([]model.Block, len(original.Blocks))
	for i, b := range original.Blocks {
		b.ID = primitive.NewObjectID().Hex()
		blocks[i] = b
	}
	title := strings.TrimSpace(original.Title)
	if title == "" {
		title = "Untitled"
	}
	title += " (copy)"
	if utf8.RuneCountInString(title) > 200 {
		title = title[:200]
	}
	copyPage := model.Page{
		ID:          primitive.NewObjectID(),
		WorkspaceID: original.WorkspaceID,
		ParentID:    original.ParentID,
		Title:       title,
		Icon:        original.Icon,
		Cover:       original.Cover,
		Theme:       original.Theme,
		LayoutID:    original.LayoutID,
		IsLayout:    original.IsLayout,
		Blocks:      blocks,
		BlocksRev:   1,
		Text:        original.Text,
		Order:       order,
		CreatedBy:   currentUserID(r),
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if _, err := s.store.Pages.InsertOne(r.Context(), copyPage); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not duplicate page")
		return
	}
	s.broadcastTree(copyPage.WorkspaceID, clientID(r))
	writeJSON(w, http.StatusCreated, copyPage)
}

func (s *Server) deletePage(w http.ResponseWriter, r *http.Request) {
	pageID, err := primitive.ObjectIDFromHex(chiURLParam(r, "pageID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid page id")
		return
	}
	page, ok := s.editablePage(w, r, pageID)
	if !ok {
		return
	}
	if page.IsLayout {
		count, err := s.store.Pages.CountDocuments(r.Context(), bson.M{"layoutId": pageID, "archived": false})
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "could not check layout references")
			return
		}
		if count > 0 {
			writeErr(w, http.StatusBadRequest, "this layout is still used by pages; detach it first")
			return
		}
	}
	ids := map[primitive.ObjectID]bool{page.ID: true}
	descendants, err := s.descendantIDs(r, page.WorkspaceID, page.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not delete page")
		return
	}
	for id := range descendants {
		ids[id] = true
	}
	if _, err := s.store.Pages.DeleteMany(r.Context(), bson.M{"_id": bson.M{"$in": keysOf(ids)}}); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not delete page")
		return
	}
	s.hub.Broadcast(page.ID.Hex(), map[string]any{
		"type": "deleted", "pageId": page.ID.Hex(), "clientId": clientID(r),
	}, clientID(r))
	s.broadcastTree(page.WorkspaceID, clientID(r))
	w.WriteHeader(http.StatusNoContent)
}

// pageBacklinks returns pages in the same workspace that link to this page
// through a pageLink block.
func (s *Server) pageBacklinks(w http.ResponseWriter, r *http.Request) {
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
	cur, err := s.store.Pages.Find(r.Context(), bson.M{
		"workspaceId": page.WorkspaceID,
		"_id":         bson.M{"$ne": page.ID},
		"archived":    false,
		"blocks": bson.M{"$elemMatch": bson.M{
			"type": "pageLink", "url": page.ID.Hex(),
		}},
	}, options.Find().
		SetProjection(bson.M{"title": 1, "icon": 1, "updatedAt": 1}).
		SetSort(bson.D{{Key: "updatedAt", Value: -1}}).
		SetLimit(50))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load backlinks")
		return
	}
	defer cur.Close(r.Context())
	var pages []model.Page
	if err := cur.All(r.Context(), &pages); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load backlinks")
		return
	}
	out := make([]map[string]any, 0, len(pages))
	for _, item := range pages {
		out = append(out, map[string]any{
			"id": item.ID.Hex(), "title": item.Title, "icon": item.Icon,
			"updatedAt": item.UpdatedAt,
		})
	}
	writeJSON(w, http.StatusOK, out)
}

func sanitizeTable(table *model.TableData) *model.TableData {
	if table == nil {
		return &model.TableData{
			Columns: []string{"Column 1", "Column 2", "Column 3"},
			Rows:    [][]string{{"", "", ""}, {"", "", ""}},
			Header:  true,
		}
	}
	clean := func(value string) string {
		value = strings.ReplaceAll(strings.ReplaceAll(value, "\x00", ""), "\n", " ")
		if len([]rune(value)) > 1000 {
			value = string([]rune(value)[:1000])
		}
		return value
	}
	columns := table.Columns
	if len(columns) > 20 {
		columns = columns[:20]
	}
	if len(columns) == 0 {
		columns = []string{"Column 1", "Column 2"}
	}
	for i := range columns {
		columns[i] = clean(columns[i])
		if strings.TrimSpace(columns[i]) == "" {
			columns[i] = "Column " + strconv.Itoa(i+1)
		}
	}
	rows := table.Rows
	if len(rows) > 200 {
		rows = rows[:200]
	}
	cleaned := make([][]string, len(rows))
	for i, row := range rows {
		out := make([]string, len(columns))
		for j := range columns {
			if j < len(row) {
				out[j] = clean(row[j])
			}
		}
		cleaned[i] = out
	}
	return &model.TableData{Columns: columns, Rows: cleaned, Header: table.Header}
}

func (s *Server) setPageLocked(w http.ResponseWriter, r *http.Request, locked bool) {
	pageID, err := primitive.ObjectIDFromHex(chiURLParam(r, "pageID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid page id")
		return
	}
	page, role, err := s.accessiblePage(r, pageID)
	if err != nil {
		writeErr(w, http.StatusNotFound, "page not found")
		return
	}
	if !canEdit(role) {
		writeErr(w, http.StatusForbidden, "you do not have permission to edit this page")
		return
	}
	now := time.Now().UTC()
	set := bson.M{"locked": locked, "updatedAt": now}
	unset := bson.M{}
	if locked {
		_, name := s.editorFor(r)
		page.LockedByName = name
		page.LockedAt = &now
		set["lockedByName"] = name
		set["lockedAt"] = now
	} else {
		page.LockedByName = ""
		page.LockedAt = nil
		unset["lockedByName"] = ""
		unset["lockedAt"] = ""
	}
	update := bson.M{"$set": set}
	if len(unset) > 0 {
		update["$unset"] = unset
	}
	if _, err := s.store.Pages.UpdateByID(r.Context(), page.ID, update); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not update page lock")
		return
	}
	page.Locked = locked
	userID, name := s.editorFor(r)
	s.hub.Broadcast(page.ID.Hex(), map[string]any{
		"type": "meta", "pageId": page.ID.Hex(), "clientId": clientID(r),
		"page": map[string]any{
			"title": page.Title, "icon": page.Icon, "cover": page.Cover,
			"favorite": page.Favorite, "archived": page.Archived,
			"locked": page.Locked, "lockedByName": page.LockedByName,
		},
		"editor": map[string]string{"userId": userID, "name": name, "color": realtime.ColorFor(userID)},
	}, clientID(r))
	s.broadcastTree(page.WorkspaceID, clientID(r))
	writeJSON(w, http.StatusOK, page)
}

func (s *Server) lockPage(w http.ResponseWriter, r *http.Request) {
	s.setPageLocked(w, r, true)
}

func (s *Server) unlockPage(w http.ResponseWriter, r *http.Request) {
	s.setPageLocked(w, r, false)
}

type movePageRequest struct {
	ParentID *string  `json:"parentId"`
	Order    *float64 `json:"order"`
}

func (s *Server) movePage(w http.ResponseWriter, r *http.Request) {
	pageID, err := primitive.ObjectIDFromHex(chiURLParam(r, "pageID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid page id")
		return
	}
	page, ok := s.editablePage(w, r, pageID)
	if !ok {
		return
	}
	var req movePageRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	updates := bson.M{"updatedAt": time.Now().UTC()}
	if req.ParentID != nil && strings.TrimSpace(*req.ParentID) != "" {
		pid, err := primitive.ObjectIDFromHex(*req.ParentID)
		if err != nil {
			writeErr(w, http.StatusBadRequest, "invalid parent page id")
			return
		}
		if pid == pageID {
			writeErr(w, http.StatusBadRequest, "a page cannot be its own parent")
			return
		}
		descendants, err := s.descendantIDs(r, page.WorkspaceID, pageID)
		if err != nil {
			writeErr(w, http.StatusInternalServerError, "could not move page")
			return
		}
		if descendants[pid] {
			writeErr(w, http.StatusBadRequest, "a page cannot be moved inside itself")
			return
		}
		var parent model.Page
		if err := s.store.Pages.FindOne(r.Context(), bson.M{"_id": pid, "workspaceId": page.WorkspaceID}).Decode(&parent); err != nil {
			writeErr(w, http.StatusBadRequest, "parent page not found")
			return
		}
		updates["parentId"] = pid
	} else if req.ParentID != nil {
		updates["parentId"] = nil
	}
	if req.Order != nil {
		updates["order"] = *req.Order
	}
	if len(updates) == 1 {
		writeJSON(w, http.StatusOK, page)
		return
	}
	if _, err := s.store.Pages.UpdateByID(r.Context(), pageID, bson.M{"$set": updates}); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not move page")
		return
	}
	if err := s.store.Pages.FindOne(r.Context(), bson.M{"_id": pageID}).Decode(&page); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load page")
		return
	}
	s.broadcastTree(page.WorkspaceID, clientID(r))
	writeJSON(w, http.StatusOK, page)
}

func truncateRunes(value string, limit int) string {
	runes := []rune(value)
	if len(runes) <= limit {
		return value
	}
	return string(runes[:limit])
}
