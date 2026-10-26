package seed

import (
	"context"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"golang.org/x/crypto/bcrypt"

	"github.com/motion/server/internal/model"
	"github.com/motion/server/internal/store"
)

type seedBlock struct {
	Type     string
	Text     string
	Checked  bool
	Language string
	Color    string
}

func newBlock(b seedBlock) model.Block {
	return model.Block{
		ID:       primitive.NewObjectID().Hex(),
		Type:     b.Type,
		Text:     b.Text,
		Checked:  b.Checked,
		Language: b.Language,
		Color:    b.Color,
	}
}

func blocksOf(items []seedBlock) []model.Block {
	out := make([]model.Block, 0, len(items))
	for _, item := range items {
		out = append(out, newBlock(item))
	}
	return out
}

func plainText(blocks []model.Block) string {
	var b strings.Builder
	for _, block := range blocks {
		b.WriteString(block.Text)
		b.WriteString("\n")
	}
	return strings.ToLower(b.String())
}

func welcomeBlocks() []model.Block {
	return blocksOf([]seedBlock{
		{Type: "paragraph", Text: "Motion is a calm place to write, plan and think. Everything you type is saved automatically — no save button, no friction."},
		{Type: "heading2", Text: "Things to try"},
		{Type: "bulleted", Text: "Type / on any empty line to insert a heading, list, code block or callout."},
		{Type: "bulleted", Text: "Start a line with #, ##, >, -, [] or 1. and press Space to convert it."},
		{Type: "bulleted", Text: "Hover a block and drag the handle to move it around."},
		{Type: "bulleted", Text: "Press ⌘K (or Ctrl+K) to search everything in this workspace."},
		{Type: "todo", Text: "Create your first page with the + button in the sidebar", Checked: true},
		{Type: "todo", Text: "Star a page to pin it to Favorites"},
		{Type: "heading2", Text: "Make it yours"},
		{Type: "callout", Text: "Click the emoji above the title to give this page a face. Add a cover for extra personality.", Color: "amber"},
		{Type: "quote", Text: "The best way to get started is to stop talking and start doing. — Walt Disney"},
		{Type: "divider"},
		{Type: "paragraph", Text: "Delete this page whenever you like. Your workspace, your rules."},
	})
}

