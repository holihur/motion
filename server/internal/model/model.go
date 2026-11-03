package model

import (
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type User struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Name        string             `bson:"name" json:"name"`
	Email       string             `bson:"email" json:"email"`
	Avatar      string             `bson:"avatar,omitempty" json:"avatar,omitempty"`
	Password    string             `bson:"password" json:"-"`
	OIDCIssuer  string             `bson:"oidcIssuer,omitempty" json:"-"`
	OIDCSubject string             `bson:"oidcSubject,omitempty" json:"-"`
	IsAdmin     bool               `bson:"isAdmin,omitempty" json:"isAdmin"`
	NotifyPrefs *NotifyPrefs       `bson:"notifyPrefs,omitempty" json:"notifyPrefs,omitempty"`
	CreatedAt   time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt   time.Time          `bson:"updatedAt" json:"updatedAt"`
}

// NotifyPrefs controls in-app notification delivery. Nil = all enabled.
type NotifyPrefs struct {
	Mention   *bool `bson:"mention,omitempty" json:"mention,omitempty"`
	Reply     *bool `bson:"reply,omitempty" json:"reply,omitempty"`
	AgentDone *bool `bson:"agentDone,omitempty" json:"agentDone,omitempty"`
	Browser   *bool `bson:"browser,omitempty" json:"browser,omitempty"`
}

type Member struct {
	UserID   primitive.ObjectID `bson:"userId" json:"userId"`
	Name     string             `bson:"name" json:"name"`
	Email    string             `bson:"email" json:"email"`
	Role     string             `bson:"role" json:"role"`
	JoinedAt time.Time          `bson:"joinedAt" json:"joinedAt"`
}

type WorkspaceSkill struct {
	ID           string `bson:"id" json:"id"`
	Name         string `bson:"name" json:"name"`
	Description  string `bson:"description" json:"description"`
	Instructions string `bson:"instructions" json:"instructions"`
}

type WorkspaceMCP struct {
	ID      string            `bson:"id" json:"id"`
	Name    string            `bson:"name" json:"name"`
	URL     string            `bson:"url" json:"url"`
	Headers map[string]string `bson:"headers,omitempty" json:"headers,omitempty"`
	Enabled bool              `bson:"enabled" json:"enabled"`
}

type Workspace struct {
	ID            primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Name          string             `bson:"name" json:"name"`
	Icon          string             `bson:"icon" json:"icon"`
	OwnerID       primitive.ObjectID `bson:"ownerId" json:"ownerId"`
	Members       []Member           `bson:"members,omitempty" json:"members,omitempty"`
	InviteHistory []string           `bson:"inviteHistory,omitempty" json:"-"`
	Skills        []WorkspaceSkill   `bson:"skills,omitempty" json:"skills,omitempty"`
	MCPServers    []WorkspaceMCP     `bson:"mcpServers,omitempty" json:"mcpServers,omitempty"`
	TaskTemplates []TaskTemplate     `bson:"taskTemplates,omitempty" json:"taskTemplates,omitempty"`
	Variables     map[string]string  `bson:"variables,omitempty" json:"variables,omitempty"`
	CreatedAt     time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt     time.Time          `bson:"updatedAt" json:"updatedAt"`
}

// TaskTemplate is a saved dispatch task shared across the workspace.
type TaskTemplate struct {
	ID        string    `bson:"id" json:"id"`
	Name      string    `bson:"name" json:"name"`
	Prompt    string    `bson:"prompt" json:"prompt"`
	PageID    string    `bson:"pageId,omitempty" json:"pageId,omitempty"`
	AgentID   string    `bson:"agentId,omitempty" json:"agentId,omitempty"`
	CreatedAt time.Time `bson:"createdAt" json:"createdAt"`
}

// Block is a single unit of page content. Content is stored as plain text;
// inline styles and block-level options live in the meta fields.
type TableFilter struct {
	Column string `bson:"column" json:"column"`
	Op     string `bson:"op" json:"op"`
	Value  string `bson:"value,omitempty" json:"value,omitempty"`
}

