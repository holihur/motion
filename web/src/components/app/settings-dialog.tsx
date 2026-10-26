import { useEffect, useState } from "react"
import { Check, Copy, KeyRound, LogOut, Sparkles, TerminalSquare, Trash2 } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { api, type AccessToken } from "@/lib/api"
import { getLanguage, setLanguage, tr, type Language } from "@/lib/i18n"
import { cn, formatRelative, initials } from "@/lib/utils"
import { useAuthStore } from "@/stores/auth"
import { useThemeStore, type Theme } from "@/stores/theme"
import { useUIStore } from "@/stores/ui"
import { useWorkspaceStore } from "@/stores/workspace"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Separator } from "@/components/ui/separator"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const WORKSPACE_ICONS = ["🧭", "🌊", "🚀", "🌱", "🔥", "🌸", "📚", "🏠", "🎨", "🧠", "☕", "🪐"]

export function SettingsDialog() {
  const open = useUIStore((state) => state.settingsOpen)
  const setOpen = useUIStore((state) => state.setSettingsOpen)
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-h-[90svh] max-w-2xl gap-0 overflow-y-auto p-0">
        <DialogHeader className="border-b px-6 py-5">
          <DialogTitle>{tr("Settings")}</DialogTitle>
          <DialogDescription>{tr("Your workspace, your rules.")}</DialogDescription>
        </DialogHeader>
        <Tabs defaultValue="profile" className="flex min-h-[360px] flex-col">
          <div className="px-6 pt-4">
            <TabsList className="w-full justify-start bg-transparent p-0">
              <TabsTrigger value="profile" className="data-[state=active]:bg-muted">{tr("Profile")}</TabsTrigger>
              <TabsTrigger value="workspace" className="data-[state=active]:bg-muted">{tr("Workspace")}</TabsTrigger>
              <TabsTrigger value="ai" className="data-[state=active]:bg-muted">{tr("AI")}</TabsTrigger>
            <TabsTrigger value="developer" className="data-[state=active]:bg-muted">{tr("Developer")}</TabsTrigger>
            <TabsTrigger value="appearance" className="data-[state=active]:bg-muted">{tr("Appearance")}</TabsTrigger>
            </TabsList>
          </div>
          <div className="flex-1 px-6 pb-6 pt-2">
            <TabsContent value="profile">
              <ProfileSettings />
            </TabsContent>
            <TabsContent value="workspace">
              <WorkspaceSettings />
            </TabsContent>
            <TabsContent value="ai">
              <AISettings />
            </TabsContent>
            <TabsContent value="developer">
              <DeveloperSettings />
            </TabsContent>
            <TabsContent value="appearance">
              <AppearanceSettings />
            </TabsContent>
          </div>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function ProfileSettings() {
  const user = useAuthStore((state) => state.user)
  const setUser = useAuthStore((state) => state.setUser)
  const [name, setName] = useState(user?.name ?? "")
  const [pending, setPending] = useState(false)

  useEffect(() => setName(user?.name ?? ""), [user?.name])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim() || pending) return
    setPending(true)
    try {
      const updated = await api.auth.updateMe(name.trim())
      setUser(updated)
      toast.success(tr("Profile updated"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update profile")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-6 pt-2">
      <div className="flex items-center gap-4">
        <Avatar className="size-14 text-lg">
          <AvatarFallback className="text-base">{initials(user?.name ?? "M")}</AvatarFallback>
        </Avatar>
        <div>
          <div className="text-sm font-medium">{user?.name}</div>
          <div className="text-xs text-muted-foreground">{user?.email}</div>
        </div>
      </div>
      <Separator />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="profile-name">{tr("Display name")}</Label>
          <Input id="profile-name" value={name} onChange={(event) => setName(event.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="profile-email">{tr("Email")}</Label>
          <Input id="profile-email" value={user?.email ?? ""} disabled />
        </div>
      </div>
      <div className="flex justify-end">
        <Button type="submit" disabled={!name.trim() || pending || name.trim() === user?.name}>
          Save changes
        </Button>
      </div>
    </form>
  )
}

function WorkspaceSettings() {
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const activeId = useWorkspaceStore((state) => state.activeId)
  const updateWorkspace = useWorkspaceStore((state) => state.updateWorkspace)
  const deleteWorkspace = useWorkspaceStore((state) => state.deleteWorkspace)
  const workspace = workspaces.find((item) => item.id === activeId)
  const [name, setName] = useState(workspace?.name ?? "")
  const [icon, setIcon] = useState(workspace?.icon ?? "🧭")
  const [pending, setPending] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    setName(workspace?.name ?? "")
    setIcon(workspace?.icon ?? "🧭")
  }, [workspace?.id, workspace?.name, workspace?.icon])

  if (!workspace) return <p className="pt-4 text-sm text-muted-foreground">No workspace selected.</p>

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim() || pending) return
    setPending(true)
    try {
      await updateWorkspace(workspace!.id, { name: name.trim(), icon })
      toast.success(tr("Workspace updated"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update workspace")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="space-y-6 pt-2">
      <form onSubmit={save} className="space-y-4">
        <div className="space-y-2">
          <Label>{tr("Icon")}</Label>
          <div className="flex flex-wrap gap-1.5">
            {WORKSPACE_ICONS.map((item) => (
              <button
                key={item}
                type="button"
                onClick={() => setIcon(item)}
                className={cn(
                  "flex size-9 items-center justify-center rounded-lg border text-lg transition hover:bg-accent",
                  item === icon ? "border-brand bg-brand-soft" : "border-border",
                )}
              >
                {item}
              </button>
            ))}
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="workspace-settings-name">{tr("Workspace name")}</Label>
          <Input
            id="workspace-settings-name"
            value={name}
            onChange={(event) => setName(event.target.value)}
          />
        </div>
        <div className="flex justify-end">
          <Button type="submit" disabled={!name.trim() || pending || (name.trim() === workspace.name && icon === workspace.icon)}>
            Save workspace
          </Button>
        </div>
      </form>

      <Separator />

      <div className="flex flex-col gap-3 rounded-lg border border-destructive/25 bg-destructive/5 p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-medium text-destructive">{tr("Delete workspace")}</div>
          <div className="text-xs text-muted-foreground">
            Every page in “{workspace.name}” will be permanently removed.
          </div>
        </div>
        <Button variant="destructive" size="sm" onClick={() => setConfirmOpen(true)}>
          <Trash2 /> Delete
        </Button>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tr("Delete “{name}”?", { name: workspace.name })}</DialogTitle>
            <DialogDescription>
              {tr("This cannot be undone. All pages and content in this workspace will be destroyed.")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>{tr("Cancel")}</Button>
            <Button
              variant="destructive"
              onClick={() => {
                void deleteWorkspace(workspace!.id)
                  .then(() => {
                    toast.success("Workspace deleted")
                    setConfirmOpen(false)
                  })
                  .catch((error) =>
                    toast.error(error instanceof Error ? error.message : "Could not delete workspace"),
                  )
              }}
            >
              Delete forever
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

const AI_PROVIDERS = {
  deepseek: { label: "DeepSeek", base: "https://api.deepseek.com", model: "deepseek-chat", key: true, hint: "Your DeepSeek API key (sk-…)" },
  openai: { label: "OpenAI", base: "https://api.openai.com/v1", model: "gpt-5-mini", key: true, hint: "sk-…" },
  openrouter: { label: "OpenRouter", base: "https://openrouter.ai/api/v1", model: "openai/gpt-5-mini", key: true, hint: "sk-or-…" },
  groq: { label: "Groq", base: "https://api.groq.com/openai/v1", model: "openai/gpt-oss-120b", key: true, hint: "gsk_…" },
  ollama: { label: "Ollama (local)", base: "http://localhost:11434/v1", model: "qwen3:8b", key: false, hint: "No key needed for a local Ollama server" },
  custom: { label: "Custom OpenAI-compatible", base: "", model: "", key: true, hint: "Your provider API key" },
  gemini: { label: "Google Gemini (ADK native)", base: "", model: "gemini-flash-lite-latest", key: true, hint: "AIza…" },
} as const

type AIProviderKey = keyof typeof AI_PROVIDERS

const AI_MODEL_SUGGESTIONS: Record<AIProviderKey, string[]> = {
  deepseek: ["deepseek-chat", "deepseek-reasoner"],
  openai: ["gpt-5-mini", "gpt-5", "gpt-4.1"],
  openrouter: ["openai/gpt-5-mini", "anthropic/claude-sonnet-4.5", "google/gemini-flash-lite-latest"],
  groq: ["openai/gpt-oss-120b", "openai/gpt-oss-20b", "llama-3.3-70b-versatile"],
  ollama: ["qwen3:8b", "qwen3:32b", "llama3.2", "deepseek-r1:8b"],
  custom: [],
  gemini: ["gemini-flash-lite-latest", "gemini-flash-latest", "gemini-pro-latest"],
}

function AISettings() {
  const user = useAuthStore((state) => state.user)
  const [loading, setLoading] = useState(true)
  const [configured, setConfigured] = useState(false)
  const [keyHint, setKeyHint] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [provider, setProvider] = useState<AIProviderKey>("deepseek")
  const [model, setModel] = useState("deepseek-chat")
  const [baseUrl, setBaseUrl] = useState("https://api.deepseek.com")
  const [pending, setPending] = useState(false)
  const [testing, setTesting] = useState(false)
  const providerInfo = AI_PROVIDERS[provider]

  useEffect(() => {
    api.ai
      .settings()
      .then((settings) => {
        setConfigured(settings.configured)
        setKeyHint(settings.keyHint ?? "")
        const nextProvider = (settings.provider in AI_PROVIDERS ? settings.provider : "deepseek") as AIProviderKey
        setProvider(nextProvider)
        setModel(settings.model || AI_PROVIDERS[nextProvider].model)
        setBaseUrl(settings.baseUrl || AI_PROVIDERS[nextProvider].base)
      })
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [user?.id])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (pending) return
    if (!configured && providerInfo.key && !apiKey.trim()) {
      toast.error(`Paste your ${providerInfo.label} API key first`)
      return
    }
    setPending(true)
    try {
      const settings = await api.ai.saveSettings({
        provider,
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : { apiKey: "" }),
        model: model.trim(),
        baseUrl: baseUrl.trim(),
      })
      setConfigured(settings.configured)
      setKeyHint(settings.keyHint ?? "")
      setApiKey("")
      toast.success("AI provider saved securely")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save AI settings")
    } finally {
      setPending(false)
    }
  }

  async function remove() {
    setPending(true)
    try {
      await api.ai.removeSettings()
      setConfigured(false)
      setKeyHint("")
      setApiKey("")
      toast.success("AI provider removed")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove AI key")
    } finally {
      setPending(false)
    }
  }

  async function testConnection() {
    if (testing) return
    setTesting(true)
    try {
      const result = await api.ai.test()
      toast.success(tr("Connection works"), {
        description: `${result.model} · ${result.latencyMs}ms · ${result.message.slice(0, 60)}`,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Connection test failed"))
    } finally {
      setTesting(false)
    }
  }

  return (
    <form onSubmit={save} className="space-y-5 pt-2">
      <div className="flex items-start gap-3 rounded-xl border border-brand/20 bg-brand-soft/30 p-3.5">
        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg brand-gradient text-white">
          <Sparkles className="size-4" />
        </span>
        <div className="min-w-0 text-xs leading-5 text-muted-foreground">
          <div className="font-medium text-foreground">{tr("Bring your own AI provider")}</div>
          <p className="mt-0.5">
            Use your own key with DeepSeek, OpenAI, OpenRouter, Groq, Ollama or Gemini. Keys are encrypted on the server and never sent to the browser.
          </p>
        </div>
      </div>

      {loading ? (
        <div className="h-24 animate-pulse rounded-lg bg-muted/60" />
      ) : (
        <>
          <div className="space-y-2">
            <Label htmlFor="ai-provider">{tr("Provider")}</Label>
            <select
              id="ai-provider"
              value={provider}
              onChange={(event) => {
                const next = event.target.value as AIProviderKey
                setProvider(next)
                setModel(AI_PROVIDERS[next].model)
                setBaseUrl(AI_PROVIDERS[next].base)
                setApiKey("")
              }}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm outline-none"
            >
              {Object.entries(AI_PROVIDERS).map(([value, details]) => (
                <option key={value} value={value}>{details.label}</option>
              ))}
            </select>
            <p className="text-[11px] text-muted-foreground">
              DeepSeek is the default. Any OpenAI-compatible endpoint works.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="ai-api-key">{providerInfo.label} API key</Label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="ai-api-key"
                type="password"
                autoComplete="off"
                value={apiKey}
                onChange={(event) => setApiKey(event.target.value)}
                placeholder={configured ? `Saved key ${keyHint}` : providerInfo.hint}
                className="pl-9 font-mono text-xs"
              />
            </div>
            <p className="text-[11px] text-muted-foreground">
              {providerInfo.key
                ? configured
                  ? "A key is saved. Leave this blank to keep it, or paste a new key to replace it."
                  : "Stored with AES-256-GCM encryption. Only this server can decrypt it."
                : "Ollama runs locally — no API key is required."}
            </p>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="ai-model">{tr("Model")}</Label>
              <Input id="ai-model" value={model} onChange={(event) => setModel(event.target.value)} list="ai-models" />
              <datalist id="ai-models">
                {AI_MODEL_SUGGESTIONS[provider].map((suggestion) => (
                  <option key={suggestion} value={suggestion} />
                ))}
              </datalist>
              <p className="text-[10px] text-muted-foreground">
                {tr("Any model ID is accepted — type the latest model from your provider if it is not listed.")}
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="ai-base-url">{tr("Base URL")}</Label>
              <Input id="ai-base-url" value={baseUrl} onChange={(event) => setBaseUrl(event.target.value)} placeholder={providerInfo.base || "https://…"} />
            </div>
          </div>
          <p className="-mt-2 text-[11px] text-muted-foreground">
            The AI document agent uses this model and key. For OpenAI-compatible servers the base URL should end with <code>/v1</code>.
          </p>

          <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-4">
            <div className="flex flex-wrap items-center gap-2">
              {configured ? (
                <Button type="button" variant="outline" size="sm" onClick={() => void remove()} disabled={pending}>
                  <Trash2 /> {tr("Remove provider")}
                </Button>
              ) : (
                <span className="text-[11px] text-muted-foreground">{tr("No provider configured yet.")}</span>
              )}
              {configured && (
                <Button type="button" variant="outline" size="sm" onClick={() => void testConnection()} disabled={testing || pending}>
                  {testing ? <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" /> : <Check className="size-3.5" />}
                  {tr("Test connection")}
                </Button>
              )}
            </div>
            <Button type="submit" size="sm" disabled={pending}>
              {pending && <span className="size-3 animate-spin rounded-full border-2 border-current border-t-transparent" />}
              {tr("Save AI settings")}
            </Button>
          </div>
        </>
      )}
    </form>
  )
}

const SCOPES = [
  { value: "pages:read", label: "Read pages" },
  { value: "pages:write", label: "Edit pages" },
  { value: "workspace:read", label: "Read workspace" },
  { value: "workspace:write", label: "Manage workspace" },
  { value: "ai:use", label: "Use AI agent" },
]

function DeveloperSettings() {
  const [tokens, setTokens] = useState<AccessToken[]>([])
  const [loading, setLoading] = useState(true)
  const [name, setName] = useState("MCP client")
  const [scopes, setScopes] = useState<string[]>(["pages:read", "pages:write"])
  const [expiry, setExpiry] = useState("90")
  const [pending, setPending] = useState(false)
  const [newToken, setNewToken] = useState("")
  const origin = typeof window !== "undefined" ? window.location.origin : "http://localhost:8787"

  useEffect(() => {
    api.workspaces
      .tokens()
      .then(setTokens)
      .catch(() => undefined)
      .finally(() => setLoading(false))
  }, [])

  function toggleScope(scope: string) {
    setScopes((current) =>
      current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope],
    )
  }

  async function create(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim() || scopes.length === 0 || pending) return
    setPending(true)
    try {
      const result = await api.workspaces.createToken({
        name: name.trim(),
        scopes,
        expiresInDays: expiry === "never" ? 0 : Number(expiry),
      })
      setNewToken(result.token)
      setTokens((current) => [result.accessToken, ...current])
      toast.success("Access token created", {
        description: "Copy it now — you won't be able to see it again.",
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create token")
    } finally {
      setPending(false)
    }
  }

  async function revoke(token: AccessToken) {
    try {
      await api.workspaces.revokeToken(token.id)
      setTokens((current) => current.filter((item) => item.id !== token.id))
      toast.success("Token revoked")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not revoke token")
    }
  }

  const mcpConfig = JSON.stringify(
    {
      mcpServers: {
        motion: {
          type: "http",
          url: `${origin}/mcp`,
          headers: { Authorization: `Bearer ${newToken || "motion_pat_…"}` },
        },
      },
    },
    null,
    2,
  )

  return (
    <div className="space-y-6 pt-2">
      <div className="rounded-xl border border-border/80 bg-muted/20 p-3.5">
        <div className="flex items-center gap-2 text-sm font-medium">
          <TerminalSquare className="size-4 text-brand" /> {tr("Personal access tokens & MCP")}
        </div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Use scoped tokens with the API or connect an MCP client to <code className="rounded bg-background px-1 py-0.5 text-[10px]">{origin}/mcp</code>.
          Tokens are shown once and can be revoked at any time.
        </p>
      </div>

      <form onSubmit={create} className="space-y-4 rounded-xl border p-4">
        <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
          <div className="space-y-2">
            <Label htmlFor="token-name">{tr("Token name")}</Label>
            <Input id="token-name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Claude Desktop" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="token-expiry">{tr("Expires")}</Label>
            <select
              id="token-expiry"
              value={expiry}
              onChange={(event) => setExpiry(event.target.value)}
              className="h-9 w-full rounded-md border bg-background px-2 text-xs outline-none"
            >
              <option value="30">{tr("30 days")}</option>
              <option value="90">90 days</option>
              <option value="365">{tr("1 year")}</option>
              <option value="never">{tr("Never")}</option>
            </select>
          </div>
        </div>
        <div className="space-y-2">
          <Label>{tr("Scopes")}</Label>
          <div className="flex flex-wrap gap-1.5">
            {SCOPES.map((scope) => (
              <button
                key={scope.value}
                type="button"
                onClick={() => toggleScope(scope.value)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] transition",
                  scopes.includes(scope.value)
                    ? "border-brand bg-brand-soft text-brand"
                    : "border-border text-muted-foreground hover:bg-accent",
                )}
              >
                {scopes.includes(scope.value) && <Check className="size-3" />}
                {scope.label}
                <span className="font-mono text-[9px] opacity-60">{scope.value}</span>
              </button>
            ))}
          </div>
        </div>
        <div className="flex justify-end">
          <Button type="submit" size="sm" disabled={pending || !name.trim() || scopes.length === 0}>
            <KeyRound className="size-3.5" /> {tr("Create token")}
          </Button>
        </div>
      </form>

      {newToken && (
        <div className="space-y-3 rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-4">
          <div className="flex items-center gap-2 text-xs font-medium text-emerald-700 dark:text-emerald-300">
            <Check className="size-3.5" /> Copy your token now — it will not be shown again
          </div>
          <div className="flex gap-1.5">
            <code className="min-w-0 flex-1 overflow-x-auto rounded-md border bg-background px-2 py-1.5 font-mono text-[10px] thin-scrollbar">
              {newToken}
            </code>
            <Button
              type="button"
              variant="outline"
              size="icon-sm"
              onClick={() => void navigator.clipboard.writeText(newToken).then(() => toast.success("Token copied"))}
              aria-label="Copy token"
            >
              <Copy className="size-3.5" />
            </Button>
          </div>
          <div>
            <div className="mb-1 flex items-center justify-between text-[11px] text-muted-foreground">
              <span>MCP client configuration</span>
              <button
                type="button"
                onClick={() => void navigator.clipboard.writeText(mcpConfig).then(() => toast.success("MCP config copied"))}
                className="font-medium text-brand hover:underline"
              >
                Copy JSON
              </button>
            </div>
            <pre className="max-h-48 overflow-auto rounded-md border bg-background p-2.5 font-mono text-[10px] leading-5 thin-scrollbar">
              {mcpConfig}
            </pre>
          </div>
        </div>
      )}

      <div>
        <div className="mb-2 flex items-center justify-between">
          <Label>{tr("Active tokens")}</Label>
          <span className="text-[11px] text-muted-foreground">{tokens.length}</span>
        </div>
        {loading ? (
          <div className="h-16 animate-pulse rounded-lg bg-muted/60" />
        ) : tokens.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
            {tr("No tokens yet.")}
          </p>
        ) : (
          <div className="divide-y overflow-hidden rounded-lg border">
            {tokens.map((token) => (
              <div key={token.id} className="flex items-center gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate text-xs font-medium">{token.name}</span>
                    <code className="text-[9px] text-muted-foreground">{token.prefix}…</code>
                  </div>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {token.scopes.map((scope) => (
                      <span key={scope} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                        {scope}
                      </span>
                    ))}
                  </div>
                  <div className="mt-1 text-[10px] text-muted-foreground">
                    Created {formatRelative(token.createdAt)}
                    {token.lastUsedAt ? ` · used ${formatRelative(token.lastUsedAt)}` : " · never used"}
                    {token.expiresAt ? ` · expires ${formatRelative(token.expiresAt)}` : " · no expiry"}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                  onClick={() => void revoke(token)}
                  aria-label={`Revoke ${token.name}`}
                >
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function AppearanceSettings() {
  const theme = useThemeStore((state) => state.theme)
  const setTheme = useThemeStore((state) => state.setTheme)
  const logout = useAuthStore((state) => state.logout)
  const setOpen = useUIStore((state) => state.setSettingsOpen)
  const navigate = useNavigate()

  const options: { value: Theme; label: string; hint: string; preview: React.ReactNode }[] = [
    {
      value: "light",
      label: tr("Light"),
      hint: tr("Bright and airy"),
      preview: (
        <div className="space-y-1.5 rounded-md bg-white p-2 shadow-inner ring-1 ring-black/5">
          <div className="h-1.5 w-8 rounded bg-neutral-300" />
          <div className="h-1 w-12 rounded bg-neutral-200" />
          <div className="h-1 w-10 rounded bg-neutral-200" />
        </div>
      ),
    },
    {
      value: "dark",
      label: tr("Dark"),
      hint: tr("Easy on the eyes"),
      preview: (
        <div className="space-y-1.5 rounded-md bg-neutral-900 p-2 shadow-inner ring-1 ring-white/10">
          <div className="h-1.5 w-8 rounded bg-neutral-600" />
          <div className="h-1 w-12 rounded bg-neutral-700" />
          <div className="h-1 w-10 rounded bg-neutral-700" />
        </div>
      ),
    },
    {
      value: "system",
      label: tr("System"),
      hint: tr("Follow your device"),
      preview: (
        <div className="flex gap-1.5">
          <div className="h-full w-1/2 space-y-1.5 rounded-md bg-white p-2 ring-1 ring-black/5">
            <div className="h-1.5 w-6 rounded bg-neutral-300" />
            <div className="h-1 w-8 rounded bg-neutral-200" />
          </div>
          <div className="h-full w-1/2 space-y-1.5 rounded-md bg-neutral-900 p-2 ring-1 ring-white/10">
            <div className="h-1.5 w-6 rounded bg-neutral-600" />
            <div className="h-1 w-8 rounded bg-neutral-700" />
          </div>
        </div>
      ),
    },
  ]

  return (
    <div className="space-y-6 pt-2">
      <div>
        <h3 className="text-sm font-medium">{tr("Theme")}</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">{tr("Choose how Motion looks on this device.")}</p>
        <div className="mt-4 grid grid-cols-3 gap-3">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setTheme(option.value)}
              className={cn(
                "rounded-xl border p-3 text-left transition hover:bg-accent/50",
                theme === option.value ? "border-brand ring-2 ring-brand/15" : "border-border",
              )}
            >
              <div className="mb-3 h-16 rounded-lg border border-border/60 bg-muted/40 p-2">
                {option.preview}
              </div>
              <div className="text-sm font-medium">{option.label}</div>
              <div className="text-[11px] text-muted-foreground">{option.hint}</div>
            </button>
          ))}
        </div>
      </div>
      <Separator />
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">{tr("Language")}</div>
          <div className="text-xs text-muted-foreground">English / 中文</div>
        </div>
        <select
          value={getLanguage()}
          onChange={(event) => setLanguage(event.target.value as Language)}
          className="h-8 rounded-md border bg-background px-2 text-xs outline-none"
          aria-label={tr("Language")}
        >
          <option value="en">{tr("English")}</option>
          <option value="zh">{tr("中文")}</option>
        </select>
      </div>
      <Separator />
      <div className="flex items-center justify-between">
        <div>
          <div className="text-sm font-medium">{tr("Sign out")}</div>
          <div className="text-xs text-muted-foreground">{tr("You can always come back.")}</div>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            logout()
            setOpen(false)
            navigate("/login", { replace: true })
          }}
        >
          <LogOut /> {tr("Sign out")}
        </Button>
      </div>
    </div>
  )
}
