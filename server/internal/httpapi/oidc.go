package httpapi

import (
	"context"
	"crypto/rand"
	"encoding/base64"
	"encoding/json"
	"log/slog"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/coreos/go-oidc/v3/oidc"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"
	"golang.org/x/crypto/bcrypt"
	"golang.org/x/oauth2"

	"github.com/motion/server/internal/model"
	"github.com/motion/server/internal/seed"
	"github.com/motion/server/internal/site"
)

const oidcStateCookie = "motion_oidc_state"
const oidcSessionCookie = "motion_oidc_session"

type oidcState struct {
	State string `json:"state"`
	Nonce string `json:"nonce"`
}

type oidcClaims struct {
	Email             string `json:"email"`
	EmailVerified     *bool  `json:"email_verified"`
	Name              string `json:"name"`
	PreferredUsername string `json:"preferred_username"`
	Nonce             string `json:"nonce"`
}

func (s *Server) authConfig(w http.ResponseWriter, _ *http.Request) {
	settings := s.siteSnapshot()
	writeJSON(w, http.StatusOK, map[string]any{
		"appName": settings.AppName,
		"oidc": map[string]any{
			"enabled": settings.OIDC.Ready(),
			"name":    settings.OIDC.Name,
		},
	})
}

func (s *Server) oidcProviderFor(ctx context.Context, settings site.OIDC) (*oidc.Provider, *oidc.IDTokenVerifier, error) {
	if !settings.Ready() {
		return nil, nil, errOIDCDisabled
	}
	cacheKey := settings.Issuer + "|" + settings.ClientID
	s.oidcMu.Lock()
	defer s.oidcMu.Unlock()
	if s.oidcKey == cacheKey && (s.oidcProvider != nil || s.oidcErr != nil) {
		return s.oidcProvider, s.oidcVerifier, s.oidcErr
	}
	s.oidcKey = cacheKey
	s.oidcProvider, s.oidcVerifier, s.oidcErr = nil, nil, nil
	discoverCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	provider, err := oidc.NewProvider(discoverCtx, settings.Issuer)
	if err != nil {
		s.oidcErr = err
		return nil, nil, err
	}
	s.oidcProvider = provider
	s.oidcVerifier = provider.Verifier(&oidc.Config{ClientID: settings.ClientID})
	return s.oidcProvider, s.oidcVerifier, nil
}

func (s *Server) oidcOAuthConfig(provider *oidc.Provider, settings site.OIDC, r *http.Request) *oauth2.Config {
	redirect := settings.RedirectURL
	if redirect == "" {
		scheme := "http"
		if r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https") {
			scheme = "https"
		}
		redirect = scheme + "://" + r.Host + "/api/auth/oidc/callback"
	}
	scopes := settings.Scopes
	if len(scopes) == 0 {
		scopes = []string{oidc.ScopeOpenID, "email", "profile"}
	}
	return &oauth2.Config{
		ClientID:     settings.ClientID,
		ClientSecret: settings.ClientSecret,
		Endpoint:     provider.Endpoint(),
		RedirectURL:  redirect,
		Scopes:       scopes,
	}
}

func randomToken(size int) (string, error) {
	data := make([]byte, size)
	if _, err := rand.Read(data); err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(data), nil
}

func (s *Server) oidcStart(w http.ResponseWriter, r *http.Request) {
	settings := s.siteSnapshot().OIDC
	provider, _, err := s.oidcProviderFor(r.Context(), settings)
	if err != nil {
		slog.Warn("oidc start failed", "error", err)
		redirectOIDCError(w, r, "Single sign-on is not available right now.")
		return
	}
	state, err := randomToken(24)
	if err != nil {
		redirectOIDCError(w, r, "Could not start single sign-on.")
		return
	}
	nonce, err := randomToken(24)
	if err != nil {
		redirectOIDCError(w, r, "Could not start single sign-on.")
		return
	}
	payload, _ := json.Marshal(oidcState{State: state, Nonce: nonce})
	http.SetCookie(w, &http.Cookie{
		Name: oidcStateCookie, Value: base64.RawURLEncoding.EncodeToString(payload),
		Path: "/api/auth/oidc", HttpOnly: true, SameSite: http.SameSiteLaxMode,
		Secure: requestIsSecure(r), MaxAge: 600,
	})
	authURL := s.oidcOAuthConfig(provider, settings, r).AuthCodeURL(state, oidc.Nonce(nonce))
	http.Redirect(w, r, authURL, http.StatusFound)
}

