package httpapi

import (
	"context"
	"net"
	"net/http"
	"regexp"
	"strings"
	"sync"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"golang.org/x/crypto/bcrypt"

	"github.com/motion/server/internal/model"
	"github.com/motion/server/internal/seed"
)

var emailPattern = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)

var dummyPasswordHash, _ = bcrypt.GenerateFromPassword([]byte("motion-timing-equalizer"), bcrypt.DefaultCost)

type loginAttempt struct {
	count int
	first time.Time
}

var loginAttempts = struct {
	sync.Mutex
	byKey map[string]loginAttempt
}{byKey: map[string]loginAttempt{}}

func loginAttemptKey(r *http.Request, email string) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		host = r.RemoteAddr
	}
	return host + "|" + strings.ToLower(email)
}

func loginBlocked(key string) bool {
	loginAttempts.Lock()
	defer loginAttempts.Unlock()
	attempt, ok := loginAttempts.byKey[key]
	if !ok || time.Since(attempt.first) > 15*time.Minute {
		delete(loginAttempts.byKey, key)
		return false
	}
	return attempt.count >= 10
}

func recordLoginFailure(key string) {
	loginAttempts.Lock()
	defer loginAttempts.Unlock()
	attempt, ok := loginAttempts.byKey[key]
	if !ok || time.Since(attempt.first) > 15*time.Minute {
		loginAttempts.byKey[key] = loginAttempt{count: 1, first: time.Now()}
		return
	}
	attempt.count++
	loginAttempts.byKey[key] = attempt
	if len(loginAttempts.byKey) > 10000 {
		for candidate, item := range loginAttempts.byKey {
			if time.Since(item.first) > 15*time.Minute {
				delete(loginAttempts.byKey, candidate)
			}
		}
	}
}

func clearLoginFailures(key string) {
	loginAttempts.Lock()
	delete(loginAttempts.byKey, key)
	loginAttempts.Unlock()
}

type authRequest struct {
	Name     string `json:"name"`
	Email    string `json:"email"`
	Password string `json:"password"`
}

type authResponse struct {
	Token string     `json:"token"`
	User  model.User `json:"user"`
}

func (s *Server) register(w http.ResponseWriter, r *http.Request) {
	var req authRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	req.Name = strings.TrimSpace(req.Name)
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))

	if req.Name == "" || len(req.Name) > 80 {
		writeErr(w, http.StatusBadRequest, "name must be between 1 and 80 characters")
		return
	}
	if !emailPattern.MatchString(req.Email) || len(req.Email) > 160 {
		writeErr(w, http.StatusBadRequest, "please enter a valid email address")
		return
	}
	if len(req.Password) < 8 || len(req.Password) > 128 {
		writeErr(w, http.StatusBadRequest, "password must be at least 8 characters")
		return
	}

	if !s.siteSnapshot().AllowSignup {
		writeErr(w, http.StatusForbidden, "new account creation is disabled on this instance")
		return
	}

	ctx := r.Context()
	var existing model.User
	err := s.store.Users.FindOne(ctx, bson.M{"email": req.Email}).Decode(&existing)
	if err == nil {
		writeErr(w, http.StatusConflict, "an account with that email already exists")
		return
	}
	if err != nil && !isNotFound(err) {
		writeErr(w, http.StatusInternalServerError, "could not check email")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not secure password")
		return
	}

	now := time.Now().UTC()
	count, _ := s.store.Users.CountDocuments(ctx, bson.M{})
	user := model.User{
		ID:        primitive.NewObjectID(),
		Name:      req.Name,
		Email:     req.Email,
		Password:  string(hash),
		IsAdmin:   len(s.siteSnapshot().AdminEmails) == 0 && count == 0,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if _, err := s.store.Users.InsertOne(ctx, user); err != nil {
		if mongo.IsDuplicateKeyError(err) {
			writeErr(w, http.StatusConflict, "an account with that email already exists")
			return
		}
		writeErr(w, http.StatusInternalServerError, "could not create account")
		return
	}

	if _, err := seed.CreateWorkspaceWithWelcome(ctx, s.store, user.ID, "My Workspace", "🧭"); err != nil {
		// The account exists; log and continue so the user can still sign in.
		writeErr(w, http.StatusInternalServerError, "account created, but workspace setup failed")
		return
	}

	token, err := s.tokens.Issue(user.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not create session")
		return
	}
	s.decorateUser(&user)
	writeJSON(w, http.StatusCreated, authResponse{Token: token, User: user})
}

func (s *Server) login(w http.ResponseWriter, r *http.Request) {
	var req authRequest
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	email := strings.ToLower(strings.TrimSpace(req.Email))
	attemptKey := loginAttemptKey(r, email)
	if loginBlocked(attemptKey) {
		writeErr(w, http.StatusTooManyRequests, "too many sign-in attempts; try again later")
		return
	}

	var user model.User
	if err := s.store.Users.FindOne(r.Context(), bson.M{"email": email}).Decode(&user); err != nil {
		_ = bcrypt.CompareHashAndPassword(dummyPasswordHash, []byte(req.Password))
		recordLoginFailure(attemptKey)
		writeErr(w, http.StatusUnauthorized, "email or password is incorrect")
		return
	}
	if user.Password == "!oidc" {
		recordLoginFailure(attemptKey)
		writeErr(w, http.StatusUnauthorized, "this account uses single sign-on")
		return
	}
	if bcrypt.CompareHashAndPassword([]byte(user.Password), []byte(req.Password)) != nil {
		recordLoginFailure(attemptKey)
		writeErr(w, http.StatusUnauthorized, "email or password is incorrect")
		return
	}
	clearLoginFailures(attemptKey)

	token, err := s.tokens.Issue(user.ID)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, "could not create session")
		return
	}
	s.decorateUser(&user)
	writeJSON(w, http.StatusOK, authResponse{Token: token, User: user})
}

func (s *Server) me(w http.ResponseWriter, r *http.Request) {
	var user model.User
	if err := s.store.Users.FindOne(r.Context(), bson.M{"_id": currentUserID(r)}).Decode(&user); err != nil {
		if isNotFound(err) {
			writeErr(w, http.StatusUnauthorized, "account no longer exists")
			return
		}
		writeErr(w, http.StatusInternalServerError, "could not load account")
		return
	}
	s.decorateUser(&user)
	writeJSON(w, http.StatusOK, user)
}

func withUserID(ctx context.Context, id primitive.ObjectID) context.Context {
	return context.WithValue(ctx, userIDKey, id)
}

func (s *Server) updateMe(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name *string `json:"name"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == nil {
		writeErr(w, http.StatusBadRequest, "nothing to update")
		return
	}
	name := strings.TrimSpace(*req.Name)
	if name == "" || len([]rune(name)) > 80 {
		writeErr(w, http.StatusBadRequest, "name must be between 1 and 80 characters")
		return
	}
	if _, err := s.store.Users.UpdateByID(r.Context(), currentUserID(r), bson.M{"$set": bson.M{
		"name": name, "updatedAt": time.Now().UTC(),
	}}); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not update profile")
		return
	}
	var user model.User
	if err := s.store.Users.FindOne(r.Context(), bson.M{"_id": currentUserID(r)}).Decode(&user); err != nil {
		writeErr(w, http.StatusInternalServerError, "could not load profile")
		return
	}
	s.decorateUser(&user)
	writeJSON(w, http.StatusOK, user)
}
