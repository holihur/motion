package httpapi

import (
	"net/http"
	"strings"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// SCIM 2.0 read-only provisioning endpoints. These are instance-wide and must
// be called with the independent Ops token (never a normal workspace session).
func (s *Server) scimUsers(w http.ResponseWriter, r *http.Request) {
	// Optional simple filter: ?filter=userName eq "someone@example.com"
	filter := bson.M{}
	raw := strings.TrimSpace(r.URL.Query().Get("filter"))
	if raw != "" {
		parts := strings.SplitN(strings.ToLower(raw), " eq ", 2)
		if len(parts) == 2 && strings.TrimSpace(parts[0]) == "username" {
			email := strings.Trim(strings.TrimSpace(parts[1]), `"`)
			if email != "" {
				filter["email"] = email
			}
		}
	}
	cur, err := s.store.Users.Find(r.Context(), filter, options.Find().
		SetLimit(100).
		SetProjection(bson.M{"password": 0, "oidcIssuer": 0, "oidcSubject": 0}))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not list users")
		return
	}
	defer cur.Close(r.Context())
	type scimEmail struct {
		Value   string `json:"value"`
		Primary bool   `json:"primary"`
	}
	type scimUser struct {
		ID       string      `json:"id"`
		UserName string      `json:"userName"`
		Emails   []scimEmail `json:"emails"`
		Active   bool        `json:"active"`
	}
	list := make([]scimUser, 0)
	for cur.Next(r.Context()) {
		var u bson.M
		if err := cur.Decode(&u); err != nil {
			continue
		}
		email, _ := u["email"].(string)
		id := ""
		if oid, ok := u["_id"].(primitive.ObjectID); ok {
			id = oid.Hex()
		}
		if id == "" || email == "" {
			continue
		}
		list = append(list, scimUser{
			ID:       id,
			UserName: email,
			Emails:   []scimEmail{{Value: email, Primary: true}},
			Active:   true,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"schemas":      []string{"urn:ietf:params:scim:api:messages:2.0:ListResponse"},
		"totalResults": len(list),
		"startIndex":   1,
		"itemsPerPage": len(list),
		"Resources":    list,
	})
}

func (s *Server) scimUserByID(w http.ResponseWriter, r *http.Request) {
	id, err := primitive.ObjectIDFromHex(chiURLParam(r, "id"))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid user id")
		return
	}
	var u struct {
		ID    primitive.ObjectID `bson:"_id"`
		Email string             `bson:"email"`
	}
	if err := s.store.Users.FindOne(r.Context(), bson.M{"_id": id}, options.FindOne().SetProjection(bson.M{"email": 1})).Decode(&u); err != nil {
		writeErr(w, http.StatusNotFound, "user not found")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"schemas":  []string{"urn:ietf:params:scim:schemas:core:2.0:User"},
		"id":       u.ID.Hex(),
		"userName": u.Email,
		"emails":   []map[string]any{{"value": u.Email, "primary": true}},
		"active":   true,
	})
}
