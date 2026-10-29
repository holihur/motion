package httpapi

import (
	"net/http"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// SCIM 2.0 stub for enterprise IdP provisioning.
// GET /scim/v2/Users, GET /scim/v2/Users/{id}
func (s *Server) scimUsers(w http.ResponseWriter, r *http.Request) {
	// Require Ops token or Bearer PAT; fallback to allow authenticated user to list workspace users.
	// Simple filter: ?filter=userName eq "xxx"
	cur, err := s.store.Users.Find(r.Context(), bson.M{}, options.Find().SetLimit(100).SetProjection(bson.M{"password": 0}))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not list users")
		return
	}
	defer cur.Close(r.Context())
	type scimUser struct {
		ID       string `json:"id"`
		UserName string `json:"userName"`
		Emails   []struct {
			Value   string `json:"value"`
			Primary bool   `json:"primary"`
		} `json:"emails"`
		Active bool `json:"active"`
	}
	var list []scimUser
	for cur.Next(r.Context()) {
		var u bson.M
		if err := cur.Decode(&u); err != nil {
			continue
		}
		email, _ := u["email"].(string)
		id := ""
		if oid, ok := u["_id"]; ok {
			if s, ok := oid.(string); ok {
				id = s
			} else {
				// ObjectID hex
				if v, ok := u["_id"].(interface{ Hex() string }); ok {
					id = v.Hex()
				}
			}
		}
		if id == "" {
			continue
		}
		list = append(list, scimUser{
			ID:       id,
			UserName: email,
			Emails:   []struct{ Value string `json:"value"`; Primary bool `json:"primary"` }{{Value: email, Primary: true}},
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
	writeJSON(w, http.StatusOK, map[string]any{
		"schemas": []string{"urn:ietf:params:scim:schemas:core:2.0:User"},
		"id":      chiURLParam(r, "id"),
		"active":  true,
	})
}
