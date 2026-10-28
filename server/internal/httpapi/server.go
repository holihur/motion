package httpapi

import (
	"context"
	"crypto/subtle"
	"encoding/json"
	"errors"
	"io/fs"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"
	"github.com/go-chi/cors"
	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo"

	"github.com/coreos/go-oidc/v3/oidc"
	"github.com/motion/server/internal/auth"
	"github.com/motion/server/internal/config"
	"github.com/motion/server/internal/mcpserver"
	"github.com/motion/server/internal/model"
	"github.com/motion/server/internal/realtime"
	"github.com/motion/server/internal/site"
	"github.com/motion/server/internal/store"
	"github.com/motion/server/internal/update"
	"github.com/motion/server/internal/webhooks"
)

type Server struct {
	cfg          config.Config
	store        *store.Store
	tokens       *auth.Manager
	hub          *realtime.Hub
	mcp          *mcpserver.Server
	webFS        fs.FS
	webName      string
	siteMu       sync.RWMutex
	site         site.Settings
	oidcMu       sync.Mutex
	oidcKey      string
	oidcVerifier *oidc.IDTokenVerifier
	oidcProvider *oidc.Provider
	oidcErr      error
	updateMu     sync.Mutex
	lastUpdate   update.Check
	lastUpdateAt time.Time
	restart      func()
	webhooks     *webhooks.Service
}

func New(cfg config.Config, st *store.Store, tokens *auth.Manager) *Server {
	hub := realtime.NewHub()
	webFS, webName := resolveWeb(cfg.WebDir)
	srv := &Server{
		cfg: cfg, store: st, tokens: tokens, hub: hub,
		mcp: mcpserver.New(st, hub), webFS: webFS, webName: webName,
		webhooks: webhooks.New(st, cfg.EncryptionKey),
	}
	settings, err := site.Load(context.Background(), st.Settings, cfg, cfg.EncryptionKey)
	if err != nil {
		slog.Warn("could not load site settings; using environment defaults", "error", err)
	}
	if strings.TrimSpace(cfg.OpsToken) == "" {
		slog.Warn("OPS_TOKEN is not set; the /ops console is disabled")
	}
	srv.site = settings
	return srv
}

func (s *Server) siteSnapshot() site.Settings {
	s.siteMu.RLock()
	defer s.siteMu.RUnlock()
	snapshot := s.site
	snapshot.AdminEmails = append([]string(nil), s.site.AdminEmails...)
	snapshot.OIDC.Scopes = append([]string(nil), s.site.OIDC.Scopes...)
	snapshot.OIDC.AllowedDomains = append([]string(nil), s.site.OIDC.AllowedDomains...)
	return snapshot
}

func (s *Server) setSite(settings site.Settings) {
	s.siteMu.Lock()
	s.site = settings
	s.siteMu.Unlock()
}

func (s *Server) invalidateOIDC() {
	s.oidcMu.Lock()
	s.oidcKey = ""
	s.oidcProvider = nil
	s.oidcVerifier = nil
	s.oidcErr = nil
	s.oidcMu.Unlock()
}

func (s *Server) isAdminEmail(email string) bool {
	email = strings.ToLower(strings.TrimSpace(email))
	for _, admin := range s.siteSnapshot().AdminEmails {
		if strings.EqualFold(admin, email) {
			return true
		}
	}
	return false
}

func (s *Server) decorateUser(user *model.User) {
	user.IsAdmin = user.IsAdmin || s.isAdminEmail(user.Email)
}

func (s *Server) requireAdmin(w http.ResponseWriter, r *http.Request) (model.User, bool) {
	var user model.User
	if err := s.store.Users.FindOne(r.Context(), bson.M{"_id": currentUserID(r)}).Decode(&user); err != nil {
		writeErr(w, http.StatusUnauthorized, "account no longer exists")
		return model.User{}, false
	}
	if !user.IsAdmin && !s.isAdminEmail(user.Email) {
		writeErr(w, http.StatusForbidden, "this area is only available to instance administrators")
		return model.User{}, false
	}
	return user, true
}

