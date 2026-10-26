import { useEffect, useState } from "react"
import { Navigate, useNavigate } from "react-router-dom"
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Globe2,
  Loader2,
  RefreshCw,
  Save,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { OpsSettings, OpsStats } from "@/lib/types"
import { useAuthStore } from "@/stores/auth"
import { SidebarToggle } from "@/components/app/sidebar-toggle"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Skeleton } from "@/components/ui/skeleton"

export function OpsView() {
  const user = useAuthStore((state) => state.user)
  const navigate = useNavigate()
  const [settings, setSettings] = useState<OpsSettings | null>(null)
  const [stats, setStats] = useState<OpsStats | null>(null)
  const [loading, setLoading] = useState(true)
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
    if (!user?.isAdmin) return
    setLoading(true)
    Promise.all([api.ops.settings(), api.ops.stats(), api.system.info()])
      .then(([next, counts, info]) => {
        setVersion(info.version)
        setSettings(next)
        setStats(counts)
        setAdminEmails(((next.adminEmails ?? []).length ? next.adminEmails : [user?.email ?? ""]).filter(Boolean).join(", "))
        setScopes((next.oidc.scopes ?? []).join(", "))
        setDomains((next.oidc.allowedDomains ?? []).join(", "))
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load Ops settings"))
      .finally(() => setLoading(false))
  }, [user?.isAdmin])

  if (!user?.isAdmin) return <Navigate to="/" replace />

  function patch(next: Partial<OpsSettings>) {
    setSettings((current) => (current ? { ...current, ...next } : current))
  }

  function patchOIDC(next: Partial<OpsSettings["oidc"]>) {
    setSettings((current) => (current ? { ...current, oidc: { ...current.oidc, ...next } } : current))
  }

  async function save() {
    if (!settings || pending) return
    setPending(true)
    try {
      const saved = await api.ops.saveSettings({
        appName: settings.appName,
        allowSignup: settings.allowSignup,
        mcpEnabled: settings.mcpEnabled,
        aiModel: settings.aiModel,
        adminEmails: adminEmails.split(",").map((item) => item.trim()).filter(Boolean),
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
      const result = await api.ops.applyUpdate()
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
      const result = await api.ops.checkUpdate()
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
    <>
      <header className="flex h-11 shrink-0 items-center gap-1 border-b border-border/70 px-3">
        <SidebarToggle />
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
    </>
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
