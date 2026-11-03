package httpapi

import (
	"strings"
	"testing"
)

func TestExpandTemplateVarsIncludesWorkspaceVariables(t *testing.T) {
	got := expandTemplateVars("Hi {name}, {workspace} on {date}", "", "Motion", map[string]string{
		"name": "Ada", "workspace": "ignored", "team": "Platform",
	})
	if !strings.Contains(got, "Hi Ada, Motion on ") || strings.Contains(got, "{name}") || strings.Contains(got, "ignored") {
		t.Fatalf("unexpected expansion: %q", got)
	}
	if got := expandTemplateVars("{team}", "", "", map[string]string{"team": "Platform"}); got != "Platform" {
		t.Fatalf("custom variable not expanded: %q", got)
	}
	if got := expandTemplateVars("{date}", "", "", map[string]string{"date": "overridden"}); strings.Contains(got, "overridden") {
		t.Fatalf("built-in variable must not be overridden: %q", got)
	}
}
