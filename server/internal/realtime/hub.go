package realtime

import (
	"encoding/json"
	"sort"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

var palette = []string{"#7c5cff", "#0ea5e9", "#10b981", "#f59e0b", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316"}

func ColorFor(userID string) string {
	sum := 0
	for _, char := range userID {
		sum = (sum*31 + int(char)) & 0x7fffffff
	}
	return palette[sum%len(palette)]
}

type PresenceUser struct {
	UserID   string `json:"userId"`
	ClientID string `json:"clientId"`
	Name     string `json:"name"`
	Color    string `json:"color"`
	BlockID  string `json:"blockId,omitempty"`
}

type Client struct {
	Hub         *Hub
	Conn        *websocket.Conn
	Send        chan []byte
	Done        chan struct{}
	closeOnce   sync.Once
	PageID      string
	WorkspaceID string
	ClientID    string
	UserID      string
	Name        string
	Color       string

	focusMu sync.RWMutex
	focus   string
}

func (c *Client) SetFocus(blockID string) {
	c.focusMu.Lock()
	c.focus = blockID
	c.focusMu.Unlock()
}

func (c *Client) Focus() string {
	c.focusMu.RLock()
	defer c.focusMu.RUnlock()
	return c.focus
}

func (c *Client) Close() {
	c.closeOnce.Do(func() {
		close(c.Done)
		_ = c.Conn.Close()
	})
}

type Hub struct {
	mu         sync.RWMutex
	pages      map[string]map[*Client]struct{}
	workspaces map[string]map[*Client]struct{}
}

func NewHub() *Hub {
	return &Hub{
		pages:      make(map[string]map[*Client]struct{}),
		workspaces: make(map[string]map[*Client]struct{}),
	}
}

func (h *Hub) Add(client *Client) {
	h.mu.Lock()
	if h.pages[client.PageID] == nil {
		h.pages[client.PageID] = make(map[*Client]struct{})
	}
	h.pages[client.PageID][client] = struct{}{}
	if client.WorkspaceID != "" {
		if h.workspaces[client.WorkspaceID] == nil {
			h.workspaces[client.WorkspaceID] = make(map[*Client]struct{})
		}
		h.workspaces[client.WorkspaceID][client] = struct{}{}
	}
	h.mu.Unlock()
	h.BroadcastPresence(client.PageID)
}

func (h *Hub) Remove(client *Client) {
	h.mu.Lock()
	removed := false
	if clients, ok := h.pages[client.PageID]; ok {
		if _, exists := clients[client]; exists {
			delete(clients, client)
			removed = true
		}
		if len(clients) == 0 {
			delete(h.pages, client.PageID)
		}
	}
	if client.WorkspaceID != "" {
		if clients, ok := h.workspaces[client.WorkspaceID]; ok {
			delete(clients, client)
			if len(clients) == 0 {
				delete(h.workspaces, client.WorkspaceID)
			}
		}
	}
	h.mu.Unlock()
	client.Close()
	if removed {
		h.BroadcastPresence(client.PageID)
	}
}

func (h *Hub) Presence(pageID string) []PresenceUser {
	h.mu.RLock()
	defer h.mu.RUnlock()
	users := make([]PresenceUser, 0, len(h.pages[pageID]))
	for client := range h.pages[pageID] {
		users = append(users, PresenceUser{
			UserID: client.UserID, ClientID: client.ClientID, Name: client.Name,
			Color: client.Color, BlockID: client.Focus(),
		})
	}
	sort.Slice(users, func(i, j int) bool { return users[i].Name < users[j].Name })
	return users
}

func (h *Hub) BroadcastPresence(pageID string) {
	h.Broadcast(pageID, map[string]any{"type": "presence", "users": h.Presence(pageID)}, "")
}

func (h *Hub) Broadcast(pageID string, payload any, excludeClientID string) {
	data, err := json.Marshal(payload)
	if err != nil {
		return
	}
	h.mu.RLock()
	clients := make([]*Client, 0, len(h.pages[pageID]))
	for client := range h.pages[pageID] {
		if excludeClientID != "" && client.ClientID == excludeClientID {
			continue
		}
		clients = append(clients, client)
	}
	h.mu.RUnlock()
	for _, client := range clients {
		select {
		case client.Send <- data:
		default:
		}
	}
}

func (h *Hub) BroadcastWorkspace(workspaceID string, payload any, excludeClientID string) {
	data, err := json.Marshal(payload)
	if err != nil {
		return
	}
	h.mu.RLock()
	clients := make([]*Client, 0, len(h.workspaces[workspaceID]))
	for client := range h.workspaces[workspaceID] {
		if excludeClientID != "" && client.ClientID == excludeClientID {
			continue
		}
		clients = append(clients, client)
	}
	h.mu.RUnlock()
	for _, client := range clients {
		select {
		case client.Send <- data:
		default:
		}
	}
}

func (c *Client) WritePump() {
	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()
	for {
		select {
		case <-c.Done:
			return
		case message := <-c.Send:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.Conn.WriteMessage(websocket.TextMessage, message); err != nil {
				c.Hub.Remove(c)
				return
			}
		case <-ticker.C:
			_ = c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				c.Hub.Remove(c)
				return
			}
		}
	}
}

type inboundMessage struct {
	Type    string `json:"type"`
	BlockID string `json:"blockId"`
}

func (c *Client) ReadPump() {
	defer c.Hub.Remove(c)
	c.Conn.SetReadLimit(8 << 10)
	_ = c.Conn.SetReadDeadline(time.Now().Add(70 * time.Second))
	c.Conn.SetPongHandler(func(string) error {
		return c.Conn.SetReadDeadline(time.Now().Add(70 * time.Second))
	})
	for {
		var message inboundMessage
		if err := c.Conn.ReadJSON(&message); err != nil {
			return
		}
		_ = c.Conn.SetReadDeadline(time.Now().Add(70 * time.Second))
		switch message.Type {
		case "focus":
			c.SetFocus(message.BlockID)
			c.Hub.BroadcastPresence(c.PageID)
		}
	}
}