func (s *Server) oidcCallback(w http.ResponseWriter, r *http.Request) {
	settings := s.siteSnapshot().OIDC
	provider, verifier, err := s.oidcProviderFor(r.Context(), settings)
	if err != nil {
		slog.Warn("oidc callback provider failed", "error", err)
		redirectOIDCError(w, r, "Single sign-on is not available right now.")
		return
	}
	state := r.URL.Query().Get("state")
	cookie, err := r.Cookie(oidcStateCookie)
	http.SetCookie(w, &http.Cookie{Name: oidcStateCookie, Value: "", Path: "/api/auth/oidc", MaxAge: -1})
	if err != nil || cookie.Value == "" {
		redirectOIDCError(w, r, "Your sign-in session expired. Please try again.")
		return
	}
	rawState, err := base64.RawURLEncoding.DecodeString(cookie.Value)
	if err != nil {
		redirectOIDCError(w, r, "Invalid sign-in session.")
		return
	}
	var saved oidcState
	if err := json.Unmarshal(rawState, &saved); err != nil || saved.State == "" || state != saved.State {
		redirectOIDCError(w, r, "Invalid sign-in session.")
		return
	}

	token, err := s.oidcOAuthConfig(provider, settings, r).Exchange(r.Context(), r.URL.Query().Get("code"))
	if err != nil {
		slog.Warn("oidc token exchange failed", "error", err)
		redirectOIDCError(w, r, "Single sign-on failed. Please try again.")
		return
	}
	rawIDToken, ok := token.Extra("id_token").(string)
	if !ok || rawIDToken == "" {
		redirectOIDCError(w, r, "The identity provider did not return an ID token.")
		return
	}
	idToken, err := verifier.Verify(r.Context(), rawIDToken)
	if err != nil {
		slog.Warn("oidc id token verification failed", "error", err)
		redirectOIDCError(w, r, "Could not verify your identity.")
		return
	}
	var claims oidcClaims
	if err := idToken.Claims(&claims); err != nil {
		redirectOIDCError(w, r, "Could not read your identity claims.")
		return
	}
	if claims.Nonce != "" && claims.Nonce != saved.Nonce {
		redirectOIDCError(w, r, "Invalid identity response.")
		return
	}
	email := strings.ToLower(strings.TrimSpace(claims.Email))
	if email == "" {
		redirectOIDCError(w, r, "Your identity provider did not share an email address.")
		return
	}
	if claims.EmailVerified != nil && !*claims.EmailVerified {
		redirectOIDCError(w, r, "Please verify your email with the identity provider first.")
		return
	}
	if len(settings.AllowedDomains) > 0 {
		domain := email[strings.LastIndex(email, "@")+1:]
		allowed := false
		for _, candidate := range settings.AllowedDomains {
			if strings.EqualFold(strings.TrimSpace(candidate), domain) {
				allowed = true
				break
			}
		}
		if !allowed {
			redirectOIDCError(w, r, "This email domain is not allowed to sign in.")
			return
		}
	}

	name := strings.TrimSpace(claims.Name)
	if name == "" {
		name = strings.TrimSpace(claims.PreferredUsername)
	}
	if name == "" {
		name = strings.Split(email, "@")[0]
	}
	user, err := s.findOrCreateOIDCUser(r, email, name, settings.Issuer, idToken.Subject, settings.AutoCreate)
	if err != nil {
		slog.Error("oidc user provisioning failed", "error", err)
		redirectOIDCError(w, r, "Could not create or load your Motion account.")
		return
	}
	session, err := s.tokens.Issue(user.ID)
	if err != nil {
		redirectOIDCError(w, r, "Could not create a session.")
		return
	}
	http.SetCookie(w, &http.Cookie{
		Name: oidcSessionCookie, Value: session, Path: "/api/auth/oidc",
		HttpOnly: true, SameSite: http.SameSiteLaxMode, Secure: requestIsSecure(r), MaxAge: 120,
	})
	http.Redirect(w, r, "/auth/callback", http.StatusFound)
}

