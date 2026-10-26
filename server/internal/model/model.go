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

type Workspace struct {
	ID        primitive.ObjectID `bson:"_id,omitempty" json:"id"`
	Name      string             `bson:"name" json:"name"`
	Icon      string             `bson:"icon" json:"icon"`
	OwnerID   primitive.ObjectID `bson:"ownerId" json:"ownerId"`
	Members   []Member           `bson:"members,omitempty" json:"members,omitempty"`
	CreatedAt time.Time          `bson:"createdAt" json:"createdAt"`
	UpdatedAt time.Time          `bson:"updatedAt" json:"updatedAt"`
}

// Block is a single unit of page content. Content is stored as plain text;
// inline styles and block-level options live in the meta fields.
type TableData struct {
	Columns []string   `bson:"columns" json:"columns"`
	Rows    [][]string `bson:"rows" json:"rows"`
	Header  bool       `bson:"header" json:"header"`
}

type Block struct {
	ID       string     `bson:"id" json:"id"`
	Type     string     `bson:"type" json:"type"`
	Text     string     `bson:"text" json:"text"`
	Checked  bool       `bson:"checked,omitempty" json:"checked,omitempty"`
	Language string     `bson:"language,omitempty" json:"language,omitempty"`
	Color    string     `bson:"color,omitempty" json:"color,omitempty"`
	URL      string     `bson:"url,omitempty" json:"url,omitempty"`
	Caption  string     `bson:"caption,omitempty" json:"caption,omitempty"`
	Table    *TableData `bson:"table,omitempty" json:"table,omitempty"`
}

type Page struct {
	ID          primitive.ObjectID  `bson:"_id,omitempty" json:"id"`
	WorkspaceID primitive.ObjectID  `bson:"workspaceId" json:"workspaceId"`
	ParentID    *primitive.ObjectID `bson:"parentId,omitempty" json:"parentId,omitempty"`
	Title       string              `bson:"title" json:"title"`
	Icon        string              `bson:"icon" json:"icon"`
	Cover       string              `bson:"cover" json:"cover"`
	Blocks      []Block             `bson:"blocks" json:"blocks,omitempty"`
	Text        string              `bson:"text" json:"-"`
	Favorite    bool                `bson:"favorite" json:"favorite"`
	Archived    bool                `bson:"archived" json:"archived"`
	Order       float64             `bson:"order" json:"order"`
	CreatedBy   primitive.ObjectID  `bson:"createdBy" json:"createdBy"`
	CreatedAt   time.Time           `bson:"createdAt" json:"createdAt"`
	UpdatedAt   time.Time           `bson:"updatedAt" json:"updatedAt"`
	ArchivedAt  *time.Time          `bson:"archivedAt,omitempty" json:"archivedAt,omitempty"`
}

// PageSummary is the lightweight shape used by the sidebar tree.
type PageSummary struct {
	ID        primitive.ObjectID  `bson:"_id" json:"id"`
	ParentID  *primitive.ObjectID `bson:"parentId,omitempty" json:"parentId,omitempty"`
	Title     string              `bson:"title" json:"title"`
	Icon      string              `bson:"icon" json:"icon"`
	Cover     string              `bson:"cover" json:"cover"`
	Favorite  bool                `bson:"favorite" json:"favorite"`
	Archived  bool                `bson:"archived" json:"archived"`
	Order     float64             `bson:"order" json:"order"`
	UpdatedAt time.Time           `bson:"updatedAt" json:"updatedAt"`
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

type Comment struct {
	ID          primitive.ObjectID  `bson:"_id,omitempty" json:"id"`
	PageID      primitive.ObjectID  `bson:"pageId" json:"pageId"`
	WorkspaceID primitive.ObjectID  `bson:"workspaceId" json:"workspaceId"`
	BlockID     string              `bson:"blockId" json:"blockId"`
	Quote       string              `bson:"quote" json:"quote"`
	StartOffset int                 `bson:"startOffset" json:"startOffset"`
	EndOffset   int                 `bson:"endOffset" json:"endOffset"`
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
