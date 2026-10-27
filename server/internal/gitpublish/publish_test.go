package gitpublish

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGitHubPublishAndTest(t *testing.T) {
	var putPath string
	var putBody string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		switch {
		case r.Method == http.MethodGet && strings.Contains(r.URL.Path, "/contents/"):
			http.NotFound(w, r)
		case r.Method == http.MethodPut && strings.Contains(r.URL.Path, "/contents/"):
			putPath = r.URL.Path
			data, _ := io.ReadAll(r.Body)
			putBody = string(data)
			w.Header().Set("Content-Type", "application/json")
			_, _ = w.Write([]byte(`{"content":{"sha":"abc"}}`))
		default:
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"ok":true}`))
		}
	}))
	defer server.Close()
	cfg := Config{Kind: "github", BaseURL: server.URL, Owner: "acme", Repo: "docs", Branch: "main", Path: "docs", Token: "token"}
	if err := Test(context.Background(), cfg); err != nil {
		t.Fatal(err)
	}
	count, err := Publish(context.Background(), cfg, map[string][]byte{"index.html": []byte("<h1>Hello</h1>")})
	if err != nil || count != 1 {
		t.Fatalf("Publish = %d, %v", count, err)
	}
	if !strings.Contains(putPath, "/repos/acme/docs/contents/docs/index.html") || !strings.Contains(putBody, "PGgxPkhlbGxvPC9oMT4=") {
		t.Fatalf("unexpected request path=%q body=%q", putPath, putBody)
	}
}
