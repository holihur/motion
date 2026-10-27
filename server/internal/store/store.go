package store

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/mongo"
	"go.mongodb.org/mongo-driver/mongo/options"
)

type Store struct {
	Client          *mongo.Client
	DB              *mongo.Database
	Users           *mongo.Collection
	Workspaces      *mongo.Collection
	Pages           *mongo.Collection
	Tokens          *mongo.Collection
	Revisions       *mongo.Collection
	Comments        *mongo.Collection
	AISettings      *mongo.Collection
	Settings        *mongo.Collection
	Agents          *mongo.Collection
	Proposals       *mongo.Collection
	Audit           *mongo.Collection
	Integrations    *mongo.Collection
	Deliveries      *mongo.Collection
	PublishGroups   *mongo.Collection
	FormSubmissions *mongo.Collection
}

func Connect(ctx context.Context, uri, dbName string) (*Store, error) {
	ctx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()

	client, err := mongo.Connect(ctx, options.Client().ApplyURI(uri))
	if err != nil {
		return nil, err
	}
	if err := client.Ping(ctx, nil); err != nil {
		return nil, err
	}

	db := client.Database(dbName)
	return &Store{
		Client:          client,
		DB:              db,
		Users:           db.Collection("users"),
		Workspaces:      db.Collection("workspaces"),
		Pages:           db.Collection("pages"),
		Tokens:          db.Collection("api_tokens"),
		Revisions:       db.Collection("page_revisions"),
		Comments:        db.Collection("comments"),
		AISettings:      db.Collection("ai_settings"),
		Settings:        db.Collection("settings"),
		Agents:          db.Collection("agents"),
		Proposals:       db.Collection("ai_proposals"),
		Audit:           db.Collection("audit_logs"),
		Integrations:    db.Collection("integrations"),
		Deliveries:      db.Collection("webhook_deliveries"),
		PublishGroups:   db.Collection("publish_groups"),
		FormSubmissions: db.Collection("form_submissions"),
	}, nil
}

func (s *Store) EnsureIndexes(ctx context.Context) error {
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	_, err := s.Users.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "email", Value: 1}},
		Options: options.Index().SetUnique(true),
	})
	if err != nil {
		return err
	}

	_, err = s.Pages.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "workspaceId", Value: 1}, {Key: "archived", Value: 1}, {Key: "order", Value: 1}}},
		{Keys: bson.D{{Key: "workspaceId", Value: 1}, {Key: "parentId", Value: 1}}},
		{Keys: bson.D{{Key: "workspaceId", Value: 1}, {Key: "updatedAt", Value: -1}}},
	})
	if err != nil {
		return err
	}

	_, err = s.Workspaces.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{{Key: "ownerId", Value: 1}},
	})
	if err != nil {
		return err
	}

	_, err = s.Tokens.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "hash", Value: 1}}, Options: options.Index().SetUnique(true)},
		{Keys: bson.D{{Key: "userId", Value: 1}, {Key: "createdAt", Value: -1}}},
	})
	if err != nil {
		return err
	}

	_, err = s.Revisions.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{{Key: "pageId", Value: 1}, {Key: "createdAt", Value: -1}},
	})
	if err != nil {
		return err
	}

	_, err = s.Comments.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{{Key: "pageId", Value: 1}, {Key: "createdAt", Value: 1}},
	})
	if err != nil {
		return err
	}

	_, err = s.AISettings.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "userId", Value: 1}},
		Options: options.Index().SetUnique(true),
	})
	if err != nil {
		return err
	}
	_, err = s.Integrations.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys:    bson.D{{Key: "workspaceId", Value: 1}, {Key: "provider", Value: 1}},
		Options: options.Index().SetUnique(true),
	})
	if err != nil {
		return err
	}
	_, err = s.Deliveries.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{{Key: "workspaceId", Value: 1}, {Key: "createdAt", Value: -1}},
	})
	if err != nil {
		return err
	}
	_, err = s.PublishGroups.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{{Key: "workspaceId", Value: 1}, {Key: "createdAt", Value: 1}},
	})
	if err != nil {
		return err
	}
	_, err = s.FormSubmissions.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{{Key: "pageId", Value: 1}, {Key: "blockId", Value: 1}, {Key: "submittedAt", Value: -1}},
	})
	if err != nil {
		return err
	}
	_, err = s.Agents.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "workspaceId", Value: 1}, {Key: "createdAt", Value: 1}}},
		{Keys: bson.D{{Key: "workspaceId", Value: 1}, {Key: "isDefault", Value: 1}}},
	})
	if err != nil {
		return err
	}
	_, err = s.Proposals.Indexes().CreateMany(ctx, []mongo.IndexModel{
		{Keys: bson.D{{Key: "workspaceId", Value: 1}, {Key: "status", Value: 1}, {Key: "createdAt", Value: -1}}},
		{Keys: bson.D{{Key: "pageId", Value: 1}, {Key: "createdAt", Value: -1}}},
	})
	if err != nil {
		return err
	}
	_, err = s.Audit.Indexes().CreateOne(ctx, mongo.IndexModel{
		Keys: bson.D{{Key: "workspaceId", Value: 1}, {Key: "createdAt", Value: -1}},
	})
	return err
}

func (s *Store) Close(ctx context.Context) error {
	return s.Client.Disconnect(ctx)
}
