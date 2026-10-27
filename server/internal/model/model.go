package model

import (
	"time"

	"go.mongodb.org/mongo-driver/bson/primitive"
)

type User struct {
	ID          primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Name        string             `bson:"name" json:"name"`
	Email       string             `bson:"email" json:"email"`
	Password    string             `bson:"password" json:"-"`
	OIDCIssuer  string             `bson:"oidcIssuer,omitempty" json:"-"`
	OIDCSubject string             `bson:"oidcSubject,omitempty" json:"-"`
	IsAdmin     bool               `bson:"isAdmin,omitempty" json:"isAdmin"`
	CreatedAt   time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt   time.Time          `bson:"updatedAt" json:"updatedAt"`
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
	ID         primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Name       string             `bson:"name" json:"name"`
	Icon       string             `bson:"icon" json:"icon"`
	OwnerID    primitive.ObjectID `bson:"ownerId" json:"ownerId"`
	Members    []Member           `bson:"members,omitempty" json:"members,omitempty"`
	Skills     []WorkspaceSkill   `bson:"skills,omitempty" json:"skills,omitempty"`
	MCPServers []WorkspaceMCP     `bson:"mcpServers,omitempty" json:"mcpServers,omitempty"`
	CreatedAt  time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt  time.Time          `bson:"updatedAt" json:"updatedAt"`
}

// Block is a single unit of page content. Content is stored as plain text;
// inline styles and block-level options live in the meta fields.
type TableData struct {
	Columns []string   `bson:"columns" json:"columns"`
	Rows    [][]string `bson:"rows" json:"rows"`
	Header  bool       `bson:"header" json:"header"`
	Widths  []int      `bson:"widths,omitempty" json:"widths,omitempty"`
	Align   []string   `bson:"align,omitempty" json:"align,omitempty"`
}

type FormField struct {
	ID       string   `bson:"id" json:"id"`
	Label    string   `bson:"label" json:"label"`
	Type     string   `bson:"type" json:"type"`
	Required bool     `bson:"required,omitempty" json:"required,omitempty"`
	Options  []string `bson:"options,omitempty" json:"options,omitempty"`
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
	ID          string     `bson:"id" json:"id"`
	Type        string     `bson:"type" json:"type"`
	Text        string     `bson:"text" json:"text"`
	Rich        string     `bson:"rich,omitempty" json:"rich,omitempty"`
	Checked     bool       `bson:"checked,omitempty" json:"checked,omitempty"`
	Language    string     `bson:"language,omitempty" json:"language,omitempty"`
	Color       string     `bson:"color,omitempty" json:"color,omitempty"`
	TextColor   string     `bson:"textColor,omitempty" json:"textColor,omitempty"`
	BGColor     string     `bson:"bgColor,omitempty" json:"bgColor,omitempty"`
	Align       string     `bson:"align,omitempty" json:"align,omitempty"`
	Width       string     `bson:"width,omitempty" json:"width,omitempty"`
	URL         string     `bson:"url,omitempty" json:"url,omitempty"`
	Caption     string     `bson:"caption,omitempty" json:"caption,omitempty"`
	Ciphertext  string     `bson:"ciphertext,omitempty" json:"ciphertext,omitempty"`
	Salt        string     `bson:"salt,omitempty" json:"salt,omitempty"`
	IV          string     `bson:"iv,omitempty" json:"iv,omitempty"`
	Table       *TableData `bson:"table,omitempty" json:"table,omitempty"`
	Form        *FormData  `bson:"form,omitempty" json:"form,omitempty"`
	Map         *MapData   `bson:"map,omitempty" json:"map,omitempty"`
	LineNumbers bool       `bson:"lineNumbers,omitempty" json:"lineNumbers,omitempty"`
	Indent      int        `bson:"indent,omitempty" json:"indent,omitempty"`
	Collapsed   bool       `bson:"collapsed,omitempty" json:"collapsed,omitempty"`
	Locked      bool       `bson:"locked,omitempty" json:"locked,omitempty"`
}

