# BYOK / Google ADK AI 助手

## 配置

**Settings → AI**：

- Provider：DeepSeek（默认）、OpenAI、OpenRouter、Groq、Ollama、Gemini、Custom OpenAI-compatible
- API Key
- Model
- Base URL

Key 使用 AES-256-GCM 加密存储，接口只返回末四位提示。删除 Provider 会清除密钥。

## DeepSeek 示例

| 字段 | 值 |
| --- | --- |
| Provider | DeepSeek |
| Base URL | `https://api.deepseek.com` |
| Model | `deepseek-chat` |
| API Key | 你的 DeepSeek Key |

OpenAI 兼容适配器会自动请求 `{baseUrl}/chat/completions`，并把 ADK 的对话、工具声明、工具调用与工具结果转换成 OpenAI 格式。

## ADK

后端使用 `google.golang.org/adk` 创建 `motion_document_agent`。模型可以是：

- Gemini 原生：`model/gemini`
- 任意 OpenAI-compatible：`internal/openaimodel` 自定义 `model.LLM` 适配器

工具：

- `list_workspaces`
- `search_pages`
- `read_page`
- `create_page`
- `append_blocks`
- `update_page`
- `update_block`
- `add_comment`

助手会先搜索/读取真实页面，再执行修改，避免编造页面 ID。

## AGENTS.md 工作区指令

在工作区中创建一个标题为 `AGENTS.md` 的页面（不区分大小写）。AI 面板会显示 **Create / Open** 快捷入口。每次对话时，服务端会把该页面的 Markdown 内容作为项目级指令加入 Agent 的 System Instruction。

适合写：

- 团队写作风格和术语
- 文档结构约定
- 常用项目背景
- 哪些内容不要自动修改

它是普通页面：支持多人协作、评论、历史版本；AI 也可以通过工具修改它。为安全起见，它不能覆盖权限、Scope 或服务端安全规则。内容超过 20,000 字符会被截断。

## 请求流程

1. 浏览器发送消息和最近对话历史到 `POST /api/ai/chat`
2. 后端读取当前用户的加密 Key 并解密
3. ADK Agent 运行，模型按需调用文档工具
4. 工具直接修改 MongoDB，并通过 WebSocket 广播
5. 返回最终文本、已执行动作列表，以及本次运行前的版本 ID
6. 前端可点击 **Undo AI changes** 恢复该版本；运行过程中可点击 **Stop** 取消请求，也可 **Regenerate** 重新生成

## 安全

- 只允许服务端调用模型 API，Key 不进入前端
- PAT 需要 `ai:use` Scope；文档读写工具还会校验 `pages:read/pages:write`
- 工作区 viewer 角色只能读
- 不提供删除工具，避免模型误删内容
- 每次运行前自动创建版本快照，AI 修改可一键撤销
- 对话记录保存在当前浏览器的 `localStorage`，按页面隔离
