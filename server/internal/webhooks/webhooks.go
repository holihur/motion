package webhooks

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"

	"github.com/motion/server/internal/model"
	"github.com/motion/server/internal/secret"
	"github.com/motion/server/internal/store"
)

type Service struct {
	store  *store.Store
	client *http.Client
	key    string
}

func New(st *store.Store, encryptionKey string) *Service {
	return &Service{
		store:  st,
		key:    encryptionKey,
		client: &http.Client{Timeout: 12 * time.Second},
	}
}

type envelope struct {
	Event       string         `json:"event"`
	WorkspaceID string         `json:"workspaceId"`
	CreatedAt   time.Time      `json:"createdAt"`
	Data        map[string]any `json:"data"`
}

// Emit queues an event for the workspace webhook, if one is configured.
// Delivery happens asynchronously and is recorded in webhook_deliveries.
func (s *Service) Emit(ctx context.Context, workspaceID primitive.ObjectID, event string, data map[string]any) {
	var integration model.Integration
	if err := s.store.Integrations.FindOne(ctx, bson.M{
		"workspaceId": workspaceID, "provider": "webhook", "disabled": bson.M{"$ne": true},
	}).Decode(&integration); err != nil {
		return
	}
	if !wantsEvent(integration.Events, event) {
		return
	}
	payload, err := json.Marshal(envelope{
		Event: event, WorkspaceID: workspaceID.Hex(), CreatedAt: time.Now().UTC(), Data: data,
	})
	if err != nil {
		return
	}
	delivery := model.WebhookDelivery{
		ID: primitive.NewObjectID(), WorkspaceID: workspaceID, IntegrationID: integration.ID,
		Event: event, URL: integration.Config["url"], Status: "pending", CreatedAt: time.Now().UTC(),
	}
	if _, err := s.store.Deliveries.InsertOne(ctx, delivery); err != nil {
		return
	}
	go s.deliver(delivery, integration, payload)
}

func wantsEvent(events []string, event string) bool {
	if len(events) == 0 {
		return true
	}
	for _, item := range events {
		if item == "*" || item == event {
			return true
		}
		if strings.HasSuffix(item, ".*") && strings.HasPrefix(event, strings.TrimSuffix(item, "*")) {
			return true
		}
	}
	return false
}

func (s *Service) deliver(delivery model.WebhookDelivery, integration model.Integration, payload []byte) {
	ctx, cancel := context.WithTimeout(context.Background(), 45*time.Second)
	defer cancel()
	signingKey := ""
	if integration.SecretCipher != "" {
		if value, err := secret.Decrypt(s.key, integration.SecretCipher); err == nil {
			signingKey = value
		}
	}
	var lastErr string
	code := 0
	for attempt := 1; attempt <= 3; attempt++ {
		request, err := http.NewRequestWithContext(ctx, http.MethodPost, integration.Config["url"], bytes.NewReader(payload))
		if err == nil {
			request.Header.Set("Content-Type", "application/json")
			request.Header.Set("User-Agent", "Motion-Webhook/1.0")
			request.Header.Set("X-Motion-Event", delivery.Event)
			request.Header.Set("X-Motion-Delivery", delivery.ID.Hex())
			if signingKey != "" {
				mac := hmac.New(sha256.New, []byte(signingKey))
				_, _ = mac.Write(payload)
				request.Header.Set("X-Motion-Signature", "sha256="+hex.EncodeToString(mac.Sum(nil)))
			}
			response, err := s.client.Do(request)
			if err != nil {
				lastErr = err.Error()
			} else {
				code = response.StatusCode
				body, _ := io.ReadAll(io.LimitReader(response.Body, 512))
				_ = response.Body.Close()
				if response.StatusCode >= 200 && response.StatusCode < 300 {
					now := time.Now().UTC()
					_, _ = s.store.Deliveries.UpdateByID(ctx, delivery.ID, bson.M{"$set": bson.M{
						"status": "delivered", "attempts": attempt, "responseCode": code,
						"error": "", "deliveredAt": now,
					}})
					return
				}
				lastErr = fmt.Sprintf("HTTP %d: %s", code, strings.TrimSpace(string(body)))
			}
		} else {
			lastErr = err.Error()
		}
		if attempt < 3 {
			select {
			case <-ctx.Done():
			case <-time.After(time.Duration(attempt) * time.Second):
			}
		}
	}
	_, _ = s.store.Deliveries.UpdateByID(ctx, delivery.ID, bson.M{"$set": bson.M{
		"status": "failed", "attempts": 3, "responseCode": code, "error": lastErr,
	}})
}

// Test sends a signed webhook.test event and reports the HTTP status.
func (s *Service) Test(ctx context.Context, integration model.Integration) error {
	payload, _ := json.Marshal(envelope{Event: "webhook.test", CreatedAt: time.Now().UTC(), Data: map[string]any{"message": "Motion webhook test"}})
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, integration.Config["url"], bytes.NewReader(payload))
	if err != nil {
		return err
	}
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("User-Agent", "Motion-Webhook/1.0")
	request.Header.Set("X-Motion-Event", "webhook.test")
	if integration.SecretCipher != "" {
		if key, err := secret.Decrypt(s.key, integration.SecretCipher); err == nil {
			mac := hmac.New(sha256.New, []byte(key))
			_, _ = mac.Write(payload)
			request.Header.Set("X-Motion-Signature", "sha256="+hex.EncodeToString(mac.Sum(nil)))
		}
	}
	response, err := s.client.Do(request)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(response.Body, 256))
		return fmt.Errorf("webhook returned HTTP %d: %s", response.StatusCode, strings.TrimSpace(string(body)))
	}
	return nil
}
