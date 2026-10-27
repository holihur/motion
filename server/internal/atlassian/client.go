package atlassian

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

type Config struct {
	SiteURL    string
	Email      string
	Token      string
	ProjectKey string
	IssueType  string
	IssueKey   string
	SpaceID    string
	PageID     string
	ParentID   string
}

type Client struct {
	http *http.Client
	cfg  Config
}

func New(cfg Config) *Client {
	cfg.SiteURL = strings.TrimRight(strings.TrimSpace(cfg.SiteURL), "/")
	if cfg.IssueType == "" {
		cfg.IssueType = "Task"
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
	request.SetBasicAuth(c.cfg.Email, c.cfg.Token)
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Content-Type", "application/json")
	response, err := c.http.Do(request)
	if err != nil {
		return nil, 0, err
	}
	defer response.Body.Close()
	data, _ := io.ReadAll(io.LimitReader(response.Body, 2<<20))
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return data, response.StatusCode, fmt.Errorf("Atlassian API returned HTTP %d: %s", response.StatusCode, strings.TrimSpace(string(data)))
	}
	return data, response.StatusCode, nil
}

// PublishIssue creates or updates a Jira issue with an ADF description.
func (c *Client) PublishIssue(ctx context.Context, summary string, description map[string]any) (string, string, error) {
	key := strings.TrimSpace(c.cfg.IssueKey)
	if key != "" {
		_, _, err := c.request(ctx, http.MethodPut, c.cfg.SiteURL+"/rest/api/3/issue/"+key, map[string]any{
			"fields": map[string]any{"summary": summary, "description": description},
		})
		if err != nil {
			return "", "", err
		}
		return key, c.cfg.SiteURL + "/browse/" + key, nil
	}
	data, _, err := c.request(ctx, http.MethodPost, c.cfg.SiteURL+"/rest/api/3/issue", map[string]any{
		"fields": map[string]any{
			"project":     map[string]any{"key": c.cfg.ProjectKey},
			"summary":     summary,
			"description": description,
			"issuetype":   map[string]any{"name": c.cfg.IssueType},
		},
	})
	if err != nil {
		return "", "", err
	}
	var created struct {
		Key string `json:"key"`
	}
	if err := json.Unmarshal(data, &created); err != nil || created.Key == "" {
		return "", "", fmt.Errorf("Jira did not return an issue key")
	}
	return created.Key, c.cfg.SiteURL + "/browse/" + created.Key, nil
}

// PublishConfluencePage creates or updates a Confluence Cloud page with ADF.
func (c *Client) PublishConfluencePage(ctx context.Context, title string, document map[string]any) (string, string, error) {
	encoded, err := json.Marshal(document)
	if err != nil {
		return "", "", err
	}
	body := map[string]any{
		"id": c.cfg.PageID, "title": title, "status": "current",
		"spaceId": c.cfg.SpaceID,
		"body":    map[string]any{"representation": "atlas_doc_format", "value": string(encoded)},
	}
	if c.cfg.ParentID != "" {
		body["parentId"] = c.cfg.ParentID
	}
	method := http.MethodPost
	endpoint := c.cfg.SiteURL + "/wiki/api/v2/pages"
	if c.cfg.PageID != "" {
		method = http.MethodPut
		endpoint += "/" + c.cfg.PageID
	}
	data, _, err := c.request(ctx, method, endpoint, body)
	if err != nil {
		return "", "", err
	}
	var page struct {
		ID string `json:"id"`
	}
	_ = json.Unmarshal(data, &page)
	if page.ID == "" {
		page.ID = c.cfg.PageID
	}
	return page.ID, c.cfg.SiteURL + "/wiki/pages/" + page.ID, nil
}
