import { localizeApiError } from "./i18n"
import { uid } from "./utils"
import type {
  AIChatResponse,
  AIProposal,
  AISettings,
  Agent,
  AuditLog,
  Block,
  SystemInfo,
  UpdateCheck,
  OpsSettings,
  OpsStats,
  Comment,
  Member,
  Page,
  Backlink,
  Integration,
  WebhookDelivery,
  PublishResult,
  PageRevision,
  PageSummary,
  User,
  Workspace,
} from "./types"

const TOKEN_KEY = "motion.token"

export class ApiError extends Error {
  status: number
  constructor(message: string, status: number) {
    super(message)
    this.status = status
  }
}

export function getToken() {
  return localStorage.getItem(TOKEN_KEY)
}

const CLIENT_KEY = "motion.client"

export function getClientId() {
  try {
    let id = sessionStorage.getItem(CLIENT_KEY)
    if (!id) {
      id = uid()
      sessionStorage.setItem(CLIENT_KEY, id)
    }
    return id
  } catch {
    return uid()
  }
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

async function request<T>(
  path: string,
  init: RequestInit = {},
  opsToken?: string,
): Promise<T> {
  const token = getToken()
  const headers = new Headers(init.headers)
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }
  if (token) headers.set("Authorization", `Bearer ${token}`)
  if (opsToken) headers.set("X-Ops-Token", opsToken)
  headers.set("X-Motion-Client", getClientId())

  let response: Response
  try {
    response = await fetch(`/api${path}`, { ...init, headers })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error
    throw new ApiError("无法连接服务器，请稍后再试", 0)
  }

  if (response.status === 204) return undefined as T

  const raw = await response.text()
  let payload: unknown = null
  if (raw) {
    try {
      payload = JSON.parse(raw)
    } catch {
      payload = null
    }
  }

  if (!response.ok) {
    if (response.status === 401 && token && !opsToken && !path.startsWith("/auth/")) {
      window.dispatchEvent(new CustomEvent("motion:unauthorized"))
    }
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `请求失败（${response.status}）`
    throw new ApiError(localizeApiError(message), response.status)
  }

  return payload as T
}

function body(value: unknown): string {
  return JSON.stringify(value)
}

async function streamChat(
  input: {
    message: string
    pageId?: string
    agentId?: string
    history?: { role: string; content: string }[]
    signal?: AbortSignal
  },
  onToken: (text: string) => void,
): Promise<AIChatResponse> {
  const token = getToken()
  const headers = new Headers({ "Content-Type": "application/json" })
  if (token) headers.set("Authorization", `Bearer ${token}`)
  headers.set("X-Motion-Client", getClientId())
  let response: Response
  try {
    response = await fetch("/api/ai/chat/stream", {
      method: "POST",
      headers,
      body: body({
        message: input.message,
        pageId: input.pageId,
        agentId: input.agentId,
        history: input.history,
      }),
      signal: input.signal,
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error
    throw new ApiError("无法连接服务器，请稍后再试", 0)
  }
  if (!response.ok) {
    const raw = await response.text()
    let message = `请求失败（${response.status}）`
    try {
      const payload = JSON.parse(raw) as { error?: string }
      if (payload.error) message = payload.error
    } catch {
      // Keep the generic message.
    }
    if (response.status === 401 && token) {
      window.dispatchEvent(new CustomEvent("motion:unauthorized"))
    }
    throw new ApiError(localizeApiError(message), response.status)
  }
  if (!response.body) throw new ApiError("服务器不支持流式响应", 0)
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  let done: AIChatResponse | null = null
  let streamError: string | null = null

  function consume(block: string) {
    let event = "message"
    const dataLines: string[] = []
    for (const line of block.split("\n")) {
      if (line.startsWith("event:")) event = line.slice(6).trim()
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim())
    }
    if (dataLines.length === 0) return
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(dataLines.join("\n")) as Record<string, unknown>
    } catch {
      return
    }
    if (event === "token" && typeof payload.text === "string") onToken(payload.text)
    else if (event === "done") done = payload as unknown as AIChatResponse
    else if (event === "error") streamError = String(payload.error ?? "AI request failed")
  }

  while (true) {
    const { value, done: finished } = await reader.read()
    if (finished) break
    buffer += decoder.decode(value, { stream: true })
    let index = buffer.indexOf("\n\n")
    while (index >= 0) {
      consume(buffer.slice(0, index))
      buffer = buffer.slice(index + 2)
      index = buffer.indexOf("\n\n")
    }
  }
  if (buffer.trim()) consume(buffer)
  if (streamError) throw new ApiError(localizeApiError(streamError), 502)
  if (!done) throw new ApiError("AI 连接提前结束", 0)
  return done
}

