export type BlockType =
  | "paragraph"
  | "heading1"
  | "heading2"
  | "heading3"
  | "bulleted"
  | "numbered"
  | "todo"
  | "quote"
  | "callout"
  | "code"
  | "divider"
  | "image"
  | "table"
  | "diagram"

export interface TableData {
  columns: string[]
  rows: string[][]
  header: boolean
}

export interface Block {
  id: string
  type: BlockType
  text: string
  /** Serialized Lexical editor state for inline formatting. */
  rich?: string
  checked?: boolean
  language?: string
  color?: string
  url?: string
  caption?: string
  table?: TableData
}

export interface User {
  id: string
  name: string
  email: string
  isAdmin?: boolean
  createdAt: string
  updatedAt: string
}

export interface Member {
  userId: string
  name: string
  email: string
  role: "owner" | "editor" | "viewer"
  joinedAt: string
  isOwner?: boolean
}

export interface Workspace {
  id: string
  name: string
  icon: string
  ownerId: string
  members?: Member[]
  createdAt: string
  updatedAt: string
}

export interface PageSummary {
  id: string
  parentId?: string | null
  title: string
  icon: string
  cover: string
  favorite: boolean
  archived: boolean
  order: number
  updatedAt: string
  snippet?: string
}

export interface Page extends PageSummary {
  workspaceId: string
  role?: "owner" | "editor" | "viewer"
  blocks: Block[]
  createdBy: string
  createdAt: string
  archivedAt?: string
}

export interface PageRevision {
  id: string
  pageId: string
  workspaceId: string
  title: string
  icon: string
  cover: string
  blocks?: Block[]
  authorId: string
  authorName: string
  createdAt: string
}

export interface RealtimePresence {
  userId: string
  clientId: string
  name: string
  color: string
  blockId?: string
}

export interface Comment {
  id: string
  pageId: string
  workspaceId: string
  blockId: string
  quote: string
  startOffset: number
  endOffset: number
  body: string
  authorId: string
  authorName: string
  parentId?: string
  resolved: boolean
  createdAt: string
  updatedAt: string
}

export interface AISettings {
  configured: boolean
  provider: string
  providerLabel: string
  model: string
  baseUrl: string
  keyHint?: string
  updatedAt?: string
}

export interface AIChatResponse {
  reply: string
  actions?: string[]
  model: string
  revisionId?: string
}

export interface AIChatMessage {
  role: "user" | "assistant"
  content: string
  actions?: string[]
  revisionId?: string
  undone?: boolean
  stopped?: boolean
}

export interface OpsOIDCSettings {
  enabled: boolean
  issuer: string
  clientId: string
  redirectUrl: string
  name: string
  scopes: string[]
  allowedDomains: string[]
  autoCreate: boolean
  hasClientSecret: boolean
}

export interface OpsSettings {
  appName: string
  allowSignup: boolean
  mcpEnabled: boolean
  aiModel: string
  adminEmails: string[]
  oidc: OpsOIDCSettings
  update: {
    repo: string
    mode: "off" | "check" | "apply"
    intervalHours: number
  }
}

export interface OpsSession {
  configured: boolean
}

export interface OpsStats {
  users: number
  workspaces: number
  pages: number
  archived: number
  comments: number
  revisions: number
  tokens: number
  aiConfigured: number
  dataSize: number
  storageSize: number
}

export interface SystemInfo {
  version: string
  commit: string
  buildDate: string
  repo: string
  checkedAt?: string
  latest?: string
  available?: boolean
  releaseUrl?: string
  publishedAt?: string
}

export interface UpdateCheck {
  version: string
  commit: string
  date: string
  repo: string
  latest?: string
  available: boolean
  releaseUrl?: string
  publishedAt?: string
  error?: string
}
