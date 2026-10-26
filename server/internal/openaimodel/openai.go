package openaimodel

import (
	"bufio"
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"iter"
	"net/http"
	"strings"
	"time"

	"google.golang.org/adk/model"
	"google.golang.org/genai"
)

type Config struct {
	Provider string
	BaseURL  string
	APIKey   string
	Model    string
	Client   *http.Client
}

type Model struct {
	config Config
	client *http.Client
}

func New(config Config) *Model {
	client := config.Client
	if client == nil {
		client = &http.Client{Timeout: 120 * time.Second}
	}
	return &Model{config: config, client: client}
}

func (m *Model) Name() string { return m.config.Model }

type openAIMessage struct {
	Role       string           `json:"role"`
	Content    *string          `json:"content,omitempty"`
	ToolCalls  []openAIToolCall `json:"tool_calls,omitempty"`
	ToolCallID string           `json:"tool_call_id,omitempty"`
	Name       string           `json:"name,omitempty"`
}

type openAIToolCall struct {
	ID       string             `json:"id"`
	Type     string             `json:"type"`
	Function openAIFunctionCall `json:"function"`
}

type openAIFunctionCall struct {
	Name      string `json:"name"`
	Arguments string `json:"arguments"`
}

type openAITool struct {
	Type     string         `json:"type"`
	Function openAIFunction `json:"function"`
}

type openAIFunction struct {
	Name        string `json:"name"`
	Description string `json:"description,omitempty"`
	Parameters  any    `json:"parameters"`
}

type chatRequest struct {
	Model       string          `json:"model"`
	Messages    []openAIMessage `json:"messages"`
	Tools       []openAITool    `json:"tools,omitempty"`
	ToolChoice  string          `json:"tool_choice,omitempty"`
	Temperature *float32        `json:"temperature,omitempty"`
	MaxTokens   *int32          `json:"max_tokens,omitempty"`
	Stream      bool            `json:"stream"`
}