func (s *Server) findOrCreateOIDCUser(r *http.Request, email, name, issuer, subject string, autoCreate bool) (model.User, error) {
	var user model.User
	err := s.store.Users.FindOne(r.Context(), bson.M{"email": email}).Decode(&user)
	if err == nil {
		updates := bson.M{}
		if user.OIDCIssuer == "" {
			updates["oidcIssuer"] = issuer
			updates["oidcSubject"] = subject
		}
		if user.Name == "" {
			updates["name"] = name
		}
		if len(updates) > 0 {
			updates["updatedAt"] = time.Now().UTC()
			_, _ = s.store.Users.UpdateByID(r.Context(), user.ID, bson.M{"$set": updates})
		}
		return user, nil
	}
	if err != mongo.ErrNoDocuments {
		return model.User{}, err
	}
	if !autoCreate {
		return model.User{}, errOIDCNoAccount
	}
	randomPassword, err := randomToken(32)
	if err != nil {
		return model.User{}, err
	}
	hash, err := bcrypt.GenerateFromPassword([]byte(randomPassword), bcrypt.DefaultCost)
	if err != nil {
		return model.User{}, err
	}
	now := time.Now().UTC()
	count, _ := s.store.Users.CountDocuments(r.Context(), bson.M{})
	user = model.User{
		ID: primitive.NewObjectID(), Name: name, Email: email, Password: string(hash),
		OIDCIssuer: issuer, OIDCSubject: subject,
		IsAdmin:   len(s.siteSnapshot().AdminEmails) == 0 && count == 0,
		CreatedAt: now, UpdatedAt: now,
	}
	if _, err := s.store.Users.InsertOne(r.Context(), user); err != nil {
		if mongo.IsDuplicateKeyError(err) {
			if err := s.store.Users.FindOne(r.Context(), bson.M{"email": email}).Decode(&user); err == nil {
				return user, nil
			}
		}
		return model.User{}, err
	}
	if _, err := seed.CreateWorkspaceWithWelcome(r.Context(), s.store, user.ID, "My Workspace", "🧭"); err != nil {
		slog.Warn("could not create welcome workspace for oidc user", "error", err)
	}
	return user, nil
}

func (s *Server) oidcExchange(w http.ResponseWriter, r *http.Request) {
	cookie, err := r.Cookie(oidcSessionCookie)
	http.SetCookie(w, &http.Cookie{Name: oidcSessionCookie, Value: "", Path: "/api/auth/oidc", MaxAge: -1})
	if err != nil || cookie.Value == "" {
		writeErr(w, http.StatusUnauthorized, "sign-in session expired")
		return
	}
	userID, err := s.tokens.Parse(cookie.Value)
	if err != nil {
		writeErr(w, http.StatusUnauthorized, "invalid sign-in session")
		return
	}
	var user model.User
	if err := s.store.Users.FindOne(r.Context(), bson.M{"_id": userID}).Decode(&user); err != nil {
		writeErr(w, http.StatusUnauthorized, "account no longer exists")
		return
	}
	s.decorateUser(&user)
	writeJSON(w, http.StatusOK, authResponse{Token: cookie.Value, User: user})
}

func requestIsSecure(r *http.Request) bool {
	return r.TLS != nil || strings.EqualFold(r.Header.Get("X-Forwarded-Proto"), "https")
}

func redirectOIDCError(w http.ResponseWriter, r *http.Request, message string) {
	http.Redirect(w, r, "/login?error="+url.QueryEscape(message), http.StatusFound)
}

var (
	errOIDCDisabled  = &authError{message: "single sign-on is not configured"}
	errOIDCNoAccount = &authError{message: "no Motion account exists for this email"}
)