type TableQuery struct {
	Match   string        `bson:"match" json:"match"`
	Filters []TableFilter `bson:"filters" json:"filters"`
}

type TableCellStyle struct {
	BG     string `bson:"bg,omitempty" json:"bg,omitempty"`
	Color  string `bson:"color,omitempty" json:"color,omitempty"`
	Bold   bool   `bson:"bold,omitempty" json:"bold,omitempty"`
	Italic bool   `bson:"italic,omitempty" json:"italic,omitempty"`
}

type TableData struct {
	Columns       []string          `bson:"columns" json:"columns"`
	Rows          [][]string        `bson:"rows" json:"rows"`
	Header        bool              `bson:"header" json:"header"`
	RowNumbers    bool              `bson:"rowNumbers,omitempty" json:"rowNumbers,omitempty"`
	Query         *TableQuery       `bson:"query,omitempty" json:"query,omitempty"`
	ColumnStyles  []*TableCellStyle `bson:"columnStyles,omitempty" json:"columnStyles,omitempty"`
	RowStyles     []*TableCellStyle `bson:"rowStyles,omitempty" json:"rowStyles,omitempty"`
	ColumnOrder   []int             `bson:"columnOrder,omitempty" json:"columnOrder,omitempty"`
	HiddenColumns []int             `bson:"hiddenColumns,omitempty" json:"hiddenColumns,omitempty"`
	FreezeFirst   bool              `bson:"freezeFirst,omitempty" json:"freezeFirst,omitempty"`
	FrozenColumns []int             `bson:"frozenColumns,omitempty" json:"frozenColumns,omitempty"`
	StickyHeader  *bool             `bson:"stickyHeader,omitempty" json:"stickyHeader,omitempty"`
	Widths        []float64         `bson:"widths,omitempty" json:"widths,omitempty"`
	Align         []string          `bson:"align,omitempty" json:"align,omitempty"`
	Formulas      map[string]string `bson:"formulas,omitempty" json:"formulas,omitempty"`
	ColumnTypes   []string          `bson:"columnTypes,omitempty" json:"columnTypes,omitempty"`
	ColumnOptions [][]string        `bson:"columnOptions,omitempty" json:"columnOptions,omitempty"`
}

// TruthyTableCell reports whether a checkbox/switch cell value means "on".
// It accepts the values produced by older clients and spreadsheet imports.
func TruthyTableCell(value string) bool {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "true", "1", "yes", "on", "done", "checked", "x", "✓", "✔", "☑":
		return true
	}
	return false
}

// ColumnTypeAt returns the input type for a column, defaulting to text.
func (t *TableData) ColumnTypeAt(index int) string {
	if t == nil || index < 0 || index >= len(t.ColumnTypes) {
		return "text"
	}
	switch t.ColumnTypes[index] {
	case "checkbox", "switch", "select":
		return t.ColumnTypes[index]
	}
	return "text"
}

// DisplayCell renders a cell for text exports (Markdown, DOCX, PDF, ADF).
func (t *TableData) DisplayCell(row, column int) string {
	if t == nil || row < 0 || row >= len(t.Rows) {
		return ""
	}
	value := ""
	if column >= 0 && column < len(t.Rows[row]) {
		value = t.Rows[row][column]
	}
	switch t.ColumnTypeAt(column) {
	case "checkbox":
		if TruthyTableCell(value) {
			return "☑"
		}
		return "☐"
	case "switch":
		if TruthyTableCell(value) {
			return "On"
		}
		return "Off"
	}
	return value
}

type DatabaseRelation struct {
	PageID          string `bson:"pageId" json:"pageId"`
	DatabaseBlockID string `bson:"databaseBlockId" json:"databaseBlockId"`
	Multiple        bool   `bson:"multiple,omitempty" json:"multiple,omitempty"`
}

type DatabaseRollup struct {
	RelationColumnID string `bson:"relationColumnId" json:"relationColumnId"`
	TargetColumnID   string `bson:"targetColumnId" json:"targetColumnId"`
	Function         string `bson:"function" json:"function"`
}

