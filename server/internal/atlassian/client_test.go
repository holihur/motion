package atlassian

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestJiraPublishIssue(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/rest/api/3/issue" || r.Method != http.MethodPost {
			t.Fatalf("unexpected request %s %s", r.Method, r.URL.Path)
		}
		if user, _, ok := r.BasicAuth(); !ok || user != "me@example.com" {
			t.Fatalf("missing basic auth")
		}
		data, _ := io.ReadAll(r.Body)
		if !strings.Contains(string(data), `"project":{"key":"DOCS"}`) {
			t.Fatalf("unexpected body %s", string(data))
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"key":"DOCS-1"}`))
	}))
	defer server.Close()
	client := New(Config{SiteURL: server.URL, Email: "me@example.com", Token: "token", ProjectKey: "DOCS"})
	key, url, err := client.PublishIssue(context.Background(), "Title", map[string]any{"type": "doc"})
	if err != nil || key != "DOCS-1" || !strings.Contains(url, "/browse/DOCS-1") {
		t.Fatalf("PublishIssue = %q %q %v", key, url, err)
	}
}
