package docagent

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strings"

	"github.com/modelcontextprotocol/go-sdk/mcp"
	"google.golang.org/adk/tool"
	"google.golang.org/adk/tool/mcptoolset"
	"google.golang.org/adk/tool/skilltoolset"
	"google.golang.org/adk/tool/skilltoolset/skill"

	"github.com/motion/server/internal/model"
)

type workspaceSkillSource struct {
	skills []model.WorkspaceSkill
}

var skillNamePattern = regexp.MustCompile(`[^a-z0-9-]+`)

func skillSlug(name string) string {
	value := skillNamePattern.ReplaceAllString(strings.ToLower(strings.TrimSpace(name)), "-")
	value = strings.Trim(value, "-")
	if value == "" {
		value = "skill"
	}
	return value
}

func (s *workspaceSkillSource) byName(name string) (model.WorkspaceSkill, bool) {
	for _, item := range s.skills {
		if skillSlug(item.Name) == name {
			return item, true
		}
	}
	return model.WorkspaceSkill{}, false
}

func (s *workspaceSkillSource) ListFrontmatters(context.Context) ([]*skill.Frontmatter, error) {
	out := make([]*skill.Frontmatter, 0, len(s.skills))
	for _, item := range s.skills {
		description := item.Description
		if description == "" {
			description = "Workspace skill: " + item.Name
		}
		out = append(out, &skill.Frontmatter{Name: skillSlug(item.Name), Description: description})
	}
	return out, nil
}

func (s *workspaceSkillSource) ListResources(context.Context, string, string) ([]string, error) {
	return nil, nil
}

func (s *workspaceSkillSource) LoadFrontmatter(_ context.Context, name string) (*skill.Frontmatter, error) {
	item, ok := s.byName(name)
	if !ok {
		return nil, skill.ErrSkillNotFound
	}
	description := item.Description
	if description == "" {
		description = "Workspace skill: " + item.Name
	}
	return &skill.Frontmatter{Name: skillSlug(item.Name), Description: description}, nil
}

func (s *workspaceSkillSource) LoadInstructions(_ context.Context, name string) (string, error) {
	item, ok := s.byName(name)
	if !ok {
		return "", skill.ErrSkillNotFound
	}
	return item.Instructions, nil
}

func (s *workspaceSkillSource) LoadResource(context.Context, string, string) (io.ReadCloser, error) {
	return nil, skill.ErrResourceNotFound
}

type headerTransport struct {
	base    http.RoundTripper
	headers map[string]string
}

func (h headerTransport) RoundTrip(request *http.Request) (*http.Response, error) {
	clone := request.Clone(request.Context())
	for key, value := range h.headers {
		clone.Header.Set(key, value)
	}
	base := h.base
	if base == nil {
		base = http.DefaultTransport
	}
	return base.RoundTrip(clone)
}

func workspaceToolsets(ctx context.Context, workspace model.Workspace) ([]tool.Toolset, error) {
	toolsets := make([]tool.Toolset, 0, 1+len(workspace.MCPServers))
	if len(workspace.Skills) > 0 {
		set, err := skilltoolset.New(ctx, skilltoolset.Config{
			Source: &workspaceSkillSource{skills: workspace.Skills},
		})
		if err != nil {
			return nil, fmt.Errorf("could not load workspace skills: %w", err)
		}
		toolsets = append(toolsets, set)
	}
	for _, server := range workspace.MCPServers {
		if !server.Enabled || strings.TrimSpace(server.URL) == "" {
			continue
		}
		client := &http.Client{}
		if len(server.Headers) > 0 {
			client.Transport = headerTransport{headers: server.Headers}
		}
		set, err := mcptoolset.New(mcptoolset.Config{
			Transport: &mcp.StreamableClientTransport{
				Endpoint:   server.URL,
				HTTPClient: client,
			},
		})
		if err != nil {
			return nil, fmt.Errorf("could not load MCP server %q: %w", server.Name, err)
		}
		toolsets = append(toolsets, set)
	}
	return toolsets, nil
}