type DatabaseColumn struct {
	ID       string            `bson:"id" json:"id"`
	Name     string            `bson:"name" json:"name"`
	Type     string            `bson:"type" json:"type"` // text, select, status, person, date, number, relation, rollup
	Options  []string          `bson:"options,omitempty" json:"options,omitempty"`
	Width    int               `bson:"width,omitempty" json:"width,omitempty"`
	Relation *DatabaseRelation `bson:"relation,omitempty" json:"relation,omitempty"`
	Rollup   *DatabaseRollup   `bson:"rollup,omitempty" json:"rollup,omitempty"`
}

type DatabaseData struct {
	Columns  []DatabaseColumn    `bson:"columns" json:"columns"`
	Rows     []map[string]string `bson:"rows" json:"rows"`
	RowIDs   []string            `bson:"rowIds,omitempty" json:"rowIds,omitempty"`
	ViewMode string              `bson:"viewMode,omitempty" json:"viewMode,omitempty"` // table, board
	GroupBy  string              `bson:"groupBy,omitempty" json:"groupBy,omitempty"`
}

type ShareOverride struct {
	UserID string `bson:"userId" json:"userId"`
	Role   string `bson:"role" json:"role"` // editor, viewer, none
}

type FormField struct {
	ID       string   `bson:"id" json:"id"`
	Label    string   `bson:"label" json:"label"`
	Type     string   `bson:"type" json:"type"`
	Required bool     `bson:"required,omitempty" json:"required,omitempty"`
	Options  []string `bson:"options,omitempty" json:"options,omitempty"`
}

// PollOption is one choice in a poll block; Votes holds voter user IDs.
type PollOption struct {
	ID    string   `bson:"id" json:"id"`
	Text  string   `bson:"text" json:"text"`
	Votes []string `bson:"votes,omitempty" json:"votes,omitempty"`
}

// PollData backs the poll block.
type PollData struct {
	Question    string       `bson:"question" json:"question"`
	Options     []PollOption `bson:"options" json:"options"`
	Multiple    bool         `bson:"multiple,omitempty" json:"multiple,omitempty"`
	ShowResults bool         `bson:"showResults,omitempty" json:"showResults,omitempty"`
	Closed      bool         `bson:"closed,omitempty" json:"closed,omitempty"`
}

type MapData struct {
	Lat      float64 `bson:"lat" json:"lat"`
	Lng      float64 `bson:"lng" json:"lng"`
	Zoom     int     `bson:"zoom,omitempty" json:"zoom,omitempty"`
	Label    string  `bson:"label,omitempty" json:"label,omitempty"`
	Provider string  `bson:"provider,omitempty" json:"provider,omitempty"`
}

type FormData struct {
	Title       string      `bson:"title,omitempty" json:"title,omitempty"`
	Description string      `bson:"description,omitempty" json:"description,omitempty"`
	SubmitLabel string      `bson:"submitLabel,omitempty" json:"submitLabel,omitempty"`
	Fields      []FormField `bson:"fields,omitempty" json:"fields,omitempty"`
}

type LayoutColumn struct {
	Blocks []Block `bson:"blocks" json:"blocks"`
}

type LayoutData struct {
	Columns []LayoutColumn `bson:"columns" json:"columns"`
}

type InputData struct {
	Options []string `bson:"options,omitempty" json:"options,omitempty"`
	Value   string   `bson:"value,omitempty" json:"value,omitempty"`
}

type FormSubmission struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	PageID      primitive.ObjectID `bson:"pageId" json:"pageId"`
	BlockID     string             `bson:"blockId" json:"blockId"`
	WorkspaceID primitive.ObjectID `bson:"workspaceId" json:"workspaceId"`
	FormTitle   string             `bson:"formTitle" json:"formTitle"`
	Values      map[string]string  `bson:"values" json:"values"`
	SubmittedBy primitive.ObjectID `bson:"submittedBy" json:"submittedBy"`
	SubmittedAt time.Time          `bson:"submittedAt" json:"submittedAt"`
}

