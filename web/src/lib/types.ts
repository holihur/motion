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
  | "password"
  | "bookmark"
  | "video"
  | "embed"
  | "file"
  | "equation"
  | "toc"
  | "gantt"
  | "chart"
  | "toggle"
  | "toggleHeading1"
  | "toggleHeading2"
  | "toggleHeading3"
  | "pageLink"
  | "breadcrumb"
  | "columns"

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
  /** Client-side encrypted password area. The server never sees plaintext. */
  ciphertext?: string
  salt?: string
  iv?: string
  table?: TableData
  /** 0 = root. Used by toggles and nested content. */
  indent?: number
  collapsed?: boolean
  locked?: boolean
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

export interface WorkspaceSkill {
  id: string
  name: string
  description: string
  instructions: string
}

export interface WorkspaceMCP {
  id: string
  name: string
  url: string
  headers?: Record<string, string>
  enabled: boolean
}

export interface Workspace {
  id: string
  name: string
  icon: string
  ownerId: string
  members?: Member[]
  skills?: WorkspaceSkill[]
  mcpServers?: WorkspaceMCP[]
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
  locked?: boolean
  lockedByName?: string
  order: number
  updatedAt: string
  snippet?: string
}

export interface Page extends PageSummary {
  workspaceId: string
  role?: "owner" | "editor" | "viewer"
  blocksRev?: number
  blocks: Block[]
  createdBy: string
  createdAt: string
  archivedAt?: string
}

export interface Integration {
  provider: string
  config: Record<string, string>
  events?: string[]
  secretHint?: string
  hasSecret: boolean
  updatedAt: string
}

export interface WebhookDelivery {
  id: string
  event: string
  url: string
  status: string
  attempts: number
  responseCode?: number
  error?: string
  createdAt: string
  deliveredAt?: string
}

export interface PublishResult {
  provider: string
  pageId: string
  url: string
  fileCount?: number
  externalId?: string
}

export interface Backlink {
  id: string
  title: string
  icon: string
  updatedAt: string
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
  agentId?: string
  agentName?: string
  mode?: AgentMode
  proposals?: AIProposal[]
}

export type AgentMode = "auto" | "approval"

export interface Agent {
  id: string
  workspaceId: string
  ownerId: string
  name: string
  icon: string
  description?: string
  mode: AgentMode
  scopes: string[]
  enabled: boolean
  isDefault?: boolean
  createdAt: string
  updatedAt: string
}

export interface AIProposal {
  id: string
  workspaceId: string
  pageId: string
  agentId: string
  agentName: string
  actorId: string
  actorName: string
  pageTitle: string
  before?: Page
  after: Page
  created?: boolean
  status: "pending" | "approved" | "rejected"
  createdAt: string
  reviewedAt?: string
  reviewedBy?: string
}

export interface AuditLog {
  id: string
  workspaceId: string
  actorId?: string
  actorName: string
  agentId?: string
  agentName?: string
  action: string
  targetType?: string
  targetId?: string
  summary: string
  createdAt: string
}

export interface AIChatMessage {
  role: "user" | "assistant"
  content: string
  actions?: string[]
  revisionId?: string
  undone?: boolean
  stopped?: boolean
  streaming?: boolean
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
