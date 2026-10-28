import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Globe2,
  KeyRound,
  Loader2,
  LockKeyhole,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { api, ApiError } from "@/lib/api"
import type { OpsSettings, OpsStats } from "@/lib/types"
import { LogoMark } from "@/components/logo"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"

const OIDC_PRESETS = {
  google: {
    label: "Google",
    issuer: "https://accounts.google.com",
    name: "Continue with Google",
    scopes: "openid, email, profile",
  },
  microsoft: {
    label: "Microsoft Entra ID",
    issuer: "https://login.microsoftonline.com/{tenant-id}/v2.0",
    name: "Continue with Microsoft",
    scopes: "openid, email, profile",
  },
  keycloak: {
    label: "Keycloak",
    issuer: "https://keycloak.example.com/realms/your-realm",
    name: "Continue with Keycloak",
    scopes: "openid, email, profile",
  },
  auth0: {
    label: "Auth0",
    issuer: "https://your-tenant.us.auth0.com/",
    name: "Continue with Auth0",
    scopes: "openid, email, profile",
  },
  authentik: {
    label: "Authentik",
    issuer: "https://authentik.example.com/application/o/motion/",
    name: "Continue with Authentik",
    scopes: "openid, email, profile",
  },
  custom: { label: "Custom provider", issuer: "", name: "Continue with SSO", scopes: "openid, email, profile" },
} as const

const OPS_TOKEN_KEY = "motion.ops.token"