type Block struct {
	ID           string            `bson:"id" json:"id"`
	Type         string            `bson:"type" json:"type"`
	Text         string            `bson:"text" json:"text"`
	Rich         string            `bson:"rich,omitempty" json:"rich,omitempty"`
	Checked      bool              `bson:"checked,omitempty" json:"checked,omitempty"`
	Language     string            `bson:"language,omitempty" json:"language,omitempty"`
	Color        string            `bson:"color,omitempty" json:"color,omitempty"`
	Icon         string            `bson:"icon,omitempty" json:"icon,omitempty"`
	TextColor    string            `bson:"textColor,omitempty" json:"textColor,omitempty"`
	BGColor      string            `bson:"bgColor,omitempty" json:"bgColor,omitempty"`
	Align        string            `bson:"align,omitempty" json:"align,omitempty"`
	Width        string            `bson:"width,omitempty" json:"width,omitempty"`
	URL          string            `bson:"url,omitempty" json:"url,omitempty"`
	Caption      string            `bson:"caption,omitempty" json:"caption,omitempty"`
	Ciphertext   string            `bson:"ciphertext,omitempty" json:"ciphertext,omitempty"`
	Salt         string            `bson:"salt,omitempty" json:"salt,omitempty"`
	IV           string            `bson:"iv,omitempty" json:"iv,omitempty"`
	Table        *TableData        `bson:"table,omitempty" json:"table,omitempty"`
	Database     *DatabaseData     `bson:"database,omitempty" json:"database,omitempty"`
	Form         *FormData         `bson:"form,omitempty" json:"form,omitempty"`
	Input        *InputData        `bson:"input,omitempty" json:"input,omitempty"`
	Layout       *LayoutData       `bson:"layout,omitempty" json:"layout,omitempty"`
	Map          *MapData          `bson:"map,omitempty" json:"map,omitempty"`
	Poll         *PollData         `bson:"poll,omitempty" json:"poll,omitempty"`
	Translations map[string]string `bson:"translations,omitempty" json:"translations,omitempty"`
	LineNumbers  bool              `bson:"lineNumbers,omitempty" json:"lineNumbers,omitempty"`
	Indent       int               `bson:"indent,omitempty" json:"indent,omitempty"`
	Collapsed    bool              `bson:"collapsed,omitempty" json:"collapsed,omitempty"`
	Locked       bool              `bson:"locked,omitempty" json:"locked,omitempty"`
}

type Page struct {
	ID                 primitive.ObjectID  `bson:"_id,omitempty" json:"id"`
	WorkspaceID        primitive.ObjectID  `bson:"workspaceId" json:"workspaceId"`
	ParentID           *primitive.ObjectID `bson:"parentId,omitempty" json:"parentId,omitempty"`
	ShareOverrides     []ShareOverride     `bson:"shareOverrides,omitempty" json:"shareOverrides,omitempty"`
	Watermark          bool                `bson:"watermark,omitempty" json:"watermark,omitempty"`
	Title              string              `bson:"title" json:"title"`
	Icon               string              `bson:"icon" json:"icon"`
	Cover              string              `bson:"cover" json:"cover"`
	Theme              string              `bson:"theme,omitempty" json:"theme,omitempty"`
	Width              string              `bson:"width,omitempty" json:"width,omitempty"`
	LayoutID           string              `bson:"layoutId,omitempty" json:"layoutId,omitempty"`
	IsLayout           bool                `bson:"isLayout,omitempty" json:"isLayout,omitempty"`
	Blocks             []Block             `bson:"blocks" json:"blocks,omitempty"`
	BlocksRev          int64               `bson:"blocksRev,omitempty" json:"blocksRev,omitempty"`
	Text               string              `bson:"text" json:"-"`
	Role               string              `bson:"-" json:"role,omitempty"`
	Favorite           bool                `bson:"favorite" json:"favorite"`
	Archived           bool                `bson:"archived" json:"archived"`
	Locked             bool                `bson:"locked,omitempty" json:"locked"`
	LockedByName       string              `bson:"lockedByName,omitempty" json:"lockedByName,omitempty"`
	LockedAt           *time.Time          `bson:"lockedAt,omitempty" json:"lockedAt,omitempty"`
	Order              float64             `bson:"order" json:"order"`
	CreatedBy          primitive.ObjectID  `bson:"createdBy" json:"createdBy"`
	CreatedAt          time.Time           `bson:"createdAt" json:"createdAt"`
	UpdatedAt          time.Time           `bson:"updatedAt" json:"updatedAt"`
	ArchivedAt         *time.Time          `bson:"archivedAt,omitempty" json:"archivedAt,omitempty"`
	PublicSlug         string              `bson:"publicSlug,omitempty" json:"publicSlug,omitempty"`
	PublicPasswordHash string              `bson:"publicPasswordHash,omitempty" json:"-"`
	PublicExpiresAt    *time.Time          `bson:"publicExpiresAt,omitempty" json:"publicExpiresAt,omitempty"`
	PublicViews        int64               `bson:"publicViews,omitempty" json:"publicViews,omitempty"`
	PublicComment      bool                `bson:"publicComment,omitempty" json:"publicComment,omitempty"`
	PublicIndex        bool                `bson:"publicIndex,omitempty" json:"publicIndex,omitempty"`
}

