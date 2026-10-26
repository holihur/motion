import { uid } from "./utils"
import type {
  AIChatResponse,
  AISettings,
  Block,
  SystemInfo,
  UpdateCheck,
  OpsSettings,
  OpsStats,
  Comment,
  Member,
  Page,
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

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const token = getToken()
  const headers = new Headers(init.headers)
  if (init.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }
  if (token) headers.set("Authorization", `Bearer ${token}`)
  headers.set("X-Motion-Client", getClientId())

  let response: Response
  try {
    response = await fetch(`/api${path}`, { ...init, headers })
  } catch {
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
    if (response.status === 401 && token && !path.startsWith("/auth/")) {
      window.dispatchEvent(new CustomEvent("motion:unauthorized"))
    }
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? String((payload as { error: unknown }).error)
        : `请求失败（${response.status}）`
    throw new ApiError(message, response.status)
  }

  return payload as T
}

function body(value: unknown): string {
  return JSON.stringify(value)
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
    update: (id: string, patch: { name?: string; icon?: string }) =>
      request<Workspace>(`/workspaces/${id}`, { method: "PATCH", body: body(patch) }),
    remove: (id: string) => request<void>(`/workspaces/${id}`, { method: "DELETE" }),
    members: (id: string) => request<Member[]>(`/workspaces/${id}/members`),
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
  ops: {
    settings: () => request<OpsSettings>("/ops/settings"),
    saveSettings: (input: {
      appName?: string
      allowSignup?: boolean
      mcpEnabled?: boolean
      aiModel?: string
      adminEmails?: string[]
      oidc?: Partial<OpsSettings["oidc"]> & { clientSecret?: string; clearClientSecret?: boolean }
      update?: Partial<OpsSettings["update"]>
    }) => request<OpsSettings>("/ops/settings", { method: "PUT", body: body(input) }),
    stats: () => request<OpsStats>("/ops/stats"),
    checkUpdate: () => request<UpdateCheck>("/ops/check-update", { method: "POST" }),
    applyUpdate: () =>
      request<{ updated: boolean; version: string; restarting: boolean }>("/ops/apply-update", {
        method: "POST",
      }),
  },
  ai: {
    settings: () => request<AISettings>("/ai/settings"),
    saveSettings: (input: { provider?: string; apiKey?: string; model?: string; baseUrl?: string }) =>
      request<AISettings>("/ai/settings", { method: "PUT", body: body(input) }),
    removeSettings: () => request<void>("/ai/settings", { method: "DELETE" }),
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
      history?: { role: string; content: string }[]
    }) => request<AIChatResponse>("/ai/chat", { method: "POST", body: body(input) }),
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
      request<{ blocks: Block[]; updatedAt: string }>(`/pages/${id}/blocks`, {
        method: "PUT",
        body: body(base ? { blocks, base } : { blocks }),
      }),
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
