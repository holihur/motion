package httpapi

import (
	"context"
	"log/slog"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"
)

// StartTrashRetention removes old archived leaves when the owner enables a
// retention window. A zero value keeps trash forever (the historical default).
func (s *Server) StartTrashRetention(ctx context.Context) {
	go func() {
		s.purgeExpiredTrash(ctx)
		ticker := time.NewTicker(6 * time.Hour)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				s.purgeExpiredTrash(ctx)
			}
		}
	}()
}

func (s *Server) purgeExpiredTrash(ctx context.Context) {
	days := s.siteSnapshot().TrashRetentionDays
	if days <= 0 {
		return
	}
	cutoff := time.Now().UTC().AddDate(0, 0, -days)
	opCtx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()
	cur, err := s.store.Pages.Find(opCtx,
		bson.M{"archived": true, "archivedAt": bson.M{"$ne": nil, "$lt": cutoff}},
		options.Find().SetProjection(bson.M{"_id": 1}).SetLimit(200))
	if err != nil {
		slog.Warn("trash retention scan failed", "error", err)
		return
	}
	var pages []struct {
		ID primitive.ObjectID `bson:"_id"`
	}
	if err := cur.All(opCtx, &pages); err != nil {
		slog.Warn("trash retention read failed", "error", err)
		return
	}
	_ = cur.Close(opCtx)
	for _, page := range pages {
		// Keep parents until their children have been purged; this avoids
		// leaving orphan pages with a dangling parentId.
		children, err := s.store.Pages.CountDocuments(opCtx, bson.M{"parentId": page.ID})
		if err != nil || children > 0 {
			continue
		}
		related := bson.M{"pageId": page.ID}
		_, _ = s.store.Revisions.DeleteMany(opCtx, related)
		_, _ = s.store.Comments.DeleteMany(opCtx, related)
		_, _ = s.store.FormSubmissions.DeleteMany(opCtx, related)
		_, _ = s.store.Proposals.DeleteMany(opCtx, related)
		if _, err := s.store.Pages.DeleteOne(opCtx, bson.M{"_id": page.ID, "archived": true}); err != nil {
			slog.Warn("trash retention delete failed", "pageId", page.ID.Hex(), "error", err)
		}
	}
}