// PageSummary is the lightweight shape used by the sidebar tree.
type PageSummary struct {
	ID              primitive.ObjectID  `bson:"_id" json:"id"`
	ParentID        *primitive.ObjectID `bson:"parentId,omitempty" json:"parentId,omitempty"`
	Title           string              `bson:"title" json:"title"`
	Icon            string              `bson:"icon" json:"icon"`
	Cover           string              `bson:"cover" json:"cover"`
	Theme           string              `bson:"theme,omitempty" json:"theme,omitempty"`
	Width           string              `bson:"width,omitempty" json:"width,omitempty"`
	LayoutID        string              `bson:"layoutId,omitempty" json:"layoutId,omitempty"`
	IsLayout        bool                `bson:"isLayout,omitempty" json:"isLayout,omitempty"`
	Favorite        bool                `bson:"favorite" json:"favorite"`
	Archived        bool                `bson:"archived" json:"archived"`
	Locked          bool                `bson:"locked,omitempty" json:"locked"`
	Order           float64             `bson:"order" json:"order"`
	UpdatedAt       time.Time           `bson:"updatedAt" json:"updatedAt"`
	PublicSlug      string              `bson:"publicSlug,omitempty" json:"publicSlug,omitempty"`
	PublicExpiresAt *time.Time          `bson:"publicExpiresAt,omitempty" json:"publicExpiresAt,omitempty"`
	PublicViews     int64               `bson:"publicViews,omitempty" json:"publicViews,omitempty"`
	PublicComment   bool                `bson:"publicComment,omitempty" json:"publicComment,omitempty"`
	PublicLocked    bool                `bson:"-" json:"publicLocked,omitempty"`
	Text            string              `bson:"text,omitempty" json:"-"`
	Snippet         string              `bson:"-" json:"snippet,omitempty"`
}

type APIToken struct {
	ID         primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID     primitive.ObjectID `bson:"userId" json:"userId"`
	Name       string             `bson:"name" json:"name"`
	Prefix     string             `bson:"prefix" json:"prefix"`
	Hash       string             `bson:"hash" json:"-"`
	Scopes     []string           `bson:"scopes" json:"scopes"`
	ExpiresAt  *time.Time         `bson:"expiresAt,omitempty" json:"expiresAt,omitempty"`
	LastUsedAt *time.Time         `bson:"lastUsedAt,omitempty" json:"lastUsedAt,omitempty"`
	CreatedAt  time.Time          `bson:"createdAt" json:"createdAt"`
}

type PageRevision struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	PageID      primitive.ObjectID `bson:"pageId" json:"pageId"`
	WorkspaceID primitive.ObjectID `bson:"workspaceId" json:"workspaceId"`
	Title       string             `bson:"title" json:"title"`
	Icon        string             `bson:"icon" json:"icon"`
	Cover       string             `bson:"cover" json:"cover"`
	Blocks      []Block            `bson:"blocks" json:"blocks"`
	AuthorID    primitive.ObjectID `bson:"authorId" json:"authorId"`
	AuthorName  string             `bson:"authorName" json:"authorName"`
	CreatedAt   time.Time          `bson:"createdAt" json:"createdAt"`
}

