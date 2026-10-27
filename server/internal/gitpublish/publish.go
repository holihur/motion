package gitpublish

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"
	"time"
)

type Config struct {
	Kind       string // github, gitlab, gitea
	BaseURL    string
	Owner      string
	Repo       string
	Branch     string
	Path       string
	Token      string
	PublicBase string
}

type Client struct {
	http *http.Client
	cfg  Config
}

func New(cfg Config) *Client {
	base := strings.TrimRight(strings.TrimSpace(cfg.BaseURL), "/")
	if base == "" {
		switch strings.ToLower(cfg.Kind) {
		case "gitlab":
			base = "https://gitlab.com"
		case "gitea":
			base = "https://gitea.com"
		default:
			base = "https://api.github.com"
		}
	}
	cfg.BaseURL = base
	if cfg.Branch == "" {
		cfg.Branch = "main"
	}
	if cfg.Path == "" {
		cfg.Path = "docs"
	}
	return &Client{http: &http.Client{Timeout: 30 * time.Second}, cfg: cfg}
}

func (c *Client) request(ctx context.Context, method, endpoint string, body any) ([]byte, int, error) {
	var reader io.Reader
	if body != nil {
		data, err := json.Marshal(body)
		if err != nil {
			return nil, 0, err
		}
		reader = bytes.NewReader(data)
	}
	request, err := http.NewRequestWithContext(ctx, method, endpoint, reader)
	if err != nil {
		return nil, 0, err
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("User-Agent", "Motion-Publisher/1.0")
	if body != nil {
		request.Header.Set("Content-Type", "application/json")
	}
	switch strings.ToLower(c.cfg.Kind) {
	case "gitlab":
		request.Header.Set("PRIVATE-TOKEN", c.cfg.Token)
	case "gitea":
		request.Header.Set("Authorization", "token "+c.cfg.Token)
	default:
		request.Header.Set("Authorization", "Bearer "+c.cfg.Token)
		request.Header.Set("X-GitHub-Api-Version", "2022-11-28")
	}
	response, err := c.http.Do(request)
	if err != nil {
		return nil, 0, err
	}
	defer response.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(response.Body, 1<<20))
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return data, response.StatusCode, fmt.Errorf("%s returned HTTP %d: %s", c.cfg.Kind, response.StatusCode, strings.TrimSpace(string(data)))
	}
	return data, response.StatusCode, nil
}

func (c *Client) apiPath(suffix string) string {
	switch strings.ToLower(c.cfg.Kind) {
	case "gitlab":
		return c.cfg.BaseURL + "/api/v4" + suffix
	case "gitea":
		return c.cfg.BaseURL + "/api/v1" + suffix
	default:
		return c.cfg.BaseURL + suffix
	}
}

func (c *Client) PutFile(ctx context.Context, file string, content []byte) error {
	remote := path.Join(strings.Trim(c.cfg.Path, "/"), file)
	encoded := base64.StdEncoding.EncodeToString(content)
	switch strings.ToLower(c.cfg.Kind) {
	case "gitlab":
		project := url.PathEscape(c.cfg.Owner + "/" + c.cfg.Repo)
		endpoint := c.apiPath("/projects/" + project + "/repository/files/" + url.PathEscape(remote))
		body := map[string]any{"branch": c.cfg.Branch, "content": encoded, "encoding": "base64", "commit_message": "Publish from Motion"}
		_, code, err := c.request(ctx, http.MethodPost, endpoint, body)
		if code == http.StatusBadRequest || code == http.StatusConflict {
			_, _, err = c.request(ctx, http.MethodPut, endpoint, body)
		}
		return err
	case "gitea":
		endpoint := c.apiPath("/repos/" + url.PathEscape(c.cfg.Owner) + "/" + url.PathEscape(c.cfg.Repo) + "/contents/" + url.PathEscape(remote))
		body := map[string]any{"branch": c.cfg.Branch, "content": encoded, "message": "Publish from Motion"}
		_, code, err := c.request(ctx, http.MethodPost, endpoint, body)
		if code == http.StatusConflict || code == http.StatusUnprocessableEntity {
			_, _, err = c.request(ctx, http.MethodPut, endpoint, body)
		}
		return err
	default:
		endpoint := c.apiPath("/repos/" + c.cfg.Owner + "/" + c.cfg.Repo + "/contents/" + strings.TrimLeft(remote, "/"))
		sha := ""
		data, code, err := c.request(ctx, http.MethodGet, endpoint+"?ref="+url.QueryEscape(c.cfg.Branch), nil)
		if err == nil && code == http.StatusOK {
			var current struct {
				SHA string `json:"sha"`
			}
			_ = json.Unmarshal(data, &current)
			sha = current.SHA
		}
		body := map[string]any{"message": "Publish from Motion", "content": encoded, "branch": c.cfg.Branch}
		if sha != "" {
			body["sha"] = sha
		}
		_, _, err = c.request(ctx, http.MethodPut, endpoint, body)
		return err
	}
}

func (c *Client) EnablePages(ctx context.Context) {
	if strings.ToLower(c.cfg.Kind) != "github" {
		return
	}
	endpoint := c.apiPath("/repos/" + c.cfg.Owner + "/" + c.cfg.Repo + "/pages")
	_, code, _ := c.request(ctx, http.MethodPost, endpoint, map[string]any{
		"source": map[string]string{"branch": c.cfg.Branch, "path": "/" + strings.Trim(c.cfg.Path, "/")},
	})
	_ = code
}

func (c *Client) PublicURL() string {
	if c.cfg.PublicBase != "" {
		return strings.TrimRight(c.cfg.PublicBase, "/") + "/"
	}
	switch strings.ToLower(c.cfg.Kind) {
	case "gitlab":
		return "https://" + c.cfg.Owner + ".gitlab.io/" + c.cfg.Repo + "/"
	case "gitea":
		return strings.TrimRight(c.cfg.BaseURL, "/") + "/" + c.cfg.Owner + "/" + c.cfg.Repo + "/"
	default:
		return "https://" + c.cfg.Owner + ".github.io/" + c.cfg.Repo + "/"
	}
}

// Publish writes all rendered files. It returns the first error and the number
// of successfully written files.
func Publish(ctx context.Context, cfg Config, files map[string][]byte) (int, error) {
	client := New(cfg)
	count := 0
	for name, content := range files {
		if strings.Contains(name, "..") {
			continue
		}
		if err := client.PutFile(ctx, name, content); err != nil {
			return count, err
		}
		count++
	}
	client.EnablePages(ctx)
	return count, nil
}