export const api = {
  auth: {
    login: (email: string, password: string) =>
      request<{ token: string; user: User }>("/auth/login", {
        method: "POST",
        body: body({ email, password }),
      }),
    register: (name: string, email: string, password: string) =>
      request<{ token: string; user: User }>("/auth/register", {
        method: "POST",
        body: body({ name, email, password }),
      }),
    me: () => request<User>("/me"),
    config: () =>
      request<{ appName: string; oidc: { enabled: boolean; name: string } }>("/auth/config"),
    oidcExchange: () =>
      request<{ token: string; user: User }>("/auth/oidc/exchange", { method: "POST" }),
    updateMe: (name: string) =>
      request<User>("/me", { method: "PATCH", body: body({ name }) }),
  },
  workspaces: {
    list: () => request<Workspace[]>("/workspaces"),
    create: (name: string, icon = "🧭") =>
      request<Workspace>("/workspaces", { method: "POST", body: body({ name, icon }) }),
    lock: (id: string) => request<Page>(`/pages/${id}/lock`, { method: "POST" }),
    unlock: (id: string) => request<Page>(`/pages/${id}/unlock`, { method: "POST" }),
    update: (id: string, patch: { name?: string; icon?: string }) =>
      request<Workspace>(`/workspaces/${id}`, { method: "PATCH", body: body(patch) }),
    remove: (id: string) => request<void>(`/workspaces/${id}`, { method: "DELETE" }),
    members: (id: string) => request<Member[]>(`/workspaces/${id}/members`),
    agentConfig: (id: string) => request<{ skills: import("./types").WorkspaceSkill[]; mcpServers: import("./types").WorkspaceMCP[] }>(`/workspaces/${id}/agent-config`),
    saveAgentConfig: (id: string, input: { skills: import("./types").WorkspaceSkill[]; mcpServers: import("./types").WorkspaceMCP[] }) =>
      request<{ skills: import("./types").WorkspaceSkill[]; mcpServers: import("./types").WorkspaceMCP[] }>(`/workspaces/${id}/agent-config`, {
        method: "PUT",
        body: body(input),
      }),
    invite: (id: string, email: string, role: "editor" | "viewer") =>
      request<Member>(`/workspaces/${id}/members`, {
        method: "POST",
        body: body({ email, role }),
      }),
    updateMember: (id: string, userId: string, role: "editor" | "viewer") =>
      request<{ role: string }>(`/workspaces/${id}/members/${userId}`, {
        method: "PATCH",
        body: body({ role }),
      }),
    removeMember: (id: string, userId: string) =>
      request<void>(`/workspaces/${id}/members/${userId}`, { method: "DELETE" }),
    tokens: () => request<AccessToken[]>("/tokens"),
    createToken: (input: { name: string; scopes: string[]; expiresInDays?: number }) =>
      request<{ token: string; accessToken: AccessToken }>("/tokens", {
        method: "POST",
        body: body(input),
      }),
    revokeToken: (id: string) => request<void>(`/tokens/${id}`, { method: "DELETE" }),
  },
  system: {
    info: () => request<SystemInfo>("/system/info"),
  },
  agents: {
    list: (workspaceId: string) => request<Agent[]>(`/workspaces/${workspaceId}/agents`),
    create: (workspaceId: string, input: Partial<Pick<Agent, "name" | "icon" | "description" | "mode" | "scopes" | "enabled">>) =>
      request<Agent>(`/workspaces/${workspaceId}/agents`, { method: "POST", body: body(input) }),
    update: (agentId: string, input: Partial<Pick<Agent, "name" | "icon" | "description" | "mode" | "scopes" | "enabled">>) =>
      request<Agent>(`/agents/${agentId}`, { method: "PATCH", body: body(input) }),
    remove: (agentId: string) => request<void>(`/agents/${agentId}`, { method: "DELETE" }),
  },
  proposals: {
    list: (workspaceId: string, status?: string) =>
      request<AIProposal[]>(
        `/workspaces/${workspaceId}/proposals${status ? `?status=${encodeURIComponent(status)}` : ""}`,
      ),
    get: (id: string) => request<AIProposal>(`/proposals/${id}`),
    approve: (id: string) => request<AIProposal>(`/proposals/${id}/approve`, { method: "POST" }),
    reject: (id: string) => request<AIProposal>(`/proposals/${id}/reject`, { method: "POST" }),
  },
  audit: {
    list: (workspaceId: string) => request<AuditLog[]>(`/workspaces/${workspaceId}/audit`),
  },
  ops: {
    settings: (opsToken: string) => request<OpsSettings>("/ops/settings", {}, opsToken),
    saveSettings: (opsToken: string, input: {
      appName?: string
      allowSignup?: boolean
      mcpEnabled?: boolean
      aiModel?: string
      adminEmails?: string[]
      oidc?: Partial<OpsSettings["oidc"]> & { clientSecret?: string; clearClientSecret?: boolean }
      update?: Partial<OpsSettings["update"]>
    }) => request<OpsSettings>("/ops/settings", { method: "PUT", body: body(input) }, opsToken),
    stats: (opsToken: string) => request<OpsStats>("/ops/stats", {}, opsToken),
    checkUpdate: (opsToken: string) =>
      request<UpdateCheck>("/ops/check-update", { method: "POST" }, opsToken),
    applyUpdate: (opsToken: string) =>
      request<{ updated: boolean; version: string; restarting: boolean }>(
        "/ops/apply-update",
        { method: "POST" },
        opsToken,
      ),
  },
  ai: {
    settings: () => request<AISettings>("/ai/settings"),
    saveSettings: (input: { provider?: string; apiKey?: string; model?: string; baseUrl?: string }) =>
      request<AISettings>("/ai/settings", { method: "PUT", body: body(input) }),
    removeSettings: () => request<void>("/ai/settings", { method: "DELETE" }),
    test: () =>
      request<{ ok: boolean; model: string; message: string; latencyMs: number }>("/ai/test", {
        method: "POST",
      }),
    status: (pageId?: string) =>
      request<{
        configured: boolean
        provider: string
        providerLabel: string
        model: string
        agentsPageId?: string
      }>(`/ai/status${pageId ? `?pageId=${encodeURIComponent(pageId)}` : ""}`),
    createAgentsPage: (pageId?: string) =>
      request<{ pageId: string; title: string }>("/ai/agents", {
        method: "POST",
        body: body({ pageId }),
      }),
    chat: (input: {
      message: string
      pageId?: string
      agentId?: string
      history?: { role: string; content: string }[]
      signal?: AbortSignal
    }) =>
      request<AIChatResponse>("/ai/chat", {
        method: "POST",
        body: body({
          message: input.message,
          pageId: input.pageId,
          agentId: input.agentId,
          history: input.history,
        }),
        signal: input.signal,
      }),
    chatStream: (
      input: {
        message: string
        pageId?: string
        agentId?: string
        history?: { role: string; content: string }[]
        signal?: AbortSignal
      },
      onToken: (text: string) => void,
    ) => streamChat(input, onToken),
  },
  integrations: {
    list: (workspaceId: string) => request<Integration[]>(`/workspaces/${workspaceId}/integrations`),
    save: (workspaceId: string, provider: string, input: { config: Record<string, string>; events?: string[]; secret?: string }) =>
      request<Integration>(`/workspaces/${workspaceId}/integrations/${provider}`, {
        method: "PUT",
        body: body(input),
      }),
    remove: (workspaceId: string, provider: string) =>
      request<void>(`/workspaces/${workspaceId}/integrations/${provider}`, { method: "DELETE" }),
    deliveries: (workspaceId: string) => request<WebhookDelivery[]>(`/workspaces/${workspaceId}/webhook-deliveries`),
    publishSSH: (workspaceId: string, pageId: string, includeChildren = true) =>
      request<PublishResult>(`/workspaces/${workspaceId}/integrations/ssh/publish`, {
        method: "POST",
        body: body({ pageId, includeChildren }),
      }),
    publishGit: (workspaceId: string, pageId: string, includeChildren = true) =>
      request<PublishResult>(`/workspaces/${workspaceId}/integrations/git/publish`, {
        method: "POST",
        body: body({ pageId, includeChildren }),
      }),
    publishJira: (workspaceId: string, pageId: string) =>
      request<PublishResult>(`/workspaces/${workspaceId}/integrations/jira/publish`, {
        method: "POST",
        body: body({ pageId }),
      }),
    publishConfluence: (workspaceId: string, pageId: string) =>
      request<PublishResult>(`/workspaces/${workspaceId}/integrations/confluence/publish`, {
        method: "POST",
        body: body({ pageId }),
      }),
  },
  files: {
    upload: async (file: File, workspaceId: string) => {
      const form = new FormData()
      form.append("file", file)
      form.append("workspaceId", workspaceId)
      const headers = new Headers()
      const token = getToken()
      if (token) headers.set("Authorization", `Bearer ${token}`)
      headers.set("X-Motion-Client", getClientId())
      const response = await fetch("/api/files", { method: "POST", headers, body: form })
      const payload = await response.json().catch(() => null) as
        | { id: string; url: string; name: string; size: number; contentType: string; error?: string }
        | null
      if (!response.ok) {
        throw new ApiError(localizeApiError(payload?.error || `请求失败（${response.status}）`), response.status)
      }
      return payload as { id: string; url: string; name: string; size: number; contentType: string }
    },
  },
  pages: {
    list: (workspaceId: string) =>
      request<PageSummary[]>(`/workspaces/${workspaceId}/pages`),
    trash: (workspaceId: string) =>
      request<PageSummary[]>(`/workspaces/${workspaceId}/trash`),
    search: (workspaceId: string, query: string) =>
      request<PageSummary[]>(
        `/workspaces/${workspaceId}/search?q=${encodeURIComponent(query)}`,
      ),
    get: (id: string) => request<Page>(`/pages/${id}`),
    backlinks: (id: string) => request<Backlink[]>(`/pages/${id}/backlinks`),
    lock: (id: string) => request<Page>(`/pages/${id}/lock`, { method: "POST" }),
    unlock: (id: string) => request<Page>(`/pages/${id}/unlock`, { method: "POST" }),
    create: (input: { workspaceId: string; parentId?: string | null; title?: string; icon?: string }) =>
      request<Page>("/pages", { method: "POST", body: body(input) }),
    update: (
      id: string,
      patch: {
        title?: string
        icon?: string
        cover?: string
        favorite?: boolean
        archived?: boolean
        parentId?: string | null
      },
    ) => request<Page>(`/pages/${id}`, { method: "PATCH", body: body(patch) }),
    saveBlocks: (id: string, blocks: Block[], base?: Block[]) =>
      request<{ blocks: Block[]; blocksRev?: number; updatedAt: string }>(`/pages/${id}/blocks`, {
        method: "PUT",
        body: body(base ? { blocks, base } : { blocks }),
      }),
    applyOps: (
      id: string,
      input: { baseRev: number; order: string[]; upserts: Block[]; deletes: string[] },
    ) =>
      request<{
        blocksRev: number
        order: string[]
        upserts: Block[]
        deletes: string[]
        updatedAt: string
      }>(`/pages/${id}/ops`, { method: "POST", body: body(input) }),
    comments: (id: string) => request<Comment[]>(`/pages/${id}/comments`),
    createComment: (
      id: string,
      input: {
        blockId: string
        quote: string
        startOffset: number
        endOffset: number
        body: string
        parentId?: string
      },
    ) => request<Comment>(`/pages/${id}/comments`, { method: "POST", body: body(input) }),
    updateComment: (commentId: string, patch: { body?: string; resolved?: boolean }) =>
      request<Comment>(`/comments/${commentId}`, { method: "PATCH", body: body(patch) }),
    deleteComment: (commentId: string) =>
      request<void>(`/comments/${commentId}`, { method: "DELETE" }),
    revisions: (id: string) =>
      request<PageRevision[]>(`/pages/${id}/revisions`),
    createRevision: (id: string) =>
      request<PageRevision>(`/pages/${id}/revisions`, { method: "POST" }),
    revision: (id: string, revisionId: string) =>
      request<PageRevision>(`/pages/${id}/revisions/${revisionId}`),
    restoreRevision: (id: string, revisionId: string) =>
      request<Page>(`/pages/${id}/revisions/${revisionId}/restore`, { method: "POST" }),
    duplicate: (id: string) =>
      request<Page>(`/pages/${id}/duplicate`, { method: "POST" }),
    remove: (id: string) => request<void>(`/pages/${id}`, { method: "DELETE" }),
  },
}

export interface AccessToken {
  id: string
  name: string
  prefix: string
  scopes: string[]
  expiresAt?: string
  lastUsedAt?: string
  createdAt: string
}