type CommentAnnotation struct {
	X      float64 `bson:"x" json:"x"`
	Y      float64 `bson:"y" json:"y"`
	Width  float64 `bson:"width" json:"width"`
	Height float64 `bson:"height" json:"height"`
}

type Comment struct {
	ID          primitive.ObjectID  `bson:"_id,omitempty" json:"id"`
	PageID      primitive.ObjectID  `bson:"pageId" json:"pageId"`
	WorkspaceID primitive.ObjectID  `bson:"workspaceId" json:"workspaceId"`
	BlockID     string              `bson:"blockId" json:"blockId"`
	Quote       string              `bson:"quote" json:"quote"`
	StartOffset int                 `bson:"startOffset" json:"startOffset"`
	EndOffset   int                 `bson:"endOffset" json:"endOffset"`
	Annotation  *CommentAnnotation  `bson:"annotation,omitempty" json:"annotation,omitempty"`
	Body        string              `bson:"body" json:"body"`
	AuthorID    primitive.ObjectID  `bson:"authorId" json:"authorId"`
	AuthorName  string              `bson:"authorName" json:"authorName"`
	ParentID    *primitive.ObjectID `bson:"parentId,omitempty" json:"parentId,omitempty"`
	Mentions    []string            `bson:"mentions,omitempty" json:"mentions,omitempty"`
	Public      bool                `bson:"public,omitempty" json:"public,omitempty"`
	Resolved    bool                `bson:"resolved" json:"resolved"`
	CreatedAt   time.Time           `bson:"createdAt" json:"createdAt"`
	UpdatedAt   time.Time           `bson:"updatedAt" json:"updatedAt"`
}

type AIProviderConfig struct {
	Provider  string    `bson:"provider" json:"provider"`
	Model     string    `bson:"model" json:"model"`
	BaseURL   string    `bson:"baseUrl,omitempty" json:"baseUrl,omitempty"`
	KeyCipher string    `bson:"keyCipher,omitempty" json:"-"`
	KeyHint   string    `bson:"keyHint,omitempty" json:"keyHint,omitempty"`
	UpdatedAt time.Time `bson:"updatedAt" json:"updatedAt"`
}

type AISetting struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID    primitive.ObjectID `bson:"userId" json:"userId"`
	Provider  string             `bson:"provider" json:"provider"`
	Model     string             `bson:"model" json:"model"`
	BaseURL   string             `bson:"baseUrl,omitempty" json:"baseUrl,omitempty"`
	KeyCipher string             `bson:"keyCipher" json:"-"`
	KeyHint   string             `bson:"keyHint" json:"keyHint"`
	Configs   []AIProviderConfig `bson:"configs,omitempty" json:"-"`
	UpdatedAt time.Time          `bson:"updatedAt" json:"updatedAt"`
	CreatedAt time.Time          `bson:"createdAt" json:"createdAt"`
}

type Integration struct {
	ID           primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	WorkspaceID  primitive.ObjectID `bson:"workspaceId" json:"workspaceId"`
	Provider     string             `bson:"provider" json:"provider"`
	Config       map[string]string  `bson:"config" json:"config"`
	Events       []string           `bson:"events,omitempty" json:"events,omitempty"`
	Disabled     bool               `bson:"disabled,omitempty" json:"-"`
	SecretCipher string             `bson:"secretCipher,omitempty" json:"-"`
	SecretHint   string             `bson:"secretHint,omitempty" json:"secretHint,omitempty"`
	CreatedBy    primitive.ObjectID `bson:"createdBy" json:"createdBy"`
	CreatedAt    time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt    time.Time          `bson:"updatedAt" json:"updatedAt"`
}

type PublishGroup struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	WorkspaceID primitive.ObjectID `bson:"workspaceId" json:"workspaceId"`
	Name        string             `bson:"name" json:"name"`
	Targets     []string           `bson:"targets" json:"targets"`
	CreatedAt   time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt   time.Time          `bson:"updatedAt" json:"updatedAt"`
}

