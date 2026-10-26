package openaimodel

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"google.golang.org/adk/model"
	"google.golang.org/genai"
)

func TestGenerateContentToolCallAndToolResponse(t *testing.T) {
	var calls int
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.Header.Get("Authorization") != "Bearer sk-test" {
			t.Errorf("missing auth header")
		}
		var body chatRequest
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Fatal(err)
		}
		if body.Model != "deepseek-chat" {
			t.Errorf("model = %q", body.Model)
		}
		if calls == 1 {
			if len(body.Tools) == 0 {
				t.Errorf("expected tools")
			}
			message := openAIMessage{
				Role: "assistant",
				ToolCalls: []openAIToolCall{{
					ID: "call_1", Type: "function",
					Function: openAIFunctionCall{Name: "search_pages", Arguments: `{"query":"hello"}`},
				}},
			}
			writeResponse(t, w, message, "tool_calls")
			return
		}
		foundTool := false
		for _, message := range body.Messages {
			if message.Role == "tool" && message.ToolCallID == "call_1" {
				foundTool = true
			}
		}
		if !foundTool {
			t.Errorf("expected tool response in follow-up request: %#v", body.Messages)
		}
		text := "I found it."
		writeResponse(t, w, openAIMessage{Role: "assistant", Content: &text}, "stop")
	}))
	defer server.Close()

	m := New(Config{Provider: "deepseek", BaseURL: server.URL + "/v1", APIKey: "sk-test", Model: "deepseek-chat"})
	request := &model.LLMRequest{
		Model: "deepseek-chat",
		Contents: []*genai.Content{
			{Role: "user", Parts: []*genai.Part{{Text: "Find hello"}}},
		},
		Config: &genai.GenerateContentConfig{
			SystemInstruction: &genai.Content{Parts: []*genai.Part{{Text: "You are helpful."}}},
			Tools: []*genai.Tool{{FunctionDeclarations: []*genai.FunctionDeclaration{{
				Name: "search_pages", Description: "Search",
				Parameters: &genai.Schema{Type: genai.TypeObject},
			}}}},
		},
	}
	var response *model.LLMResponse
	for result, err := range m.GenerateContent(context.Background(), request, false) {
		if err != nil {
			t.Fatal(err)
		}
		response = result
	}
	if response == nil || len(response.Content.Parts) != 1 || response.Content.Parts[0].FunctionCall == nil {
		t.Fatalf("expected a function call response: %#v", response)
	}
	if response.Content.Parts[0].FunctionCall.Name != "search_pages" {
		t.Fatalf("unexpected tool call: %#v", response.Content.Parts[0].FunctionCall)
	}
}

func writeResponse(t *testing.T, w http.ResponseWriter, message openAIMessage, finish string) {
	t.Helper()
	payload := map[string]any{
		"choices": []map[string]any{{"message": message, "finish_reason": finish}},
		"usage":   map[string]int{"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
	}
	w.Header().Set("Content-Type", "application/json")
	if err := json.NewEncoder(w).Encode(payload); err != nil && !strings.Contains(err.Error(), "closed") {
		t.Error(err)
	}
}