type Page struct {
	ID           primitive.ObjectID  `bson:"_id,omitempty" json:"id"`
	WorkspaceID  primitive.ObjectID  `bson:"workspaceId" json:"workspaceId"`
	ParentID     *primitive.ObjectID `bson:"parentId,omitempty" json:"parentId,omitempty"`
	Title        string              `bson:"title" json:"title"`
	Icon         string              `bson:"icon" json:"icon"`
	Cover        string              `bson:"cover" json:"cover"`
	Theme        string              `bson:"theme,omitempty" json:"theme,omitempty"`
	LayoutID     string              `bson:"layoutId,omitempty" json:"layoutId,omitempty"`
	IsLayout     bool                `bson:"isLayout,omitempty" json:"isLayout,omitempty"`
	Blocks       []Block             `bson:"blocks" json:"blocks,omitempty"`
	BlocksRev    int64               `bson:"blocksRev,omitempty" json:"blocksRev,omitempty"`
	Text         string              `bson:"text" json:"-"`
	Role         string              `bson:"-" json:"role,omitempty"`
	Favorite     bool                `bson:"favorite" json:"favorite"`
	Archived     bool                `bson:"archived" json:"archived"`
	Locked       bool                `bson:"locked,omitempty" json:"locked"`
	LockedByName string              `bson:"lockedByName,omitempty" json:"lockedByName,omitempty"`
	LockedAt     *time.Time          `bson:"lockedAt,omitempty" json:"lockedAt,omitempty"`
	Order        float64             `bson:"order" json:"order"`
	CreatedBy    primitive.ObjectID  `bson:"createdBy" json:"createdBy"`
	CreatedAt    time.Time           `bson:"createdAt" json:"createdAt"`
	UpdatedAt    time.Time           `bson:"updatedAt" json:"updatedAt"`
	ArchivedAt   *time.Time          `bson:"archivedAt,omitempty" json:"archivedAt,omitempty"`
}

// PageSummary is the lightweight shape used by the sidebar tree.
type PageSummary struct {
	ID        primitive.ObjectID  `bson:"_id" json:"id"`
	ParentID  *primitive.ObjectID `bson:"parentId,omitempty" json:"parentId,omitempty"`
	Title     string              `bson:"title" json:"title"`
	Icon      string              `bson:"icon" json:"icon"`
	Cover     string              `bson:"cover" json:"cover"`
	Theme     string              `bson:"theme,omitempty" json:"theme,omitempty"`
	LayoutID  string              `bson:"layoutId,omitempty" json:"layoutId,omitempty"`
	IsLayout  bool                `bson:"isLayout,omitempty" json:"isLayout,omitempty"`
	Favorite  bool                `bson:"favorite" json:"favorite"`
	Archived  bool                `bson:"archived" json:"archived"`
	Locked    bool                `bson:"locked,omitempty" json:"locked"`
	Order     float64             `bson:"order" json:"order"`
	UpdatedAt time.Time           `bson:"updatedAt" json:"updatedAt"`
	Text      string              `bson:"text,omitempty" json:"-"`
	Snippet   string              `bson:"-" json:"snippet,omitempty"`
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
	Resolved    bool                `bson:"resolved" json:"resolved"`
	CreatedAt   time.Time           `bson:"createdAt" json:"createdAt"`
	UpdatedAt   time.Time           `bson:"updatedAt" json:"updatedAt"`
}

type AISetting struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	UserID    primitive.ObjectID `bson:"userId" json:"userId"`
	Provider  string             `bson:"provider" json:"provider"`
	Model     string             `bson:"model" json:"model"`
	BaseURL   string             `bson:"baseUrl,omitempty" json:"baseUrl,omitempty"`
	KeyCipher string             `bson:"keyCipher" json:"-"`
	KeyHint   string             `bson:"keyHint" json:"keyHint"`
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
	CreatedAt   time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt   time.Time          `bson:"updatedAt" json:"updatedAt"`
}

type AIProposal struct {
	ID          primitive.ObjectID  `bson:"_id,omitempty" json:"id"`
	WorkspaceID primitive.ObjectID  `bson:"workspaceId" json:"workspaceId"`
	PageID      primitive.ObjectID  `bson:"pageId" json:"pageId"`
	AgentID     primitive.ObjectID  `bson:"agentId" json:"agentId"`
	AgentName   string              `bson:"agentName" json:"agentName"`
	ActorID     primitive.ObjectID  `bson:"actorId" json:"actorId"`
	ActorName   string              `bson:"actorName" json:"actorName"`
	PageTitle   string              `bson:"pageTitle" json:"pageTitle"`
	Before      *Page               `bson:"before,omitempty" json:"before,omitempty"`
	After       Page                `bson:"after" json:"after"`
	Created     bool                `bson:"created,omitempty" json:"created,omitempty"`
	Status      string              `bson:"status" json:"status"` // pending, approved, rejected
	CreatedAt   time.Time           `bson:"createdAt" json:"createdAt"`
	ReviewedAt  *time.Time          `bson:"reviewedAt,omitempty" json:"reviewedAt,omitempty"`
	ReviewedBy  *primitive.ObjectID `bson:"reviewedBy,omitempty" json:"reviewedBy,omitempty"`
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