type WebhookDelivery struct {
	ID            primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	WorkspaceID   primitive.ObjectID `bson:"workspaceId" json:"workspaceId"`
	IntegrationID primitive.ObjectID `bson:"integrationId" json:"integrationId"`
	Event         string             `bson:"event" json:"event"`
	URL           string             `bson:"url" json:"url"`
	Payload       []byte             `bson:"payload,omitempty" json:"-"`
	Status        string             `bson:"status" json:"status"`
	Attempts      int                `bson:"attempts" json:"attempts"`
	ResponseCode  int                `bson:"responseCode,omitempty" json:"responseCode,omitempty"`
	Error         string             `bson:"error,omitempty" json:"error,omitempty"`
	CreatedAt     time.Time          `bson:"createdAt" json:"createdAt"`
	DeliveredAt   *time.Time         `bson:"deliveredAt,omitempty" json:"deliveredAt,omitempty"`
}

type Agent struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	WorkspaceID primitive.ObjectID `bson:"workspaceId" json:"workspaceId"`
	OwnerID     primitive.ObjectID `bson:"ownerId" json:"ownerId"`
	Name        string             `bson:"name" json:"name"`
	Icon        string             `bson:"icon" json:"icon"`
	Description string             `bson:"description,omitempty" json:"description,omitempty"`
	Mode        string             `bson:"mode" json:"mode"` // auto, approval
	Scopes      []string           `bson:"scopes" json:"scopes"`
	Enabled     bool               `bson:"enabled" json:"enabled"`
	IsDefault   bool               `bson:"isDefault,omitempty" json:"isDefault,omitempty"`
	Schedule    *AgentSchedule     `bson:"schedule,omitempty" json:"schedule,omitempty"`
	CreatedAt   time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt   time.Time          `bson:"updatedAt" json:"updatedAt"`
}

// AgentRun records one agent task execution (manual dispatch or scheduled).
type AgentRun struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	WorkspaceID primitive.ObjectID `bson:"workspaceId" json:"workspaceId"`
	AgentID     primitive.ObjectID `bson:"agentId" json:"agentId"`
	AgentName   string             `bson:"agentName" json:"agentName"`
	ActorID     primitive.ObjectID `bson:"actorId" json:"actorId"`
	ActorName   string             `bson:"actorName" json:"actorName"`
	Prompt      string             `bson:"prompt" json:"prompt"`
	PageID      string             `bson:"pageId,omitempty" json:"pageId,omitempty"`
	Scheduled   bool               `bson:"scheduled,omitempty" json:"scheduled,omitempty"`
	Status      string             `bson:"status" json:"status"` // queued, running, succeeded, failed
	ProposalIDs []string           `bson:"proposalIds,omitempty" json:"proposalIds,omitempty"`
	Actions     int                `bson:"actions,omitempty" json:"actions,omitempty"`
	Tokens      int64              `bson:"tokens,omitempty" json:"tokens,omitempty"`
	Error       string             `bson:"error,omitempty" json:"error,omitempty"`
	CreatedAt   time.Time          `bson:"createdAt" json:"createdAt"`
	StartedAt   *time.Time         `bson:"startedAt,omitempty" json:"startedAt,omitempty"`
	FinishedAt  *time.Time         `bson:"finishedAt,omitempty" json:"finishedAt,omitempty"`
}

// AgentSchedule runs an agent task periodically. NextRun is maintained by the server.
type AgentSchedule struct {
	Enabled      bool       `bson:"enabled" json:"enabled"`
	EveryHours   int        `bson:"everyHours" json:"everyHours"`
	Prompt       string     `bson:"prompt" json:"prompt"`
	PageID       string     `bson:"pageId,omitempty" json:"pageId,omitempty"`
	NextRun      *time.Time `bson:"nextRun,omitempty" json:"nextRun,omitempty"`
	LastRun      *time.Time `bson:"lastRun,omitempty" json:"lastRun,omitempty"`
	LastRunError string     `bson:"lastRunError,omitempty" json:"lastRunError,omitempty"`
}