func (s *Server) requireOpsToken(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		expected := strings.TrimSpace(s.cfg.OpsToken)
		if expected == "" {
			writeErr(w, http.StatusServiceUnavailable, "Ops access is not configured; set OPS_TOKEN on the server")
			return
		}
		provided := strings.TrimSpace(r.Header.Get("X-Ops-Token"))
		if provided == "" {
			auth := strings.TrimSpace(r.Header.Get("Authorization"))
			if strings.HasPrefix(strings.ToLower(auth), "bearer ") {
				provided = strings.TrimSpace(auth[7:])
			}
		}
		if subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) != 1 {
			writeErr(w, http.StatusUnauthorized, "invalid Ops access token")
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (s *Server) Router() http.Handler {
	r := chi.NewRouter()
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Recoverer)
	r.Use(middleware.Timeout(60 * time.Second))
	r.Use(cors.Handler(cors.Options{
		AllowedOrigins:   s.cfg.CORSOrigins,
		AllowedMethods:   []string{"GET", "POST", "PATCH", "PUT", "DELETE", "OPTIONS"},
		AllowedHeaders:   []string{"Accept", "Authorization", "Content-Type", "X-Ops-Token"},
		ExposedHeaders:   []string{"Link"},
		AllowCredentials: false,
		MaxAge:           300,
	}))
	r.Use(s.logRequests)
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			if strings.HasPrefix(r.URL.Path, "/api/") || strings.HasPrefix(r.URL.Path, "/api/v1/") {
				w.Header().Set("X-Motion-API-Version", "1")
			}
			if strings.HasPrefix(r.URL.Path, "/api/v1/") {
				rest := strings.TrimPrefix(r.URL.Path, "/api/v1")
				if strings.Contains(rest, "..") {
					writeErr(w, http.StatusBadRequest, "invalid API path")
					return
				}
				clone := r.Clone(r.Context())
				clone.URL.Path = "/api" + rest
				next.ServeHTTP(w, clone)
				return
			}
			next.ServeHTTP(w, r)
		})
	})

	r.Get("/api/health", s.livez)
	r.Get("/api/livez", s.livez)
	r.Get("/api/readyz", s.readyz)
	r.Get("/api/healthz", s.healthz)
	r.HandleFunc("/mcp", s.mcpEndpoint)

	r.Route("/api", func(r chi.Router) {
		r.Get("/system/info", s.systemInfo)
		r.Get("/auth/config", s.authConfig)
		r.Post("/auth/register", s.register)
		r.Post("/auth/login", s.login)
		r.Get("/auth/oidc/start", s.oidcStart)
		r.Get("/auth/oidc/callback", s.oidcCallback)
		r.Post("/auth/oidc/exchange", s.oidcExchange)
		r.Get("/ws", s.websocket)
		r.Get("/files/{fileID}", s.downloadFile)

		r.Group(func(r chi.Router) {
			r.Use(s.requireOpsToken)
			r.Get("/ops/settings", s.getOpsSettings)
			r.Put("/ops/settings", s.saveOpsSettings)
			r.Get("/ops/stats", s.getOpsStats)
			r.Post("/ops/check-update", s.checkUpdate)
			r.Post("/ops/apply-update", s.applyUpdate)
		})

		r.Group(func(r chi.Router) {
			r.Use(s.authenticate)
			r.Get("/me", s.me)
			r.Patch("/me", s.updateMe)
			r.With(s.requireScope("pages:read")).Get("/maps/config", s.mapConfig)

			r.Get("/tokens", s.listTokens)
			r.Post("/tokens", s.createToken)
			r.Delete("/tokens/{tokenID}", s.deleteToken)

			r.Get("/ai/settings", s.getAISettings)
			r.Put("/ai/settings", s.saveAISettings)
			r.Delete("/ai/settings", s.deleteAISettings)
			r.With(s.requireScope("ai:use"), s.requireScope("pages:read")).Get("/ai/status", s.aiStatus)
			r.Post("/ai/test", s.testAISettings)
			r.With(s.requireScope("ai:use"), s.requireScope("pages:read")).Post("/ai/chat", s.aiChat)
			r.With(s.requireScope("ai:use"), s.requireScope("pages:read")).Post("/ai/chat/stream", s.aiChatStream)
			r.With(s.requireScope("ai:use"), s.requireScope("pages:write")).Post("/ai/agents", s.createAgentsPage)

			r.With(s.requireScope("workspace:read")).Get("/workspaces", s.listWorkspaces)
			r.With(s.requireScope("workspace:write")).Post("/workspaces", s.createWorkspace)
			r.With(s.requireScope("workspace:write")).Patch("/workspaces/{workspaceID}", s.updateWorkspace)
			r.With(s.requireScope("workspace:write")).Delete("/workspaces/{workspaceID}", s.deleteWorkspace)
			r.With(s.requireScope("workspace:read")).Get("/workspaces/{workspaceID}/agent-config", s.getWorkspaceAgentConfig)
			r.With(s.requireScope("workspace:write")).Put("/workspaces/{workspaceID}/agent-config", s.saveWorkspaceAgentConfig)
			r.With(s.requireScope("workspace:read")).Get("/workspaces/{workspaceID}/members", s.listMembers)
			r.With(s.requireScope("workspace:write")).Get("/workspaces/{workspaceID}/invite-suggestions", s.inviteSuggestions)
			r.With(s.requireScope("workspace:write")).Post("/workspaces/{workspaceID}/members", s.inviteMember)
			r.With(s.requireScope("workspace:write")).Patch("/workspaces/{workspaceID}/members/{userID}", s.updateMember)
			r.With(s.requireScope("workspace:write")).Delete("/workspaces/{workspaceID}/members/{userID}", s.removeMember)
			r.With(s.requireScope("pages:read")).Get("/workspaces/{workspaceID}/pages", s.listPages)
			r.With(s.requireScope("pages:read")).Get("/workspaces/{workspaceID}/trash", s.listTrash)
			r.With(s.requireScope("pages:read")).Get("/workspaces/{workspaceID}/search", s.search)
			r.With(s.requireScope("workspace:read")).Get("/workspaces/{workspaceID}/integrations", s.listIntegrations)
			r.With(s.requireScope("workspace:write")).Put("/workspaces/{workspaceID}/integrations/{provider}", s.saveIntegration)
			r.With(s.requireScope("workspace:write")).Post("/workspaces/{workspaceID}/integrations/{provider}/test", s.testIntegration)
			r.With(s.requireScope("workspace:write")).Post("/workspaces/{workspaceID}/integrations/ssh/publish", s.publishSSH)
			r.With(s.requireScope("workspace:write")).Post("/workspaces/{workspaceID}/integrations/git/publish", s.publishGit)
			r.With(s.requireScope("workspace:write")).Post("/workspaces/{workspaceID}/integrations/jira/publish", s.publishJira)
			r.With(s.requireScope("workspace:write")).Post("/workspaces/{workspaceID}/integrations/s3/publish", s.publishS3)
			r.With(s.requireScope("workspace:write")).Post("/workspaces/{workspaceID}/integrations/confluence/publish", s.publishConfluence)
			r.With(s.requireScope("workspace:write")).Delete("/workspaces/{workspaceID}/integrations/{provider}", s.deleteIntegration)
			r.With(s.requireScope("workspace:read")).Get("/workspaces/{workspaceID}/webhook-deliveries", s.listDeliveries)
			r.With(s.requireScope("workspace:write")).Post("/workspaces/{workspaceID}/webhook-deliveries/{deliveryID}/replay", s.replayDelivery)
			r.With(s.requireScope("workspace:read")).Get("/workspaces/{workspaceID}/publish-groups", s.listPublishGroups)
			r.With(s.requireScope("workspace:write")).Post("/workspaces/{workspaceID}/publish-groups", s.savePublishGroup)
			r.With(s.requireScope("workspace:write")).Put("/workspaces/{workspaceID}/publish-groups/{groupID}", s.savePublishGroup)
			r.With(s.requireScope("workspace:write")).Delete("/workspaces/{workspaceID}/publish-groups/{groupID}", s.deletePublishGroup)
			r.With(s.requireScope("pages:read")).Get("/workspaces/{workspaceID}/agents", s.listAgents)
			r.With(s.requireScope("workspace:write")).Post("/workspaces/{workspaceID}/agents", s.createAgent)
			r.With(s.requireScope("workspace:write")).Patch("/agents/{agentID}", s.updateAgent)
			r.With(s.requireScope("workspace:write")).Delete("/agents/{agentID}", s.deleteAgent)
			r.With(s.requireScope("pages:read")).Get("/workspaces/{workspaceID}/proposals", s.listProposals)
			r.With(s.requireScope("pages:read")).Get("/workspaces/{workspaceID}/audit", s.listAudit)
			r.With(s.requireScope("pages:read")).Get("/proposals/{proposalID}", s.getProposal)
			r.With(s.requireScope("pages:write")).Post("/proposals/{proposalID}/approve", s.approveProposal)
			r.With(s.requireScope("pages:write")).Post("/proposals/{proposalID}/reject", s.rejectProposal)

			r.With(s.requireScope("pages:write")).Post("/files", s.uploadFile)
			r.With(s.requireScope("pages:write")).Post("/pages", s.createPage)
			r.With(s.requireScope("pages:read"), middleware.Compress(5, "application/json")).Get("/pages/{pageID}", s.getPage)
			r.With(s.requireScope("pages:read"), middleware.Compress(5, "application/json")).Get("/pages/{pageID}/backlinks", s.pageBacklinks)
			r.With(s.requireScope("pages:read")).Get("/pages/{pageID}/export", s.exportPage)
			r.With(s.requireScope("pages:read")).Post("/pages/{pageID}/form-submissions", s.submitForm)
			r.With(s.requireScope("pages:read")).Get("/pages/{pageID}/form-submissions", s.listFormSubmissions)
			r.With(s.requireScope("pages:write")).Patch("/pages/{pageID}", s.updatePage)
			r.With(s.requireScope("pages:write")).Post("/pages/{pageID}/move", s.movePage)
			r.With(s.requireScope("pages:write")).Post("/pages/{pageID}/lock", s.lockPage)
			r.With(s.requireScope("pages:write")).Post("/pages/{pageID}/unlock", s.unlockPage)
			r.With(s.requireScope("pages:write")).Put("/pages/{pageID}/blocks", s.saveBlocks)
			r.With(s.requireScope("pages:write")).Post("/pages/{pageID}/ops", s.syncBlocks)
			r.With(s.requireScope("pages:write")).Post("/pages/{pageID}/duplicate", s.duplicatePage)
			r.With(s.requireScope("pages:write")).Post("/pages/{pageID}/split", s.splitPage)
			r.With(s.requireScope("pages:write")).Post("/pages/{pageID}/merge", s.mergePages)
			r.With(s.requireScope("pages:write")).Post("/pages/{pageID}/detach-layout", s.detachLayout)
			r.With(s.requireScope("pages:write")).Delete("/pages/{pageID}", s.deletePage)
			r.With(s.requireScope("pages:read"), middleware.Compress(5, "application/json")).Get("/pages/{pageID}/revisions", s.listRevisions)
			r.With(s.requireScope("pages:write")).Post("/pages/{pageID}/revisions", s.createSnapshot)
			r.With(s.requireScope("pages:read"), middleware.Compress(5, "application/json")).Get("/pages/{pageID}/revisions/{revisionID}", s.getRevision)
			r.With(s.requireScope("pages:write")).Post("/pages/{pageID}/revisions/{revisionID}/restore", s.restoreRevision)
			r.With(s.requireScope("pages:read"), middleware.Compress(5, "application/json")).Get("/pages/{pageID}/comments", s.listComments)
			r.With(s.requireScope("pages:write")).Post("/pages/{pageID}/comments", s.createComment)
			r.With(s.requireScope("pages:write")).Patch("/comments/{commentID}", s.updateComment)
			r.With(s.requireScope("pages:write")).Delete("/comments/{commentID}", s.deleteComment)
		})
	})

	r.NotFound(s.serveWeb)

	return r
}