// CreateWorkspaceWithWelcome provisions a workspace and a friendly first page for
// a brand-new account.
func CreateWorkspaceWithWelcome(ctx context.Context, st *store.Store, userID primitive.ObjectID, name, icon string) (*model.Workspace, error) {
	if strings.TrimSpace(name) == "" {
		name = "My Workspace"
	}
	if icon == "" {
		icon = "🧭"
	}
	now := time.Now().UTC()
	ws := &model.Workspace{
		ID:        primitive.NewObjectID(),
		Name:      name,
		Icon:      icon,
		OwnerID:   userID,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if _, err := st.Workspaces.InsertOne(ctx, ws); err != nil {
		return nil, err
	}

	blocks := welcomeBlocks()
	page := model.Page{
		ID:          primitive.NewObjectID(),
		WorkspaceID: ws.ID,
		Title:       "Welcome to Motion",
		Icon:        "👋",
		Cover:       "gradient:sunrise",
		Blocks:      blocks,
		Text:        plainText(blocks),
		Favorite:    true,
		Order:       1024,
		CreatedBy:   userID,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if _, err := st.Pages.InsertOne(ctx, page); err != nil {
		return nil, err
	}
	return ws, nil
}

// SeedDemo creates the demo account used by the marketing page and local dev.
func SeedDemo(ctx context.Context, st *store.Store) error {
	var existing model.User
	if err := st.Users.FindOne(ctx, bson.M{"email": "demo@motion.app"}).Decode(&existing); err == nil {
		return nil
	}

	hash, err := bcrypt.GenerateFromPassword([]byte("demo1234"), bcrypt.DefaultCost)
	if err != nil {
		return err
	}
	now := time.Now().UTC()
	user := model.User{
		ID:        primitive.NewObjectID(),
		Name:      "Motion Demo",
		Email:     "demo@motion.app",
		Password:  string(hash),
		CreatedAt: now,
		UpdatedAt: now,
	}
	if _, err := st.Users.InsertOne(ctx, user); err != nil {
		return err
	}

	ws, err := CreateWorkspaceWithWelcome(ctx, st, user.ID, "Motion", "🌊")
	if err != nil {
		return err
	}

	// Turn the welcome page into a demo showcase with a nested page.
	var welcome model.Page
	if err := st.Pages.FindOne(ctx, bson.M{"workspaceId": ws.ID, "title": "Welcome to Motion"}).Decode(&welcome); err != nil {
		return err
	}

	shortcutBlocks := blocksOf([]seedBlock{
		{Type: "paragraph", Text: "A few keystrokes that make writing feel light."},
		{Type: "heading3", Text: "Blocks"},
		{Type: "bulleted", Text: "# + Space → Heading 1"},
		{Type: "bulleted", Text: "## + Space → Heading 2"},
		{Type: "bulleted", Text: "- + Space → Bulleted list"},
		{Type: "bulleted", Text: "1. + Space → Numbered list"},
		{Type: "bulleted", Text: "[] + Space → To-do"},
		{Type: "bulleted", Text: "> + Space → Quote"},
		{Type: "bulleted", Text: "``` + Space → Code block"},
		{Type: "heading3", Text: "Editing"},
		{Type: "bulleted", Text: "Enter creates a new block, Backspace at the start merges blocks."},
		{Type: "bulleted", Text: "Shift + Enter inserts a soft line break inside a block."},
		{Type: "bulleted", Text: "⌘K opens search, Esc closes menus."},
	})
	shortcut := model.Page{
		ID:          primitive.NewObjectID(),
		WorkspaceID: ws.ID,
		ParentID:    &welcome.ID,
		Title:       "Editor shortcuts",
		Icon:        "⌨️",
		Blocks:      shortcutBlocks,
		Text:        plainText(shortcutBlocks),
		Order:       1024,
		CreatedBy:   user.ID,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if _, err := st.Pages.InsertOne(ctx, shortcut); err != nil {
		return err
	}

	roadmapBlocks := blocksOf([]seedBlock{
		{Type: "paragraph", Text: "A tiny plan for the next two weeks. Drag the checkboxes around, edit freely, and make it yours."},
		{Type: "heading2", Text: "This week"},
		{Type: "todo", Text: "Polish the block editor", Checked: true},
		{Type: "todo", Text: "Add workspace search", Checked: true},
		{Type: "todo", Text: "Ship page covers and emoji picker"},
		{Type: "todo", Text: "Write onboarding notes"},
		{Type: "heading2", Text: "Next week"},
		{Type: "todo", Text: "Collaborative cursors"},
		{Type: "todo", Text: "Page templates"},
		{Type: "todo", Text: "Mobile quick capture"},
		{Type: "callout", Text: "Keep the scope small. Momentum beats perfection.", Color: "blue"},
	})
	roadmap := model.Page{
		ID:          primitive.NewObjectID(),
		WorkspaceID: ws.ID,
		Title:       "Product Roadmap",
		Icon:        "🚀",
		Cover:       "gradient:ocean",
		Blocks:      roadmapBlocks,
		Text:        plainText(roadmapBlocks),
		Favorite:    true,
		Order:       2048,
		CreatedBy:   user.ID,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if _, err := st.Pages.InsertOne(ctx, roadmap); err != nil {
		return err
	}

	noteBlocks := blocksOf([]seedBlock{
		{Type: "paragraph", Text: "Friday, 4:32 pm. A quiet hour to collect the week."},
		{Type: "heading3", Text: "What moved"},
		{Type: "bulleted", Text: "The editor finally feels calm."},
		{Type: "bulleted", Text: "Search is fast enough to use without thinking."},
		{Type: "heading3", Text: "What I learned"},
		{Type: "quote", Text: "Simplicity is the soul of efficiency. — Austin Freeman"},
		{Type: "paragraph", Text: "Next week: fewer features, more polish."},
	})
	notes := model.Page{
		ID:          primitive.NewObjectID(),
		WorkspaceID: ws.ID,
		Title:       "Weekly Notes",
		Icon:        "📝",
		Blocks:      noteBlocks,
		Text:        plainText(noteBlocks),
		Order:       3072,
		CreatedBy:   user.ID,
		CreatedAt:   now,
		UpdatedAt:   now,
	}
	if _, err := st.Pages.InsertOne(ctx, notes); err != nil {
		return err
	}

	return nil
}
