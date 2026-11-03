package httpapi

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/url"
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

var registerLimiter = newWindowLimiter()

func clientHost(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

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
	if !registerLimiter.allow(clientHost(r), 120, time.Hour) {
		w.Header().Set("Retry-After", "3600")
		writeErr(w, http.StatusTooManyRequests, "too many accounts created from this address; try again later")
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
	isAdmin, err := s.shouldPromoteFirstUser(ctx)
	if err != nil {
		slog.Error("could not count users during signup", "error", err)
		writeErr(w, http.StatusInternalServerError, "could not create account")
		return
	}
	user := model.User{
		ID:        primitive.NewObjectID(),
		Name:      req.Name,
		Email:     req.Email,
		Password:  string(hash),
		IsAdmin:   isAdmin,
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

// shouldPromoteFirstUser reports whether a newly created account should become
// the instance administrator. Configured admin emails take precedence; otherwise
// the user count decides. The error is returned so callers can fail closed: a
// storage hiccup must never silently grant the first account admin rights.
func (s *Server) shouldPromoteFirstUser(ctx context.Context) (bool, error) {
	if len(s.siteSnapshot().AdminEmails) > 0 {
		return false, nil
	}
	count, err := s.store.Users.CountDocuments(ctx, bson.M{})
	if err != nil {
		return false, err
	}
	return count == 0, nil
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

// sanitizeAvatar accepts a small data URL or a plain http(s) image URL. Data
// URLs are resized client-side to keep user documents small.
func sanitizeAvatar(value string) (string, error) {
	value = strings.TrimSpace(value)
	if value == "" {
		return "", nil
	}
	if len(value) > 400_000 {
		return "", fmt.Errorf("avatar is too large")
	}
	if strings.HasPrefix(value, "data:image/") {
		for _, prefix := range []string{"data:image/png;base64,", "data:image/jpeg;base64,", "data:image/webp;base64,"} {
			if strings.HasPrefix(value, prefix) {
				return value, nil
			}
		}
		return "", fmt.Errorf("avatar must be a PNG, JPEG or WebP image")
	}
	parsed, err := url.Parse(value)
	if err != nil || parsed.Host == "" || (parsed.Scheme != "http" && parsed.Scheme != "https") {
		return "", fmt.Errorf("avatar must be an image URL or data URL")
	}
	return value, nil
}

func (s *Server) updateMe(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name   *string `json:"name"`
		Avatar *string `json:"avatar"`
	}
	if err := decodeJSON(r, &req); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.Name == nil && req.Avatar == nil {
		writeErr(w, http.StatusBadRequest, "nothing to update")
		return
	}
	updates := bson.M{"updatedAt": time.Now().UTC()}
	if req.Name != nil {
		name := strings.TrimSpace(*req.Name)
		if name == "" || len([]rune(name)) > 80 {
			writeErr(w, http.StatusBadRequest, "name must be between 1 and 80 characters")
			return
		}
		updates["name"] = name
	}
	if req.Avatar != nil {
		avatar, err := sanitizeAvatar(*req.Avatar)
		if err != nil {
			writeErr(w, http.StatusBadRequest, err.Error())
			return
		}
		updates["avatar"] = avatar
	}
	if _, err := s.store.Users.UpdateByID(r.Context(), currentUserID(r), bson.M{"$set": updates}); err != nil {
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
