package docagent

import (
	"context"
	"testing"

	"github.com/motion/server/internal/model"
)

func TestWorkspaceSkillSource(t *testing.T) {
	source := &workspaceSkillSource{skills: []model.WorkspaceSkill{{
		Name: "Release notes", Description: "How to write releases", Instructions: "Use short headings.",
	}}}
	items, err := source.ListFrontmatters(context.Background())
	if err != nil || len(items) != 1 {
		t.Fatalf("ListFrontmatters = %v, %v", items, err)
	}
	if items[0].Name != "release-notes" {
		t.Fatalf("unexpected slug %q", items[0].Name)
	}
	text, err := source.LoadInstructions(context.Background(), "release-notes")
	if err != nil || text != "Use short headings." {
		t.Fatalf("LoadInstructions = %q, %v", text, err)
	}
}

func TestWorkspaceToolsetsWithSkills(t *testing.T) {
	toolsets, err := workspaceToolsets(context.Background(), model.Workspace{
		Skills: []model.WorkspaceSkill{{Name: "Research", Instructions: "Cite sources."}},
	})
	if err != nil {
		t.Fatal(err)
	}
	if len(toolsets) != 1 {
		t.Fatalf("got %d toolsets", len(toolsets))
	}
}