export function OpsView() {
  const navigate = useNavigate()
  const [token, setToken] = useState(() => sessionStorage.getItem(OPS_TOKEN_KEY) ?? "")
  const [tokenInput, setTokenInput] = useState("")
  const [gateError, setGateError] = useState("")
  const [settings, setSettings] = useState<OpsSettings | null>(null)
  const [stats, setStats] = useState<OpsStats | null>(null)
  const [loading, setLoading] = useState(() => !!sessionStorage.getItem(OPS_TOKEN_KEY))
  const [pending, setPending] = useState(false)
  const [error, setError] = useState("")
  const [secret, setSecret] = useState("")
  const [clearSecret, setClearSecret] = useState(false)
  const [adminEmails, setAdminEmails] = useState("")
  const [scopes, setScopes] = useState("")
  const [domains, setDomains] = useState("")
  const [updateCheck, setUpdateCheck] = useState<import("@/lib/types").UpdateCheck | null>(null)
  const [checking, setChecking] = useState(false)
  const [applying, setApplying] = useState(false)
  const [version, setVersion] = useState("")

  useEffect(() => {
    if (!token) {
      setLoading(false)
      return
    }
    let alive = true
    setLoading(true)
    setError("")
    Promise.all([api.ops.settings(token), api.ops.stats(token), api.system.info()])
      .then(([next, counts, info]) => {
        if (!alive) return
        setVersion(info.version)
        setSettings(next)
        setStats(counts)
        setAdminEmails(((next.adminEmails ?? []).length ? next.adminEmails : [""]).filter(Boolean).join(", "))
        setScopes((next.oidc.scopes ?? []).join(", "))
        setDomains((next.oidc.allowedDomains ?? []).join(", "))
        setGateError("")
      })
      .catch((err) => {
        if (!alive) return
        const message = err instanceof Error ? err.message : "Could not load Ops settings"
        if (err instanceof ApiError && [401, 403, 503].includes(err.status)) {
          sessionStorage.removeItem(OPS_TOKEN_KEY)
          setToken("")
          setSettings(null)
          setGateError(message)
        } else {
          setError(message)
        }
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [token])

  function unlock(event: React.FormEvent) {
    event.preventDefault()
    const next = tokenInput.trim()
    if (!next) return
    sessionStorage.setItem(OPS_TOKEN_KEY, next)
    setGateError("")
    setToken(next)
  }

  function lock() {
    sessionStorage.removeItem(OPS_TOKEN_KEY)
    setToken("")
    setTokenInput("")
    setSettings(null)
    setStats(null)
    setError("")
    setGateError("")
  }

  if (!token) {
    return <OpsGate token={tokenInput} onTokenChange={setTokenInput} onSubmit={unlock} error={gateError} />
  }

  function patch(next: Partial<OpsSettings>) {
    setSettings((current) => (current ? { ...current, ...next } : current))
  }

  function patchOIDC(next: Partial<OpsSettings["oidc"]>) {
    setSettings((current) => (current ? { ...current, oidc: { ...current.oidc, ...next } } : current))
  }

  function applyOIDCPreset(value: keyof typeof OIDC_PRESETS) {
    const preset = OIDC_PRESETS[value]
    if (value === "custom") return
    patchOIDC({ issuer: preset.issuer, name: preset.name })
    setScopes(preset.scopes)
  }

  async function save() {
    if (!settings || pending) return
    setPending(true)
    try {
      if (!token) return
      const saved = await api.ops.saveSettings(token, {
        version: settings.version,
        appName: settings.appName,
        allowSignup: settings.allowSignup,
        mcpEnabled: settings.mcpEnabled,
        aiModel: settings.aiModel,
        adminEmails: adminEmails.split(",").map((item) => item.trim()).filter(Boolean),
        trashRetentionDays: settings.trashRetentionDays,
        oidc: {
          enabled: settings.oidc.enabled,
          issuer: settings.oidc.issuer,
          clientId: settings.oidc.clientId,
          redirectUrl: settings.oidc.redirectUrl,
          name: settings.oidc.name,
          autoCreate: settings.oidc.autoCreate,
          scopes: scopes.split(",").map((item) => item.trim()).filter(Boolean),
          allowedDomains: domains.split(",").map((item) => item.trim()).filter(Boolean),
          clientSecret: secret.trim() || undefined,
          clearClientSecret: clearSecret,
        },
        maps: settings.maps,
        update: settings.update,
      })
      setSettings(saved)
      setAdminEmails(saved.adminEmails.join(", "))
      setSecret("")
      setClearSecret(false)
      toast.success("Ops settings saved")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not save settings")
    } finally {
      setPending(false)
    }
  }

  async function installUpdate() {
    if (!updateCheck?.available || applying) return
    setApplying(true)
    try {
      if (!token) return
      const result = await api.ops.applyUpdate(token)
      toast.success(`Updated to ${result.version}`, {
        description: result.restarting ? "Motion is restarting now." : "Restart Motion to finish.",
        duration: 8000,
      })
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not install the update")
    } finally {
      setApplying(false)
    }
  }

  async function checkUpdate() {
    setChecking(true)
    try {
      if (!token) return
      const result = await api.ops.checkUpdate(token)
      setUpdateCheck(result)
      if (!result.latest) toast("No update information available yet")
      else if (result.available) toast(`Update available: ${result.latest}`)
      else toast.success("Motion is up to date")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not check for updates")
    } finally {
      setChecking(false)
    }
  }

  return (
    <div className="flex h-svh flex-col bg-background">
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border/70 px-3">
        <LogoMark className="size-6 rounded-md" />
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ShieldCheck className="size-3.5 text-brand" />
          <span className="font-medium text-foreground">Ops console</span>
          <span className="text-muted-foreground/50">/</span>
          <span>Instance configuration</span>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("/")}>
            Back to workspace
          </Button>
          <Button variant="outline" size="sm" className="gap-1.5" onClick={lock}>
            <LockKeyhole className="size-3.5" /> Lock Ops
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => void save()} disabled={pending || !settings}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            Save changes
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto thin-scrollbar">
        <div className="mx-auto w-full max-w-4xl px-5 pb-24 pt-8 sm:px-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                <ShieldCheck className="size-5 text-brand" /> Ops
                <span className="rounded-full bg-muted px-2 py-0.5 font-mono text-[10px] font-normal text-muted-foreground">
                  v{version || "dev"}
                </span>
              </h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Configure this Motion instance without touching the command line. Saved values override environment defaults.
              </p>
            </div>
            {(updateCheck || checking) && (
              <div className="hidden items-center gap-2 rounded-lg border px-3 py-2 text-xs sm:flex">
                {checking ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                {updateCheck?.latest
                  ? updateCheck.available
                    ? `Update available: ${updateCheck.latest}`
                    : "Up to date"
                  : "Checking…"}
              </div>
            )}
          </div>

          {error ? (
            <div className="mt-8 flex items-start gap-2 rounded-xl border border-destructive/25 bg-destructive/5 p-4 text-sm text-destructive">
              <AlertTriangle className="mt-0.5 size-4 shrink-0" />
              {error}
            </div>
          ) : loading || !settings ? (
            <div className="mt-8 space-y-4">
              <Skeleton className="h-40 w-full rounded-xl" />
              <Skeleton className="h-64 w-full rounded-xl" />
              <Skeleton className="h-40 w-full rounded-xl" />
            </div>
          ) : (
            <div className="mt-8 space-y-6">
              <section className="rounded-2xl border bg-card p-5">
                <SectionTitle icon={Globe2} title="General" description="How people join and what the instance is called." />
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="ops-app-name">Instance name</Label>
                    <Input
                      id="ops-app-name"
                      value={settings.appName}
                      onChange={(event) => patch({ appName: event.target.value })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="ops-ai-model">Default Gemini model</Label>
                    <Input
                      id="ops-ai-model"
                      value={settings.aiModel}
                      onChange={(event) => patch({ aiModel: event.target.value })}
                      placeholder="gemini-flash-lite-latest"
                      list="ops-ai-models"
                    />
                    <datalist id="ops-ai-models">
                      <option value="gemini-flash-lite-latest" />
                      <option value="gemini-flash-latest" />
                      <option value="gemini-pro-latest" />
                      <option value="gemini-3.1-flash-lite" />
                    </datalist>
                    <p className="text-[10px] text-muted-foreground">
                      Used only for the native Gemini provider. Users can override model IDs in Settings → AI.
                    </p>
                  </div>
                </div>
                <div className="mt-5 space-y-3">
                  <div className="space-y-2">
                    <Label htmlFor="ops-trash-retention">Trash retention (days)</Label>
                    <Input
                      id="ops-trash-retention"
                      type="number"
                      min={0}
                      max={3650}
                      value={settings.trashRetentionDays}
                      onChange={(event) => patch({ trashRetentionDays: Math.max(0, Number(event.target.value) || 0) })}
                    />
                    <p className="text-[10px] text-muted-foreground">0 keeps archived pages forever. Older leaf pages are permanently removed every six hours.</p>
                  </div>
                  <ToggleRow
                    title="Allow new sign-ups"
                    description="People can create an account with email and password."
                    checked={settings.allowSignup}
                    onChange={(checked) => patch({ allowSignup: checked })}
                  />
                  <ToggleRow
                    title="Enable MCP endpoint"
                    description="Expose /mcp to personal access tokens with scoped permissions."
                    checked={settings.mcpEnabled}
                    onChange={(checked) => patch({ mcpEnabled: checked })}
                  />
                </div>
                <div className="mt-4 space-y-2">
                  <Label htmlFor="ops-admins">Administrator emails</Label>
                  <Input
                    id="ops-admins"
                    value={adminEmails}
                    onChange={(event) => setAdminEmails(event.target.value)}
                    placeholder="you@example.com, teammate@example.com"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Comma separated. Your own email must remain in this list to avoid lockout.
                  </p>
                </div>
              </section>

              <section className="rounded-2xl border bg-card p-5">
                <SectionTitle
                  icon={Globe2}
                  title="Map providers"
                  description="Client keys for map blocks. Mapbox is the default; Google, Amap and Baidu fall back to their keyless embeds when a key is empty."
                />
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Mapbox access token" htmlFor="ops-mapbox-token">
                    <Input id="ops-mapbox-token" value={settings.maps.mapboxToken} onChange={(event) => patch({ maps: { ...settings.maps, mapboxToken: event.target.value } })} placeholder="pk.…" />
                  </Field>
                  <Field label="Google Maps API key" htmlFor="ops-google-maps-key">
                    <Input id="ops-google-maps-key" value={settings.maps.googleMapsKey} onChange={(event) => patch({ maps: { ...settings.maps, googleMapsKey: event.target.value } })} placeholder="Optional" />
                  </Field>
                  <Field label="Amap (高德) key" htmlFor="ops-amap-key">
                    <Input id="ops-amap-key" value={settings.maps.amapKey} onChange={(event) => patch({ maps: { ...settings.maps, amapKey: event.target.value } })} placeholder="Optional" />
                  </Field>
                  <Field label="Baidu Map AK" htmlFor="ops-baidu-map-ak">
                    <Input id="ops-baidu-map-ak" value={settings.maps.baiduMapAK} onChange={(event) => patch({ maps: { ...settings.maps, baiduMapAK: event.target.value } })} placeholder="Optional" />
                  </Field>
                </div>
              </section>

              <section className="rounded-2xl border bg-card p-5">
                <SectionTitle
                  icon={ShieldCheck}
                  title="Single sign-on (OIDC)"
                  description="Connect any OpenID Connect provider. Leave disabled to use email and password only."
                />
                <div className="mt-4">
                  <ToggleRow
                    title="Enable OIDC sign-in"
                    description="Shows a single sign-on button on the login page."
                    checked={settings.oidc.enabled}
                    onChange={(checked) => patchOIDC({ enabled: checked })}
                  />
                </div>
                <div className="mt-4">
                  <Field label="Provider preset" htmlFor="ops-oidc-preset" hint="Fills the issuer and scopes. Replace the tenant placeholders.">
                    <select
                      id="ops-oidc-preset"
                      defaultValue=""
                      onChange={(event) => applyOIDCPreset(event.target.value as keyof typeof OIDC_PRESETS)}
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm outline-none sm:max-w-xs"
                    >
                      <option value="" disabled>Choose a preset…</option>
                      {Object.entries(OIDC_PRESETS).map(([value, preset]) => (
                        <option key={value} value={value}>{preset.label}</option>
                      ))}
                    </select>
                  </Field>
                </div>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Field label="Issuer URL" htmlFor="ops-oidc-issuer">
                    <Input
                      id="ops-oidc-issuer"
                      value={settings.oidc.issuer}
                      onChange={(event) => patchOIDC({ issuer: event.target.value })}
                      placeholder="https://accounts.google.com"
                    />
                  </Field>
                  <Field label="Client ID" htmlFor="ops-oidc-client">
                    <Input
                      id="ops-oidc-client"
                      value={settings.oidc.clientId}
                      onChange={(event) => patchOIDC({ clientId: event.target.value })}
                    />
                  </Field>
                  <Field label="Client secret" htmlFor="ops-oidc-secret">
                    <Input
                      id="ops-oidc-secret"
                      type="password"
                      value={secret}
                      onChange={(event) => {
                        setSecret(event.target.value)
                        if (event.target.value) setClearSecret(false)
                      }}
                      placeholder={settings.oidc.hasClientSecret ? "•••••••• saved" : "Client secret"}
                    />
                    {settings.oidc.hasClientSecret && (
                      <label className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <input
                          type="checkbox"
                          checked={clearSecret}
                          onChange={(event) => setClearSecret(event.target.checked)}
                        />
                        Remove the saved secret
                      </label>
                    )}
                  </Field>
                  <Field label="Button label" htmlFor="ops-oidc-name">
                    <Input
                      id="ops-oidc-name"
                      value={settings.oidc.name}
                      onChange={(event) => patchOIDC({ name: event.target.value })}
                      placeholder="Continue with Google"
                    />
                  </Field>
                  <Field label="Callback URL" htmlFor="ops-oidc-redirect" hint="Leave empty to derive it from the request host.">
                    <Input
                      id="ops-oidc-redirect"
                      value={settings.oidc.redirectUrl}
                      onChange={(event) => patchOIDC({ redirectUrl: event.target.value })}
                      placeholder={`${window.location.origin}/api/auth/oidc/callback`}
                    />
                    <button
                      type="button"
                      onClick={() => {
                        const url = settings.oidc.redirectUrl || `${window.location.origin}/api/auth/oidc/callback`
                        void navigator.clipboard.writeText(url).then(
                          () => toast.success("Callback URL copied"),
                          () => toast.error("Could not copy callback URL"),
                        )
                      }}
                      className="text-left text-[11px] font-medium text-brand hover:underline"
                    >
                      Copy callback URL
                    </button>
                  </Field>
                  <Field label="Scopes" htmlFor="ops-oidc-scopes" hint="Comma separated.">
                    <Input id="ops-oidc-scopes" value={scopes} onChange={(event) => setScopes(event.target.value)} />
                  </Field>
                  <Field label="Allowed email domains" htmlFor="ops-oidc-domains" hint="Optional. Comma separated.">
                    <Input id="ops-oidc-domains" value={domains} onChange={(event) => setDomains(event.target.value)} />
                  </Field>
                </div>
                <div className="mt-4">
                  <ToggleRow
                    title="Create accounts on first sign-in"
                    description="When off, an administrator must create the account first."
                    checked={settings.oidc.autoCreate}
                    onChange={(checked) => patchOIDC({ autoCreate: checked })}
                  />
                </div>
              </section>

              <section className="rounded-2xl border bg-card p-5">
                <SectionTitle
                  icon={RefreshCw}
                  title="Updates"
                  description="Check for new releases from GitHub. Auto-update can restart the service when supervised."
                />
                <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_150px_140px]">
                  <Field label="Release repository" htmlFor="ops-update-repo">
                    <Input
                      id="ops-update-repo"
                      value={settings.update.repo}
                      onChange={(event) => patch({ update: { ...settings.update, repo: event.target.value } })}
                      placeholder="owner/repository"
                    />
                  </Field>
                  <Field label="Mode" htmlFor="ops-update-mode">
                    <select
                      id="ops-update-mode"
                      value={settings.update.mode}
                      onChange={(event) =>
                        patch({ update: { ...settings.update, mode: event.target.value as OpsSettings["update"]["mode"] } })
                      }
                      className="h-9 w-full rounded-md border bg-background px-2 text-sm outline-none"
                    >
                      <option value="off">Off</option>
                      <option value="check">Check only</option>
                      <option value="apply">Download & restart</option>
                    </select>
                  </Field>
                  <Field label="Interval (hours)" htmlFor="ops-update-interval">
                    <Input
                      id="ops-update-interval"
                      type="number"
                      min={1}
                      max={168}
                      value={settings.update.intervalHours}
                      onChange={(event) =>
                        patch({
                          update: { ...settings.update, intervalHours: Number(event.target.value) || 24 },
                        })
                      }
                    />
                  </Field>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <Button variant="outline" size="sm" onClick={() => void checkUpdate()} disabled={checking || applying}>
                    {checking ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                    Check for updates
                  </Button>
                  {updateCheck?.available && (
                    <Button size="sm" onClick={() => void installUpdate()} disabled={applying}>
                      {applying ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                      Install {updateCheck.latest}
                    </Button>
                  )}
                  <span className="text-[11px] text-muted-foreground">
                    {updateCheck?.error
                      ? updateCheck.error
                      : updateCheck?.latest
                        ? updateCheck.available
                          ? `Latest release: ${updateCheck.latest}`
                          : `Latest release ${updateCheck.latest} is already installed.`
                        : "Auto-update requires a supervisor that restarts Motion after it exits."}
                  </span>
                </div>
              </section>

              <section className="rounded-2xl border bg-card p-5">
                <SectionTitle icon={Database} title="Instance health" description="A quick snapshot of your Motion data." />
                <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {stats &&
                    [
                      ["Users", stats.users],
                      ["Workspaces", stats.workspaces],
                      ["Pages", stats.pages],
                      ["Archived", stats.archived],
                      ["Comments", stats.comments],
                      ["Versions", stats.revisions],
                      ["Access tokens", stats.tokens],
                      ["AI keys", stats.aiConfigured],
                      ["Live collaborators", stats.realtimeClients],
                      ["Live pages", stats.realtimePages],
                      ["Failed webhooks", stats.webhookFailed],
                      ["AI runs today", stats.agentRunsToday],
                      ["Exports today", stats.exportsToday],
                      ["Comments today", stats.commentsToday],
                    ].map(([label, value]) => (
                      <div key={String(label)} className="rounded-xl bg-muted/40 px-3 py-2.5">
                        <div className="text-lg font-semibold tabular-nums">{value as number}</div>
                        <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
                      </div>
                    ))}
                </div>
                <div className="mt-3 flex items-center gap-2 text-[11px] text-muted-foreground">
                  <Database className="size-3" />
                  Data size {formatBytes(stats?.dataSize ?? 0)} · storage {formatBytes(stats?.storageSize ?? 0)}
                  {stats && <span className="ml-auto flex items-center gap-1"><CheckCircle2 className="size-3 text-emerald-500" /> Healthy</span>}
                </div>
              </section>

              <div className="flex items-center justify-between rounded-xl border border-border/70 bg-muted/20 px-4 py-3 text-[11px] text-muted-foreground">
                <span className="flex items-center gap-1.5">
                  <Users className="size-3" /> Last saved {settings ? "just now" : "—"}
                </span>
                <span>Environment variables are used as defaults until you save these settings.</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function OpsGate({
  token,
  onTokenChange,
  onSubmit,
  error,
}: {
  token: string
  onTokenChange: (value: string) => void
  onSubmit: (event: React.FormEvent) => void
  error: string
}) {
  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="flex h-11 items-center gap-2 border-b border-border/70 px-4">
        <LogoMark className="size-6 rounded-md" />
        <span className="text-xs font-medium">Motion</span>
        <span className="text-xs text-muted-foreground">/ Ops</span>
      </header>
      <div className="flex flex-1 items-center justify-center px-5 py-12">
        <form onSubmit={onSubmit} className="w-full max-w-sm rounded-2xl border bg-card p-6 shadow-sm">
          <div className="flex size-11 items-center justify-center rounded-2xl brand-gradient text-white">
            <ShieldCheck className="size-5" />
          </div>
          <h1 className="mt-4 text-lg font-semibold tracking-tight">Ops console</h1>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            Ops uses a dedicated access token, separate from your Motion account. Enter the
            <code className="mx-1 rounded bg-muted px-1 py-0.5 text-[10px]">OPS_TOKEN</code>
            configured on the server.
          </p>
          <div className="mt-5 space-y-2">
            <Label htmlFor="ops-access-token">Ops access token</Label>
            <div className="relative">
              <KeyRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                id="ops-access-token"
                type="password"
                autoFocus
                autoComplete="off"
                value={token}
                onChange={(event) => onTokenChange(event.target.value)}
                placeholder="Paste the OPS_TOKEN"
                className="pl-9 font-mono text-xs"
              />
            </div>
          </div>
          {error && (
            <div className="mt-3 flex items-start gap-1.5 rounded-lg border border-destructive/25 bg-destructive/5 px-2.5 py-2 text-[11px] text-destructive">
              <AlertTriangle className="mt-0.5 size-3 shrink-0" />
              {error}
            </div>
          )}
          <Button type="submit" className="mt-4 w-full gap-1.5" disabled={!token.trim()}>
            <LockKeyhole className="size-3.5" /> Unlock Ops
          </Button>
          <button
            type="button"
            onClick={() => {
              window.location.href = "/"
            }}
            className="mt-3 w-full text-center text-[11px] text-muted-foreground hover:text-foreground"
          >
            Back to workspace
          </button>
        </form>
      </div>
    </div>
  )
}

function SectionTitle({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>
  title: string
  description: string
}) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand">
        <Icon className="size-4" />
      </span>
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">{description}</p>
      </div>
    </div>
  )
}

function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string
  htmlFor?: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  )
}

function ToggleRow({
  title,
  description,
  checked,
  onChange,
}: {
  title: string
  description: string
  checked: boolean
  onChange: (checked: boolean) => void
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-border/60 px-3 py-2.5">
      <div>
        <div className="text-xs font-medium">{title}</div>
        <div className="text-[10px] text-muted-foreground">{description}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  )
}

function formatBytes(bytes: number) {
  if (!bytes) return "0 B"
  const units = ["B", "KB", "MB", "GB"]
  let value = bytes
  let index = 0
  while (value >= 1024 && index < units.length - 1) {
    value /= 1024
    index += 1
  }
  return `${value.toFixed(value < 10 && index > 0 ? 1 : 0)} ${units[index]}`
}