type AIProposal struct {
	ID           primitive.ObjectID  `bson:"_id,omitempty" json:"id"`
	WorkspaceID  primitive.ObjectID  `bson:"workspaceId" json:"workspaceId"`
	PageID       primitive.ObjectID  `bson:"pageId" json:"pageId"`
	AgentID      primitive.ObjectID  `bson:"agentId" json:"agentId"`
	AgentName    string              `bson:"agentName" json:"agentName"`
	ActorID      primitive.ObjectID  `bson:"actorId" json:"actorId"`
	ActorName    string              `bson:"actorName" json:"actorName"`
	PageTitle    string              `bson:"pageTitle" json:"pageTitle"`
	Prompt       string              `bson:"prompt,omitempty" json:"prompt,omitempty"`
	RejectReason string              `bson:"rejectReason,omitempty" json:"rejectReason,omitempty"`
	Before       *Page               `bson:"before,omitempty" json:"before,omitempty"`
	After        Page                `bson:"after" json:"after"`
	Created      bool                `bson:"created,omitempty" json:"created,omitempty"`
	Status       string              `bson:"status" json:"status"` // pending, approved, rejected
	CreatedAt    time.Time           `bson:"createdAt" json:"createdAt"`
	ReviewedAt   *time.Time          `bson:"reviewedAt,omitempty" json:"reviewedAt,omitempty"`
	ReviewedBy   *primitive.ObjectID `bson:"reviewedBy,omitempty" json:"reviewedBy,omitempty"`
}

// Notification is an in-app inbox message (@mention, comment reply, ...).
type Notification struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID      primitive.ObjectID `bson:"userId" json:"-"`
	WorkspaceID primitive.ObjectID `bson:"workspaceId" json:"workspaceId"`
	ActorID     primitive.ObjectID `bson:"actorId,omitempty" json:"actorId,omitempty"`
	ActorName   string             `bson:"actorName" json:"actorName"`
	Type        string             `bson:"type" json:"type"` // mention, comment_reply
	Title       string             `bson:"title" json:"title"`
	Body        string             `bson:"body,omitempty" json:"body,omitempty"`
	PageID      string             `bson:"pageId,omitempty" json:"pageId,omitempty"`
	BlockID     string             `bson:"blockId,omitempty" json:"blockId,omitempty"`
	CommentID   string             `bson:"commentId,omitempty" json:"commentId,omitempty"`
	Read        bool               `bson:"read" json:"read"`
	CreatedAt   time.Time          `bson:"createdAt" json:"createdAt"`
	ReadAt      *time.Time         `bson:"readAt,omitempty" json:"readAt,omitempty"`
}

type AuditLog struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	WorkspaceID primitive.ObjectID `bson:"workspaceId" json:"workspaceId"`
	ActorID     primitive.ObjectID `bson:"actorId,omitempty" json:"actorId,omitempty"`
	ActorName   string             `bson:"actorName" json:"actorName"`
	AgentID     primitive.ObjectID `bson:"agentId,omitempty" json:"agentId,omitempty"`
	AgentName   string             `bson:"agentName,omitempty" json:"agentName,omitempty"`
	Action      string             `bson:"action" json:"action"`
	TargetType  string             `bson:"targetType,omitempty" json:"targetType,omitempty"`
	TargetID    string             `bson:"targetId,omitempty" json:"targetId,omitempty"`
	Summary     string             `bson:"summary" json:"summary"`
	CreatedAt   time.Time          `bson:"createdAt" json:"createdAt"`
}

type AIUsage struct {
	ID               string             `bson:"_id" json:"-"`
	UserID           primitive.ObjectID `bson:"userId" json:"userId"`
	Day              string             `bson:"day" json:"day"`
	PromptTokens     int64              `bson:"promptTokens" json:"promptTokens"`
	CompletionTokens int64              `bson:"completionTokens" json:"completionTokens"`
	TotalTokens      int64              `bson:"totalTokens" json:"totalTokens"`
	UpdatedAt        time.Time          `bson:"updatedAt" json:"updatedAt"`
}