func (s *Server) logRequests(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		ww := middleware.NewWrapResponseWriter(w, r.ProtoMajor)
		next.ServeHTTP(ww, r)
		slog.Info("request", "method", r.Method, "path", r.URL.Path, "status", ww.Status(), "duration", time.Since(start).Round(time.Millisecond))
	})
}

type ctxKey string

const userIDKey ctxKey = "userID"

func (s *Server) authenticate(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		header := r.Header.Get("Authorization")
		if !strings.HasPrefix(header, "Bearer ") {
			writeErr(w, http.StatusUnauthorized, "missing bearer token")
			return
		}
		raw := strings.TrimPrefix(header, "Bearer ")
		var info AuthInfo
		if isPersonalToken(raw) {
			pat, err := s.authenticatePAT(r, raw)
			if err != nil {
				writeErr(w, http.StatusUnauthorized, err.Error())
				return
			}
			info = pat
		} else {
			userID, err := s.tokens.Parse(raw)
			if err != nil {
				writeErr(w, http.StatusUnauthorized, "invalid or expired token")
				return
			}
			info = jwtAuth(userID)
		}
		ctx := withUserID(r.Context(), info.UserID)
		ctx = withAuthInfo(ctx, info)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func currentUserID(r *http.Request) primitive.ObjectID {
	id, _ := r.Context().Value(userIDKey).(primitive.ObjectID)
	return id
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	if payload == nil {
		return
	}
	if err := json.NewEncoder(w).Encode(payload); err != nil {
		slog.Error("write json", "error", err)
	}
}

func writeErr(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func decodeJSON(r *http.Request, dst any) error {
	dec := json.NewDecoder(http.MaxBytesReader(nil, r.Body, 8<<20))
	dec.DisallowUnknownFields()
	if err := dec.Decode(dst); err != nil {
		return err
	}
	return nil
}

func isNotFound(err error) bool {
	return errors.Is(err, mongo.ErrNoDocuments)
}
