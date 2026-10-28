package httpapi

import (
	"context"
	"time"

	"go.mongodb.org/mongo-driver/bson"
	"go.mongodb.org/mongo-driver/bson/primitive"
	"go.mongodb.org/mongo-driver/mongo/options"

	"github.com/motion/server/internal/docagent"
	"github.com/motion/server/internal/model"
)

func aiUsageKey(userID primitive.ObjectID, day string) string {
	return userID.Hex() + ":" + day
}

func (s *Server) aiBudgetExceeded(ctx context.Context, userID primitive.ObjectID) bool {
	budget := s.siteSnapshot().AIDailyTokenBudget
	if budget <= 0 {
		return false
	}
	day := time.Now().UTC().Format("2006-01-02")
	var usage model.AIUsage
	if err := s.store.AIUsage.FindOne(ctx, bson.M{"_id": aiUsageKey(userID, day)}).Decode(&usage); err != nil {
		return false
	}
	return usage.TotalTokens >= int64(budget)
}

func (s *Server) recordAIUsage(_ context.Context, userID primitive.ObjectID, usage docagent.Usage, prompt, reply string) {
	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()
	if usage.TotalTokens <= 0 {
		// Some OpenAI-compatible providers omit usage metadata. Estimate at
		// roughly four characters per token so the budget still has teeth.
		promptTokens := int64((len([]rune(prompt)) + 3) / 4)
		completionTokens := int64((len([]rune(reply)) + 3) / 4)
		usage = docagent.Usage{
			PromptTokens: promptTokens, CompletionTokens: completionTokens,
			TotalTokens: promptTokens + completionTokens,
		}
	}
	day := time.Now().UTC().Format("2006-01-02")
	_, _ = s.store.AIUsage.UpdateOne(ctx,
		bson.M{"_id": aiUsageKey(userID, day)},
		bson.M{
			"$inc": bson.M{
				"promptTokens": usage.PromptTokens, "completionTokens": usage.CompletionTokens,
				"totalTokens": usage.TotalTokens,
			},
			"$set": bson.M{"userId": userID, "day": day, "updatedAt": time.Now().UTC()},
		},
		options.Update().SetUpsert(true))
}
