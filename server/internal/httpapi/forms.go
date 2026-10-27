package httpapi

import (
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/motion/server/internal/model"
)

type formSubmissionRequest struct {
	BlockID string            `json:"blockId"`
	Values  map[string]string `json:"values"`
}

func (s *Server) submitForm(w http.ResponseWriter, r *http.Request) {
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
	var req formSubmissionRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	var form *model.FormData
	for _, block := range page.Blocks {
		if block.ID == req.BlockID && block.Type == "form" {
			form = block.Form
			break
		}
	}
	if form == nil {
		writeErr(w, http.StatusBadRequest, "form not found")
		return
	}
	clean := map[string]string{}
	for _, field := range form.Fields {
		value := strings.TrimSpace(req.Values[field.ID])
		if len([]rune(value)) > 5000 {
			writeErr(w, http.StatusBadRequest, "an answer is too long")
			return
		}
		if field.Required && value == "" {
			writeErr(w, http.StatusBadRequest, "please answer: "+field.Label)
			return
		}
		switch field.Type {
		case "email":
			if value != "" && !strings.Contains(value, "@") {
				writeErr(w, http.StatusBadRequest, "enter a valid email address")
				return
			}
		case "select":
			if value != "" && len(field.Options) > 0 {
				valid := false
				for _, option := range field.Options {
					if option == value {
						valid = true
						break
					}
				}
				if !valid {
					writeErr(w, http.StatusBadRequest, "choose a valid option for "+field.Label)
					return
				}
			}
		}
		clean[field.ID] = value
	}
	submission := model.FormSubmission{
		ID: primitive.NewObjectID(), PageID: page.ID, BlockID: req.BlockID, WorkspaceID: page.WorkspaceID,
		FormTitle: form.Title, Values: clean, SubmittedBy: currentUserID(r), SubmittedAt: time.Now().UTC(),
	}
	if _, err := s.store.FormSubmissions.InsertOne(r.Context(), submission); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not save form response")
		return
	}
	writeJSON(w, http.StatusCreated, map[string]any{"id": submission.ID.Hex(), "submittedAt": submission.SubmittedAt})
}

func (s *Server) listFormSubmissions(w http.ResponseWriter, r *http.Request) {
	pageID, err := primitive.ObjectIDFromHex(chiURLParam(r, "pageID"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid page id")
		return
	}
	page, ok := s.editablePage(w, r, pageID)
	if !ok {
		return
	}
	filter := bson.M{"pageId": page.ID}
	if blockID := strings.TrimSpace(r.URL.Query().Get("blockId")); blockID != "" {
		filter["blockId"] = blockID
	}
	pageNo, pageSize := paginationParams(r)
	total, err := s.store.FormSubmissions.CountDocuments(r.Context(), filter)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load form responses")
		return
	}
	cur, err := s.store.FormSubmissions.Find(r.Context(), filter, options.Find().
		SetSort(bson.D{{Key: "submittedAt", Value: -1}}).
		SetSkip((pageNo-1)*pageSize).
		SetLimit(pageSize))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load form responses")
		return
	}
	defer cur.Close(r.Context())
	items := make([]model.FormSubmission, 0)
	if err := cur.All(r.Context(), &items); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load form responses")
		return
	}
	writeJSON(w, http.StatusOK, paginate(items, pageNo, pageSize, total))
}