type chatResponse struct {
	Choices []struct {
		Message struct {
			Role      string           `json:"role"`
			Content   *string          `json:"content"`
			ToolCalls []openAIToolCall `json:"tool_calls"`
		} `json:"message"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Usage *struct {
		PromptTokens     int32 `json:"prompt_tokens"`
		CompletionTokens int32 `json:"completion_tokens"`
		TotalTokens      int32 `json:"total_tokens"`
	} `json:"usage"`
	Error *struct {
		Message string `json:"message"`
		Type    string `json:"type"`
	} `json:"error"`
}

type chatStreamChunk struct {
	Choices []struct {
		Delta struct {
			Content   *string `json:"content"`
			ToolCalls []struct {
				Index    int    `json:"index"`
				ID       string `json:"id"`
				Type     string `json:"type"`
				Function struct {
					Name      string `json:"name"`
					Arguments string `json:"arguments"`
				} `json:"function"`
			} `json:"tool_calls"`
		} `json:"delta"`
		FinishReason string `json:"finish_reason"`
	} `json:"choices"`
	Usage *struct {
		PromptTokens     int32 `json:"prompt_tokens"`
		CompletionTokens int32 `json:"completion_tokens"`
		TotalTokens      int32 `json:"total_tokens"`
	} `json:"usage"`
	Error *struct {
		Message string `json:"message"`
	} `json:"error"`
}

func endpoint(base string) string {
	base = strings.TrimRight(strings.TrimSpace(base), "/")
	if base == "" {
		base = "https://api.deepseek.com"
	}
	if strings.HasSuffix(base, "/chat/completions") {
		return base
	}
	return base + "/chat/completions"
}

func contentText(content *genai.Content) string {
	if content == nil {
		return ""
	}
	var builder strings.Builder
	for _, part := range content.Parts {
		if part != nil && part.Text != "" {
			builder.WriteString(part.Text)
		}
	}
	return builder.String()
}

func schemaMap(schema *genai.Schema) any {
	if schema == nil {
		return map[string]any{"type": "object", "properties": map[string]any{}}
	}
	data, err := json.Marshal(schema)
	if err != nil {
		return map[string]any{"type": "object", "properties": map[string]any{}}
	}
	var out any
	if err := json.Unmarshal(data, &out); err != nil {
		return map[string]any{"type": "object", "properties": map[string]any{}}
	}
	return out
}

func (m *Model) buildMessages(request *model.LLMRequest, toolIDs map[string]string) []openAIMessage {
	messages := make([]openAIMessage, 0, len(request.Contents)+2)
	if request.Config != nil {
		if system := contentText(request.Config.SystemInstruction); strings.TrimSpace(system) != "" {
			text := system
			messages = append(messages, openAIMessage{Role: "system", Content: &text})
		}
	}
	toolCounter := 0
	for _, content := range request.Contents {
		if content == nil {
			continue
		}
		if content.Role == "model" {
			var textBuilder strings.Builder
			var calls []openAIToolCall
			for _, part := range content.Parts {
				if part == nil {
					continue
				}
				if part.Text != "" {
					textBuilder.WriteString(part.Text)
				}
				if part.FunctionCall != nil {
					id := part.FunctionCall.ID
					if id == "" {
						toolCounter++
						id = fmt.Sprintf("call_%d", toolCounter)
					}
					toolIDs[part.FunctionCall.Name] = id
					arguments, _ := json.Marshal(part.FunctionCall.Args)
					calls = append(calls, openAIToolCall{
						ID: id, Type: "function",
						Function: openAIFunctionCall{Name: part.FunctionCall.Name, Arguments: string(arguments)},
					})
				}
			}
			if textBuilder.Len() == 0 && len(calls) == 0 {
				continue
			}
			message := openAIMessage{Role: "assistant", ToolCalls: calls}
			if textBuilder.Len() > 0 {
				text := textBuilder.String()
				message.Content = &text
			}
			messages = append(messages, message)
			continue
		}

		var texts []string
		var toolMessages []openAIMessage
		for _, part := range content.Parts {
			if part == nil {
				continue
			}
			if part.Text != "" {
				texts = append(texts, part.Text)
			}
			if part.FunctionResponse != nil {
				response := part.FunctionResponse
				id := response.ID
				if id == "" {
					if mapped, ok := toolIDs[response.Name]; ok {
						id = mapped
					}
				}
				payload, _ := json.Marshal(response.Response)
				toolMessages = append(toolMessages, openAIMessage{
					Role: "tool", ToolCallID: id, Name: response.Name, Content: ptr(string(payload)),
				})
			}
		}
		if len(texts) > 0 {
			messages = append(messages, openAIMessage{Role: "user", Content: ptr(strings.Join(texts, "\n"))})
		}
		messages = append(messages, toolMessages...)
	}
	return messages
}

func ptr(value string) *string { return &value }

func (m *Model) buildTools(request *model.LLMRequest) []openAITool {
	if request.Config == nil {
		return nil
	}
	tools := make([]openAITool, 0)
	for _, tool := range request.Config.Tools {
		if tool == nil {
			continue
		}
		for _, declaration := range tool.FunctionDeclarations {
			if declaration == nil || declaration.Name == "" {
				continue
			}
			tools = append(tools, openAITool{
				Type: "function",
				Function: openAIFunction{
					Name: declaration.Name, Description: declaration.Description,
					Parameters: schemaMap(declaration.Parameters),
				},
			})
		}
	}
	return tools
}

func (m *Model) generate(ctx context.Context, request *model.LLMRequest) (*model.LLMResponse, error) {
	toolIDs := map[string]string{}
	payload := chatRequest{
		Model:    m.config.Model,
		Messages: m.buildMessages(request, toolIDs),
		Tools:    m.buildTools(request),
		Stream:   false,
	}
	if len(payload.Tools) > 0 {
		payload.ToolChoice = "auto"
	}
	if request.Config != nil {
		payload.Temperature = request.Config.Temperature
		if request.Config.MaxOutputTokens > 0 {
			maxTokens := request.Config.MaxOutputTokens
			payload.MaxTokens = &maxTokens
		}
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint(m.config.BaseURL), bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	if m.config.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+m.config.APIKey)
	}
	resp, err := m.client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	data, err := io.ReadAll(io.LimitReader(resp.Body, 8<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		var apiError chatResponse
		_ = json.Unmarshal(data, &apiError)
		message := strings.TrimSpace(string(data))
		if apiError.Error != nil && apiError.Error.Message != "" {
			message = apiError.Error.Message
		}
		if len(message) > 500 {
			message = message[:500]
		}
		return nil, fmt.Errorf("%s API error (%d): %s", m.config.Provider, resp.StatusCode, message)
	}
	var decoded chatResponse
	if err := json.Unmarshal(data, &decoded); err != nil {
		return nil, err
	}
	if decoded.Error != nil && decoded.Error.Message != "" {
		return nil, fmt.Errorf("%s API error: %s", m.config.Provider, decoded.Error.Message)
	}
	return m.responseFromChat(decoded)
}

func (m *Model) responseFromChat(decoded chatResponse) (*model.LLMResponse, error) {
	if decoded.Error != nil && decoded.Error.Message != "" {
		return nil, fmt.Errorf("%s API error: %s", m.config.Provider, decoded.Error.Message)
	}
	if len(decoded.Choices) == 0 {
		return nil, fmt.Errorf("%s returned no choices", m.config.Provider)
	}
	choice := decoded.Choices[0]
	parts := make([]*genai.Part, 0, 2)
	if choice.Message.Content != nil && strings.TrimSpace(*choice.Message.Content) != "" {
		parts = append(parts, &genai.Part{Text: *choice.Message.Content})
	}
	for _, call := range choice.Message.ToolCalls {
		var args map[string]any
		if strings.TrimSpace(call.Function.Arguments) != "" {
			_ = json.Unmarshal([]byte(call.Function.Arguments), &args)
		}
		if args == nil {
			args = map[string]any{}
		}
		parts = append(parts, &genai.Part{FunctionCall: &genai.FunctionCall{
			ID: call.ID, Name: call.Function.Name, Args: args,
		}})
	}
	response := &model.LLMResponse{
		Content:      &genai.Content{Role: "model", Parts: parts},
		TurnComplete: true,
		FinishReason: genai.FinishReasonStop,
		ModelVersion: m.config.Model,
	}
	if decoded.Usage != nil {
		response.UsageMetadata = &genai.GenerateContentResponseUsageMetadata{
			PromptTokenCount: decoded.Usage.PromptTokens, CandidatesTokenCount: decoded.Usage.CompletionTokens,
			TotalTokenCount: decoded.Usage.TotalTokens,
		}
	}
	return response, nil
}

func (m *Model) generateStream(
	ctx context.Context,
	request *model.LLMRequest,
	yield func(*model.LLMResponse, error) bool,
) {
	toolIDs := map[string]string{}
	payload := chatRequest{
		Model:    m.config.Model,
		Messages: m.buildMessages(request, toolIDs),
		Tools:    m.buildTools(request),
		Stream:   true,
	}
	if len(payload.Tools) > 0 {
		payload.ToolChoice = "auto"
	}
	if request.Config != nil {
		payload.Temperature = request.Config.Temperature
		if request.Config.MaxOutputTokens > 0 {
			maxTokens := request.Config.MaxOutputTokens
			payload.MaxTokens = &maxTokens
		}
	}
	body, err := json.Marshal(payload)
	if err != nil {
		yield(nil, err)
		return
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint(m.config.BaseURL), bytes.NewReader(body))
	if err != nil {
		yield(nil, err)
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "text/event-stream")
	if m.config.APIKey != "" {
		req.Header.Set("Authorization", "Bearer "+m.config.APIKey)
	}
	resp, err := m.client.Do(req)
	if err != nil {
		yield(nil, err)
		return
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		data, _ := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
		message := strings.TrimSpace(string(data))
		if len(message) > 500 {
			message = message[:500]
		}
		yield(nil, fmt.Errorf("%s API error (%d): %s", m.config.Provider, resp.StatusCode, message))
		return
	}
	if !strings.Contains(resp.Header.Get("Content-Type"), "text/event-stream") {
		// Some compatible gateways ignore stream=true and return one JSON body.
		var decoded chatResponse
		if err := json.NewDecoder(io.LimitReader(resp.Body, 8<<20)).Decode(&decoded); err != nil {
			yield(nil, err)
			return
		}
		response, err := m.responseFromChat(decoded)
		if err != nil {
			yield(nil, err)
			return
		}
		yield(response, nil)
		return
	}

	var text strings.Builder
	type toolAccum struct {
		ID        string
		Name      string
		Arguments strings.Builder
	}
	tools := map[int]*toolAccum{}
	var usage *struct {
		PromptTokens     int32 `json:"prompt_tokens"`
		CompletionTokens int32 `json:"completion_tokens"`
		TotalTokens      int32 `json:"total_tokens"`
	}
	scanner := bufio.NewScanner(resp.Body)
	scanner.Buffer(make([]byte, 64*1024), 2*1024*1024)
	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if !strings.HasPrefix(line, "data:") {
			continue
		}
		data := strings.TrimSpace(strings.TrimPrefix(line, "data:"))
		if data == "" || data == "[DONE]" {
			continue
		}
		var chunk chatStreamChunk
		if err := json.Unmarshal([]byte(data), &chunk); err != nil {
			yield(nil, err)
			return
		}
		if chunk.Error != nil && chunk.Error.Message != "" {
			yield(nil, fmt.Errorf("%s API error: %s", m.config.Provider, chunk.Error.Message))
			return
		}
		if chunk.Usage != nil {
			usage = chunk.Usage
		}
		for _, choice := range chunk.Choices {
			if choice.Delta.Content != nil && *choice.Delta.Content != "" {
				piece := *choice.Delta.Content
				text.WriteString(piece)
				if !yield(&model.LLMResponse{
					Content: &genai.Content{Role: "model", Parts: []*genai.Part{{Text: piece}}},
					Partial: true,
				}, nil) {
					return
				}
			}
			for _, call := range choice.Delta.ToolCalls {
				entry := tools[call.Index]
				if entry == nil {
					entry = &toolAccum{}
					tools[call.Index] = entry
				}
				if call.ID != "" {
					entry.ID = call.ID
				}
				if call.Function.Name != "" {
					entry.Name = call.Function.Name
				}
				entry.Arguments.WriteString(call.Function.Arguments)
			}
		}
	}
	if err := scanner.Err(); err != nil {
		yield(nil, err)
		return
	}
	parts := make([]*genai.Part, 0, len(tools)+1)
	if text.Len() > 0 {
		parts = append(parts, &genai.Part{Text: text.String()})
	}
	for index := 0; index < len(tools); index++ {
		entry := tools[index]
		if entry == nil || entry.Name == "" {
			continue
		}
		var args map[string]any
		if strings.TrimSpace(entry.Arguments.String()) != "" {
			_ = json.Unmarshal([]byte(entry.Arguments.String()), &args)
		}
		if args == nil {
			args = map[string]any{}
		}
		parts = append(parts, &genai.Part{FunctionCall: &genai.FunctionCall{
			ID: entry.ID, Name: entry.Name, Args: args,
		}})
	}
	if len(parts) == 0 {
		yield(nil, fmt.Errorf("%s stream returned no content", m.config.Provider))
		return
	}
	response := &model.LLMResponse{
		Content:      &genai.Content{Role: "model", Parts: parts},
		TurnComplete: true,
		FinishReason: genai.FinishReasonStop,
		ModelVersion: m.config.Model,
	}
	if usage != nil {
		response.UsageMetadata = &genai.GenerateContentResponseUsageMetadata{
			PromptTokenCount: usage.PromptTokens, CandidatesTokenCount: usage.CompletionTokens,
			TotalTokenCount: usage.TotalTokens,
		}
	}
	yield(response, nil)
}

func (m *Model) GenerateContent(ctx context.Context, request *model.LLMRequest, stream bool) iter.Seq2[*model.LLMResponse, error] {
	return func(yield func(*model.LLMResponse, error) bool) {
		if stream {
			m.generateStream(ctx, request, yield)
			return
		}
		response, err := m.generate(ctx, request)
		if err != nil {
			yield(nil, err)
			return
		}
		yield(response, nil)
	}
}
