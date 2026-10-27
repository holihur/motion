import { useEffect, useState } from "react"
import { BookOpen, Bug, CheckCircle2, CloudUpload, Database, RefreshCw, Trash2, Webhook } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { tr } from "@/lib/i18n"
import { useAuthStore } from "@/stores/auth"
import { useWorkspaceStore } from "@/stores/workspace"
import type { Integration, PublishGroup, WebhookDelivery } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { cn } from "@/lib/utils"

const EVENTS = ["*", "comment.created", "proposal.created", "proposal.approved", "page.published"]

export function IntegrationsSettings() {
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const activeId = useWorkspaceStore((state) => state.activeId)
  const user = useAuthStore((state) => state.user)
  const workspace = workspaces.find((item) => item.id === activeId)
  const owner = Boolean(workspace && user && workspace.ownerId === user.id)
  const [integrations, setIntegrations] = useState<Integration[]>([])
  const [deliveries, setDeliveries] = useState<WebhookDelivery[]>([])
  const [groups, setGroups] = useState<PublishGroup[]>([])
  const [groupName, setGroupName] = useState("")
  const [groupTargets, setGroupTargets] = useState<string[]>(["git", "jira"])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState("")
  const [testing, setTesting] = useState(false)
  const [enabled, setEnabled] = useState<Record<string, boolean>>({})

  const webhook = integrations.find((item) => item.provider === "webhook")
  const ssh = integrations.find((item) => item.provider === "ssh")
  const git = integrations.find((item) => item.provider === "git")
  const jira = integrations.find((item) => item.provider === "jira")
  const confluence = integrations.find((item) => item.provider === "confluence")
  const s3 = integrations.find((item) => item.provider === "s3")
  const aliyun = integrations.find((item) => item.provider === "aliyun_oss")
  const qiniu = integrations.find((item) => item.provider === "qiniu")
  const tencent = integrations.find((item) => item.provider === "tencent_cos")
  const [webhookURL, setWebhookURL] = useState("")
  const [webhookSecret, setWebhookSecret] = useState("")
  const [webhookEvents, setWebhookEvents] = useState<string[]>(["*"])
  const [host, setHost] = useState("")
  const [port, setPort] = useState("22")
  const [username, setUsername] = useState("")
  const [remotePath, setRemotePath] = useState("")
  const [publicBaseUrl, setPublicBaseUrl] = useState("")
  const [fingerprint, setFingerprint] = useState("")
  const [privateKey, setPrivateKey] = useState("")
  const [gitKind, setGitKind] = useState("github")
  const [gitBaseUrl, setGitBaseUrl] = useState("")
  const [gitOwner, setGitOwner] = useState("")
  const [gitRepo, setGitRepo] = useState("")
  const [gitBranch, setGitBranch] = useState("main")
  const [gitPath, setGitPath] = useState("docs")
  const [gitPublicBase, setGitPublicBase] = useState("")
  const [gitToken, setGitToken] = useState("")
  const [jiraSite, setJiraSite] = useState("")
  const [jiraEmail, setJiraEmail] = useState("")
  const [jiraProject, setJiraProject] = useState("")
  const [jiraIssueType, setJiraIssueType] = useState("Task")
  const [jiraIssueKey, setJiraIssueKey] = useState("")
  const [jiraToken, setJiraToken] = useState("")
  const [confSite, setConfSite] = useState("")
  const [confEmail, setConfEmail] = useState("")
  const [confSpace, setConfSpace] = useState("")
  const [confPage, setConfPage] = useState("")
  const [confParent, setConfParent] = useState("")
  const [confToken, setConfToken] = useState("")
  const [s3Provider, setS3Provider] = useState("generic")
  const [s3Endpoint, setS3Endpoint] = useState("")
  const [s3Bucket, setS3Bucket] = useState("")
  const [s3Region, setS3Region] = useState("")
  const [s3Prefix, setS3Prefix] = useState("")
  const [s3Public, setS3Public] = useState("")
  const [s3SSL, setS3SSL] = useState(true)
  const [s3Access, setS3Access] = useState("")
  const [s3Secret, setS3Secret] = useState("")
  const [aliEndpoint, setAliEndpoint] = useState("")
  const [aliBucket, setAliBucket] = useState("")
  const [aliPrefix, setAliPrefix] = useState("")
  const [aliPublic, setAliPublic] = useState("")
  const [aliAccess, setAliAccess] = useState("")
  const [aliSecret, setAliSecret] = useState("")
  const [qiniuBucket, setQiniuBucket] = useState("")
  const [qiniuPrefix, setQiniuPrefix] = useState("")
  const [qiniuPublic, setQiniuPublic] = useState("")
  const [qiniuHTTPS, setQiniuHTTPS] = useState(true)
  const [qiniuAccess, setQiniuAccess] = useState("")
  const [qiniuSecret, setQiniuSecret] = useState("")
  const [tenBucket, setTenBucket] = useState("")
  const [tenRegion, setTenRegion] = useState("")
  const [tenEndpoint, setTenEndpoint] = useState("")
  const [tenPrefix, setTenPrefix] = useState("")
  const [tenPublic, setTenPublic] = useState("")
  const [tenSecretID, setTenSecretID] = useState("")
  const [tenSecretKey, setTenSecretKey] = useState("")

  async function load() {
    if (!workspace) return
    setLoading(true)
    try {
      const [items, log, publishGroups] = await Promise.all([
        api.integrations.list(workspace.id),
        api.integrations.deliveries(workspace.id).catch(() => []),
        api.integrations.groups(workspace.id).catch(() => []),
      ])
      setIntegrations(items ?? [])
      setEnabled(Object.fromEntries((items ?? []).map((item) => [item.provider, item.enabled])))
      setDeliveries(log ?? [])
      setGroups(publishGroups ?? [])
      const wh = items.find((item) => item.provider === "webhook")
      const sh = items.find((item) => item.provider === "ssh")
      const gh = items.find((item) => item.provider === "git")
      if (wh) {
        setWebhookURL(wh.config.url ?? "")
        setWebhookEvents(wh.events?.length ? wh.events : ["*"])
      }
      if (gh) {
        setGitKind(gh.config.kind || "github")
        setGitBaseUrl(gh.config.baseUrl ?? "")
        setGitOwner(gh.config.owner ?? "")
        setGitRepo(gh.config.repo ?? "")
        setGitBranch(gh.config.branch || "main")
        setGitPath(gh.config.path || "docs")
        setGitPublicBase(gh.config.publicBaseUrl ?? "")
      }
      const jr = items.find((item) => item.provider === "jira")
      const cf = items.find((item) => item.provider === "confluence")
      if (jr) {
        setJiraSite(jr.config.siteUrl ?? ""); setJiraEmail(jr.config.email ?? "")
        setJiraProject(jr.config.projectKey ?? ""); setJiraIssueType(jr.config.issueType || "Task")
        setJiraIssueKey(jr.config.issueKey ?? "")
      }
      if (cf) {
        setConfSite(cf.config.siteUrl ?? ""); setConfEmail(cf.config.email ?? "")
        setConfSpace(cf.config.spaceId ?? ""); setConfPage(cf.config.pageId ?? "")
        setConfParent(cf.config.parentId ?? "")
      }
      const al = items.find((item) => item.provider === "aliyun_oss")
      if (al) {
        setAliEndpoint(al.config.endpoint ?? ""); setAliBucket(al.config.bucket ?? "")
        setAliPrefix(al.config.prefix ?? ""); setAliPublic(al.config.publicBaseUrl ?? "")
      }
      const tc = items.find((item) => item.provider === "tencent_cos")
      if (tc) {
        setTenBucket(tc.config.bucket ?? ""); setTenRegion(tc.config.region ?? "")
        setTenEndpoint(tc.config.endpoint ?? ""); setTenPrefix(tc.config.prefix ?? "")
        setTenPublic(tc.config.publicBaseUrl ?? "")
      }
      const qn = items.find((item) => item.provider === "qiniu")
      if (qn) {
        setQiniuBucket(qn.config.bucket ?? ""); setQiniuPrefix(qn.config.prefix ?? "")
        setQiniuPublic(qn.config.publicBaseUrl ?? ""); setQiniuHTTPS(qn.config.useHTTPS !== "false")
      }
      const st = items.find((item) => item.provider === "s3")
      if (st) {
        setS3Endpoint(st.config.endpoint ?? ""); setS3Bucket(st.config.bucket ?? "")
        setS3Region(st.config.region ?? ""); setS3Prefix(st.config.prefix ?? "")
        setS3Public(st.config.publicBaseUrl ?? ""); setS3SSL(st.config.useSSL !== "false")
      }
      if (sh) {
        setHost(sh.config.host ?? "")
        setPort(sh.config.port || "22")
        setUsername(sh.config.username ?? "")
        setRemotePath(sh.config.remotePath ?? "")
        setPublicBaseUrl(sh.config.publicBaseUrl ?? "")
        setFingerprint(sh.config.hostFingerprint ?? "")
      }
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { void load() }, [workspace?.id])

  if (!workspace) return <p className="pt-4 text-sm text-muted-foreground">{tr("No workspace selected.")}</p>
  if (loading) return <div className="h-32 animate-pulse rounded-lg bg-muted/60" />

  async function save(provider: "webhook" | "ssh" | "git" | "jira" | "confluence" | "s3" | "aliyun_oss" | "qiniu" | "tencent_cos", config: Record<string, string>, secret: string, events?: string[]) {
    if (saving) return
    setSaving(provider)
    try {
      await api.integrations.save(workspace!.id, provider, { config, secret, events, enabled: enabled[provider] ?? true })
      toast.success(provider === "webhook" ? tr("Webhook saved") : provider === "git" ? tr("Git publishing saved") : provider === "jira" ? tr("Jira publishing saved") : provider === "confluence" ? tr("Confluence publishing saved") : provider === "s3" ? tr("S3 storage saved") : provider === "aliyun_oss" ? tr("Aliyun OSS saved") : provider === "qiniu" ? tr("Qiniu saved") : provider === "tencent_cos" ? tr("Tencent COS saved") : tr("SSH publishing saved"))
      setWebhookSecret("")
      setPrivateKey("")
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not save integration"))
    } finally {
      setSaving("")
    }
  }

  async function addGroup() {
    if (!groupName.trim() || groupTargets.length === 0) return
    try {
      const group = await api.integrations.saveGroup(workspace!.id, { name: groupName.trim(), targets: groupTargets })
      setGroups((current) => [...current, group])
      setGroupName("")
      toast.success(tr("Action group created"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not create action group"))
    }
  }

  async function removeGroup(id: string) {
    try {
      await api.integrations.removeGroup(workspace!.id, id)
      setGroups((current) => current.filter((group) => group.id !== id))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not remove action group"))
    }
  }

  async function remove(provider: string) {
    try {
      await api.integrations.remove(workspace!.id, provider)
      toast.success(tr("Integration removed"))
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not remove integration"))
    }
  }

  async function testAll() {
    if (testing || integrations.length === 0) return
    setTesting(true)
    const results: string[] = []
    for (const item of integrations) {
      try {
        const result = await api.integrations.test(workspace!.id, item.provider)
        results.push(`${item.provider}: OK (${result.latencyMs}ms)`)
      } catch (error) {
        results.push(`${item.provider}: ${error instanceof Error ? error.message : "failed"}`)
      }
    }
    setTesting(false)
    const failed = results.filter((line) => !line.includes(": OK"))
    if (failed.length > 0) toast.error(failed.join(" · "))
    else toast.success(tr("All integrations connected"))
  }

  function EnableToggle({ provider }: { provider: string }) {
    return (
      <label className="ml-auto flex items-center gap-1.5 text-[10px] font-normal text-muted-foreground">
        <input type="checkbox" checked={enabled[provider] ?? true} disabled={!owner} onChange={(event) => setEnabled((current) => ({ ...current, [provider]: event.target.checked }))} />
        {tr("Enabled")}
      </label>
    )
  }

  return (
    <div className="space-y-6 pt-2">
      <div className="rounded-xl border border-brand/20 bg-brand-soft/25 p-3.5">
        <div className="flex items-center gap-2 text-sm font-medium"><CloudUpload className="size-4 text-brand" /> {tr("Workspace integrations")}</div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">{tr("Publish pages and send workspace events to other tools. Secrets are encrypted on the server.")}</p>
        <Button type="button" variant="outline" size="sm" className="mt-3" onClick={() => void testAll()} disabled={testing || integrations.length === 0}>{testing ? tr("Testing…") : tr("Test all integrations")}</Button>
      </div>

      <section className="space-y-3 rounded-xl border p-4">
        <div className="flex items-center gap-2 text-sm font-medium"><CloudUpload className="size-4 text-brand" /> {tr("Action groups")}</div>
        <p className="text-xs text-muted-foreground">{tr("Group several publish targets so one click publishes everywhere.")}</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Input value={groupName} disabled={!owner} onChange={(event) => setGroupName(event.target.value)} placeholder={tr("Group name, e.g. Release everywhere")} className="h-8 flex-1 text-xs" />
          <Button type="button" size="sm" onClick={() => void addGroup()} disabled={!owner || !groupName.trim() || groupTargets.length === 0}>{tr("Add group")}</Button>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {[["git", tr("Git")], ["jira", tr("Jira")], ["confluence", tr("Confluence")], ["storage", tr("Object storage")], ["ssh", tr("SSH")]].map(([value, label]) => (
            <button key={value} type="button" disabled={!owner} onClick={() => setGroupTargets((current) => current.includes(value) ? current.filter((item) => item !== value) : [...current, value])} className={cn("rounded-full border px-2 py-0.5 text-[10px]", groupTargets.includes(value) ? "border-brand bg-brand-soft text-brand" : "text-muted-foreground")}>{label}</button>
          ))}
        </div>
        {groups.length > 0 && <div className="space-y-1 border-t pt-3">
          {groups.map((group) => <div key={group.id} className="flex items-center gap-2 text-xs">
            <span className="font-medium">{group.name}</span>
            <span className="truncate text-muted-foreground">{group.targets.join(" · ")}</span>
            {owner && <button type="button" onClick={() => void removeGroup(group.id)} className="ml-auto text-muted-foreground hover:text-destructive"><Trash2 className="size-3" /></button>}
          </div>)}
        </div>}
      </section>

      <Separator />

      <section className="space-y-3 rounded-xl border p-4">
        <div className="flex items-center gap-2 text-sm font-medium"><Webhook className="size-4 text-brand" /> {tr("Outgoing webhook")} {webhook && <CheckCircle2 className="size-3.5 text-emerald-500" />}<EnableToggle provider="webhook" /></div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>{tr("Endpoint URL")}</Label><Input value={webhookURL} disabled={!owner} onChange={(event) => setWebhookURL(event.target.value)} placeholder="https://hooks.example.com/motion" /></div>
          <div className="space-y-1.5"><Label>{tr("Signing secret")}</Label><Input type="password" value={webhookSecret} disabled={!owner} onChange={(event) => setWebhookSecret(event.target.value)} placeholder={webhook?.hasSecret ? tr("Saved — leave blank to keep") : tr("Optional signing secret")} /></div>
        </div>
        <div className="space-y-1.5">
          <Label>{tr("Events")}</Label>
          <div className="flex flex-wrap gap-1.5">
            {EVENTS.map((event) => <button key={event} type="button" disabled={!owner} onClick={() => setWebhookEvents((current) => current.includes(event) ? current.filter((item) => item !== event) : [...current, event])} className={cn("rounded-full border px-2 py-0.5 text-[10px]", webhookEvents.includes(event) ? "border-brand bg-brand-soft text-brand" : "text-muted-foreground")}>{event}</button>)}
          </div>
        </div>
        <div className="flex justify-end gap-2">
          {webhook && <Button type="button" variant="ghost" size="sm" onClick={() => void remove("webhook")} disabled={!owner} className="gap-1 text-destructive"><Trash2 className="size-3.5" /> {tr("Remove")}</Button>}
          <Button type="button" size="sm" disabled={!owner || saving === "webhook"} onClick={() => void save("webhook", { url: webhookURL.trim() }, webhookSecret, webhookEvents)}>{saving === "webhook" ? tr("Saving…") : tr("Save webhook")}</Button>
        </div>
        {deliveries.length > 0 && (
          <div className="space-y-1 border-t pt-3">
            <div className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground"><RefreshCw className="size-3" /> {tr("Recent deliveries")}</div>
            {deliveries.slice(0, 5).map((delivery) => (
              <div key={delivery.id} className="flex items-center gap-2 text-[11px]">
                <span className={cn("size-1.5 rounded-full", delivery.status === "delivered" ? "bg-emerald-500" : delivery.status === "failed" ? "bg-destructive" : "bg-amber-500")} />
                <span className="font-mono">{delivery.event}</span>
                <span className="text-muted-foreground">{delivery.status}</span>
                {(delivery.responseCode ?? 0) > 0 && <span className="text-muted-foreground">HTTP {delivery.responseCode}</span>}
                {delivery.error && <span className="truncate text-destructive">{delivery.error}</span>}
              </div>
            ))}
          </div>
        )}
      </section>

      <Separator />

      <section className="space-y-3 rounded-xl border p-4">
        <div className="flex items-center gap-2 text-sm font-medium"><CloudUpload className="size-4 text-brand" /> {tr("Git Pages publishing")} {git && <CheckCircle2 className="size-3.5 text-emerald-500" />}<EnableToggle provider="git" /></div>
        <p className="text-xs text-muted-foreground">{tr("Render pages as static HTML and commit them to GitHub, GitLab or Gitea. The access token is encrypted at rest.")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>{tr("Provider")}</Label><select value={gitKind} disabled={!owner} onChange={(event) => setGitKind(event.target.value)} className="h-9 w-full rounded-md border bg-background px-2 text-sm"><option value="github">GitHub</option><option value="gitlab">GitLab</option><option value="gitea">Gitea</option></select></div>
          <div className="space-y-1.5"><Label>{tr("API base URL")}</Label><Input value={gitBaseUrl} disabled={!owner} onChange={(event) => setGitBaseUrl(event.target.value)} placeholder={gitKind === "gitlab" ? "https://gitlab.com" : gitKind === "gitea" ? "https://gitea.example.com" : "https://api.github.com"} /></div>
          <div className="space-y-1.5"><Label>{tr("Owner / namespace")}</Label><Input value={gitOwner} disabled={!owner} onChange={(event) => setGitOwner(event.target.value)} placeholder="acme" /></div>
          <div className="space-y-1.5"><Label>{tr("Repository")}</Label><Input value={gitRepo} disabled={!owner} onChange={(event) => setGitRepo(event.target.value)} placeholder="docs" /></div>
          <div className="space-y-1.5"><Label>{tr("Branch")}</Label><Input value={gitBranch} disabled={!owner} onChange={(event) => setGitBranch(event.target.value)} placeholder="main" /></div>
          <div className="space-y-1.5"><Label>{tr("Subdirectory")}</Label><Input value={gitPath} disabled={!owner} onChange={(event) => setGitPath(event.target.value)} placeholder="docs" /></div>
          <div className="space-y-1.5"><Label>{tr("Public base URL")}</Label><Input value={gitPublicBase} disabled={!owner} onChange={(event) => setGitPublicBase(event.target.value)} placeholder="https://acme.github.io/docs/" /></div>
          <div className="space-y-1.5"><Label>{tr("Access token")}</Label><Input type="password" value={gitToken} disabled={!owner} onChange={(event) => setGitToken(event.target.value)} placeholder={git?.hasSecret ? tr("Saved — leave blank to keep") : tr("GitHub / GitLab / Gitea token")} /></div>
        </div>
        <div className="flex justify-end gap-2">
          {git && <Button type="button" variant="ghost" size="sm" onClick={() => void remove("git")} disabled={!owner} className="gap-1 text-destructive"><Trash2 className="size-3.5" /> {tr("Remove")}</Button>}
          <Button type="button" size="sm" disabled={!owner || saving === "git"} onClick={() => void save("git", { kind: gitKind, baseUrl: gitBaseUrl.trim(), owner: gitOwner.trim(), repo: gitRepo.trim(), branch: gitBranch.trim(), path: gitPath.trim(), publicBaseUrl: gitPublicBase.trim() }, gitToken)}>{saving === "git" ? tr("Saving…") : tr("Save Git")}</Button>
        </div>
      </section>

      <Separator />

      <section className="space-y-3 rounded-xl border p-4">
        <div className="flex items-center gap-2 text-sm font-medium"><Bug className="size-4 text-brand" /> {tr("Jira publishing")} {jira && <CheckCircle2 className="size-3.5 text-emerald-500" />}<EnableToggle provider="jira" /></div>
        <p className="text-xs text-muted-foreground">{tr("Convert the page to Atlassian Document Format and create or update a Jira issue.")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>{tr("Site URL")}</Label><Input value={jiraSite} disabled={!owner} onChange={(event) => setJiraSite(event.target.value)} placeholder="https://acme.atlassian.net" /></div>
          <div className="space-y-1.5"><Label>{tr("Email")}</Label><Input value={jiraEmail} disabled={!owner} onChange={(event) => setJiraEmail(event.target.value)} placeholder="you@example.com" /></div>
          <div className="space-y-1.5"><Label>{tr("Project key")}</Label><Input value={jiraProject} disabled={!owner} onChange={(event) => setJiraProject(event.target.value)} placeholder="DOCS" /></div>
          <div className="space-y-1.5"><Label>{tr("Issue type")}</Label><Input value={jiraIssueType} disabled={!owner} onChange={(event) => setJiraIssueType(event.target.value)} placeholder="Task" /></div>
          <div className="space-y-1.5"><Label>{tr("Existing issue key")}</Label><Input value={jiraIssueKey} disabled={!owner} onChange={(event) => setJiraIssueKey(event.target.value)} placeholder="DOCS-123" /></div>
          <div className="space-y-1.5"><Label>{tr("API token")}</Label><Input type="password" value={jiraToken} disabled={!owner} onChange={(event) => setJiraToken(event.target.value)} placeholder={jira?.hasSecret ? tr("Saved — leave blank to keep") : tr("Atlassian API token")} /></div>
        </div>
        <div className="flex justify-end gap-2">
          {jira && <Button type="button" variant="ghost" size="sm" onClick={() => void remove("jira")} disabled={!owner} className="gap-1 text-destructive"><Trash2 className="size-3.5" /> {tr("Remove")}</Button>}
          <Button type="button" size="sm" disabled={!owner || saving === "jira"} onClick={() => void save("jira", { siteUrl: jiraSite.trim(), email: jiraEmail.trim(), projectKey: jiraProject.trim(), issueType: jiraIssueType.trim() || "Task", issueKey: jiraIssueKey.trim() }, jiraToken)}>{saving === "jira" ? tr("Saving…") : tr("Save Jira")}</Button>
        </div>
      </section>

      <Separator />

      <section className="space-y-3 rounded-xl border p-4">
        <div className="flex items-center gap-2 text-sm font-medium"><BookOpen className="size-4 text-brand" /> {tr("Confluence publishing")} {confluence && <CheckCircle2 className="size-3.5 text-emerald-500" />}<EnableToggle provider="confluence" /></div>
        <p className="text-xs text-muted-foreground">{tr("Convert the page to ADF and create or update a Confluence Cloud page.")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>{tr("Site URL")}</Label><Input value={confSite} disabled={!owner} onChange={(event) => setConfSite(event.target.value)} placeholder="https://acme.atlassian.net" /></div>
          <div className="space-y-1.5"><Label>{tr("Email")}</Label><Input value={confEmail} disabled={!owner} onChange={(event) => setConfEmail(event.target.value)} placeholder="you@example.com" /></div>
          <div className="space-y-1.5"><Label>{tr("Space ID")}</Label><Input value={confSpace} disabled={!owner} onChange={(event) => setConfSpace(event.target.value)} placeholder="123456" /></div>
          <div className="space-y-1.5"><Label>{tr("Page ID (optional)")}</Label><Input value={confPage} disabled={!owner} onChange={(event) => setConfPage(event.target.value)} placeholder="Update an existing page" /></div>
          <div className="space-y-1.5"><Label>{tr("Parent page ID (optional)")}</Label><Input value={confParent} disabled={!owner} onChange={(event) => setConfParent(event.target.value)} placeholder="123456" /></div>
          <div className="space-y-1.5"><Label>{tr("API token")}</Label><Input type="password" value={confToken} disabled={!owner} onChange={(event) => setConfToken(event.target.value)} placeholder={confluence?.hasSecret ? tr("Saved — leave blank to keep") : tr("Atlassian API token")} /></div>
        </div>
        <div className="flex justify-end gap-2">
          {confluence && <Button type="button" variant="ghost" size="sm" onClick={() => void remove("confluence")} disabled={!owner} className="gap-1 text-destructive"><Trash2 className="size-3.5" /> {tr("Remove")}</Button>}
          <Button type="button" size="sm" disabled={!owner || saving === "confluence"} onClick={() => void save("confluence", { siteUrl: confSite.trim(), email: confEmail.trim(), spaceId: confSpace.trim(), pageId: confPage.trim(), parentId: confParent.trim() }, confToken)}>{saving === "confluence" ? tr("Saving…") : tr("Save Confluence")}</Button>
        </div>
      </section>

      <Separator />

      <section className="space-y-3 rounded-xl border p-4">
        <div className="flex items-center gap-2 text-sm font-medium"><Database className="size-4 text-brand" /> {tr("Aliyun OSS")} {aliyun && <CheckCircle2 className="size-3.5 text-emerald-500" />}<EnableToggle provider="aliyun_oss" /></div>
        <p className="text-xs text-muted-foreground">{tr("Store uploads and published pages in Alibaba Cloud OSS. Use an OSS endpoint and bucket.")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>{tr("Endpoint")}</Label><Input value={aliEndpoint} disabled={!owner} onChange={(event) => setAliEndpoint(event.target.value)} placeholder="https://oss-cn-hangzhou.aliyuncs.com" /></div>
          <div className="space-y-1.5"><Label>{tr("Bucket")}</Label><Input value={aliBucket} disabled={!owner} onChange={(event) => setAliBucket(event.target.value)} placeholder="motion-assets" /></div>
          <div className="space-y-1.5"><Label>{tr("Prefix")}</Label><Input value={aliPrefix} disabled={!owner} onChange={(event) => setAliPrefix(event.target.value)} placeholder="workspace/" /></div>
          <div className="space-y-1.5"><Label>{tr("Public base URL")}</Label><Input value={aliPublic} disabled={!owner} onChange={(event) => setAliPublic(event.target.value)} placeholder="https://cdn.example.com" /></div>
          <div className="space-y-1.5"><Label>{tr("AccessKey ID")}</Label><Input value={aliAccess} disabled={!owner} onChange={(event) => setAliAccess(event.target.value)} placeholder="LTAI…" /></div>
          <div className="space-y-1.5"><Label>{tr("AccessKey Secret")}</Label><Input type="password" value={aliSecret} disabled={!owner} onChange={(event) => setAliSecret(event.target.value)} placeholder={aliyun?.hasSecret ? tr("Saved — leave blank to keep") : tr("AccessKey Secret")} /></div>
        </div>
        <div className="flex justify-end gap-2">
          {aliyun && <Button type="button" variant="ghost" size="sm" onClick={() => void remove("aliyun_oss")} disabled={!owner} className="gap-1 text-destructive"><Trash2 className="size-3.5" /> {tr("Remove")}</Button>}
          <Button type="button" size="sm" disabled={!owner || saving === "aliyun_oss"} onClick={() => void save("aliyun_oss", { endpoint: aliEndpoint.trim(), bucket: aliBucket.trim(), prefix: aliPrefix.trim(), publicBaseUrl: aliPublic.trim() }, `${aliAccess}
${aliSecret}`)}>{saving === "aliyun_oss" ? tr("Saving…") : tr("Save Aliyun OSS")}</Button>
        </div>
      </section>

      <Separator />

      <section className="space-y-3 rounded-xl border p-4">
        <div className="flex items-center gap-2 text-sm font-medium"><Database className="size-4 text-brand" /> {tr("Qiniu Kodo")} {qiniu && <CheckCircle2 className="size-3.5 text-emerald-500" />}<EnableToggle provider="qiniu" /></div>
        <p className="text-xs text-muted-foreground">{tr("Store uploads and published pages in Qiniu Kodo. Configure the bucket and its public CDN domain.")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>{tr("Bucket")}</Label><Input value={qiniuBucket} disabled={!owner} onChange={(event) => setQiniuBucket(event.target.value)} placeholder="motion-assets" /></div>
          <div className="space-y-1.5"><Label>{tr("Public base URL")}</Label><Input value={qiniuPublic} disabled={!owner} onChange={(event) => setQiniuPublic(event.target.value)} placeholder="https://cdn.example.com" /></div>
          <div className="space-y-1.5"><Label>{tr("Prefix")}</Label><Input value={qiniuPrefix} disabled={!owner} onChange={(event) => setQiniuPrefix(event.target.value)} placeholder="workspace/" /></div>
          <label className="flex items-center gap-2 pt-6 text-xs text-muted-foreground"><input type="checkbox" checked={qiniuHTTPS} disabled={!owner} onChange={(event) => setQiniuHTTPS(event.target.checked)} /> {tr("Use HTTPS")}</label>
          <div className="space-y-1.5"><Label>{tr("AccessKey")}</Label><Input value={qiniuAccess} disabled={!owner} onChange={(event) => setQiniuAccess(event.target.value)} placeholder="Qiniu AccessKey" /></div>
          <div className="space-y-1.5"><Label>{tr("SecretKey")}</Label><Input type="password" value={qiniuSecret} disabled={!owner} onChange={(event) => setQiniuSecret(event.target.value)} placeholder={qiniu?.hasSecret ? tr("Saved — leave blank to keep") : tr("Qiniu SecretKey")} /></div>
        </div>
        <div className="flex justify-end gap-2">
          {qiniu && <Button type="button" variant="ghost" size="sm" onClick={() => void remove("qiniu")} disabled={!owner} className="gap-1 text-destructive"><Trash2 className="size-3.5" /> {tr("Remove")}</Button>}
          <Button type="button" size="sm" disabled={!owner || saving === "qiniu"} onClick={() => void save("qiniu", { bucket: qiniuBucket.trim(), prefix: qiniuPrefix.trim(), publicBaseUrl: qiniuPublic.trim(), useHTTPS: qiniuHTTPS ? "true" : "false" }, `${qiniuAccess}
${qiniuSecret}`)}>{saving === "qiniu" ? tr("Saving…") : tr("Save Qiniu")}</Button>
        </div>
      </section>

      <Separator />

      <section className="space-y-3 rounded-xl border p-4">
        <div className="flex items-center gap-2 text-sm font-medium"><Database className="size-4 text-brand" /> {tr("Tencent Cloud COS")} {tencent && <CheckCircle2 className="size-3.5 text-emerald-500" />}<EnableToggle provider="tencent_cos" /></div>
        <p className="text-xs text-muted-foreground">{tr("Store uploads and published pages in Tencent Cloud COS using the native COS API.")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>{tr("Bucket")}</Label><Input value={tenBucket} disabled={!owner} onChange={(event) => setTenBucket(event.target.value)} placeholder="motion-assets-1250000000" /></div>
          <div className="space-y-1.5"><Label>{tr("Region")}</Label><Input value={tenRegion} disabled={!owner} onChange={(event) => setTenRegion(event.target.value)} placeholder="ap-guangzhou" /></div>
          <div className="space-y-1.5"><Label>{tr("Endpoint (optional)")}</Label><Input value={tenEndpoint} disabled={!owner} onChange={(event) => setTenEndpoint(event.target.value)} placeholder="https://bucket.cos.region.myqcloud.com" /></div>
          <div className="space-y-1.5"><Label>{tr("Public base URL")}</Label><Input value={tenPublic} disabled={!owner} onChange={(event) => setTenPublic(event.target.value)} placeholder="https://cdn.example.com" /></div>
          <div className="space-y-1.5"><Label>{tr("Prefix")}</Label><Input value={tenPrefix} disabled={!owner} onChange={(event) => setTenPrefix(event.target.value)} placeholder="workspace/" /></div>
          <div className="space-y-1.5"><Label>{tr("SecretId")}</Label><Input value={tenSecretID} disabled={!owner} onChange={(event) => setTenSecretID(event.target.value)} placeholder="AKID…" /></div>
          <div className="space-y-1.5"><Label>{tr("SecretKey")}</Label><Input type="password" value={tenSecretKey} disabled={!owner} onChange={(event) => setTenSecretKey(event.target.value)} placeholder={tencent?.hasSecret ? tr("Saved — leave blank to keep") : tr("SecretKey")} /></div>
        </div>
        <div className="flex justify-end gap-2">
          {tencent && <Button type="button" variant="ghost" size="sm" onClick={() => void remove("tencent_cos")} disabled={!owner} className="gap-1 text-destructive"><Trash2 className="size-3.5" /> {tr("Remove")}</Button>}
          <Button type="button" size="sm" disabled={!owner || saving === "tencent_cos"} onClick={() => void save("tencent_cos", { bucket: tenBucket.trim(), region: tenRegion.trim(), endpoint: tenEndpoint.trim(), prefix: tenPrefix.trim(), publicBaseUrl: tenPublic.trim() }, `${tenSecretID}\n${tenSecretKey}`)}>{saving === "tencent_cos" ? tr("Saving…") : tr("Save Tencent COS")}</Button>
        </div>
      </section>

      <Separator />

      <section className="space-y-3 rounded-xl border p-4">
        <div className="flex items-center gap-2 text-sm font-medium"><Database className="size-4 text-brand" /> {tr("S3-compatible storage")} {s3 && <CheckCircle2 className="size-3.5 text-emerald-500" />}<EnableToggle provider="s3" /></div>
        <p className="text-xs text-muted-foreground">{tr("Store uploads in S3, MinIO or Cloudflare R2 instead of GridFS. The bucket should be publicly readable for inline images.")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>{tr("Provider preset")}</Label><select value={s3Provider} disabled={!owner} onChange={(event) => {
            const value = event.target.value
            setS3Provider(value)
            if (!s3Endpoint) {
              setS3Endpoint(value === "aliyun" ? "https://s3.oss-cn-hangzhou.aliyuncs.com" : value === "qiniu" ? "https://s3-cn-east-1.qiniucs.com" : value === "tencent" ? "https://cos.ap-guangzhou.myqcloud.com" : "")
            }
          }} className="h-9 w-full rounded-md border bg-background px-2 text-sm"><option value="generic">Generic S3</option><option value="aliyun">Aliyun OSS (S3 API)</option><option value="qiniu">Qiniu Kodo (S3 API)</option><option value="tencent">Tencent COS (S3 API)</option></select></div>
          <div className="space-y-1.5"><Label>{tr("Endpoint")}</Label><Input value={s3Endpoint} disabled={!owner} onChange={(event) => setS3Endpoint(event.target.value)} placeholder="https://s3.example.com" /></div>
          <div className="space-y-1.5"><Label>{tr("Bucket")}</Label><Input value={s3Bucket} disabled={!owner} onChange={(event) => setS3Bucket(event.target.value)} placeholder="motion-uploads" /></div>
          <div className="space-y-1.5"><Label>{tr("Region")}</Label><Input value={s3Region} disabled={!owner} onChange={(event) => setS3Region(event.target.value)} placeholder="us-east-1" /></div>
          <div className="space-y-1.5"><Label>{tr("Prefix")}</Label><Input value={s3Prefix} disabled={!owner} onChange={(event) => setS3Prefix(event.target.value)} placeholder="workspace/" /></div>
          <div className="space-y-1.5"><Label>{tr("Public base URL")}</Label><Input value={s3Public} disabled={!owner} onChange={(event) => setS3Public(event.target.value)} placeholder="https://cdn.example.com" /></div>
          <label className="flex items-center gap-2 pt-6 text-xs text-muted-foreground"><input type="checkbox" checked={s3SSL} disabled={!owner} onChange={(event) => setS3SSL(event.target.checked)} /> {tr("Use HTTPS")}</label>
          <div className="space-y-1.5"><Label>{tr("Access key")}</Label><Input value={s3Access} disabled={!owner} onChange={(event) => setS3Access(event.target.value)} placeholder="AKIA…" /></div>
          <div className="space-y-1.5"><Label>{tr("Secret key")}</Label><Input type="password" value={s3Secret} disabled={!owner} onChange={(event) => setS3Secret(event.target.value)} placeholder={s3?.hasSecret ? tr("Saved — leave blank to keep") : tr("Secret key")} /></div>
        </div>
        <div className="flex justify-end gap-2">
          {s3 && <Button type="button" variant="ghost" size="sm" onClick={() => void remove("s3")} disabled={!owner} className="gap-1 text-destructive"><Trash2 className="size-3.5" /> {tr("Remove")}</Button>}
          <Button type="button" size="sm" disabled={!owner || saving === "s3"} onClick={() => void save("s3", { endpoint: s3Endpoint.trim(), bucket: s3Bucket.trim(), region: s3Region.trim(), prefix: s3Prefix.trim(), publicBaseUrl: s3Public.trim(), useSSL: s3SSL ? "true" : "false" }, `${s3Access}
${s3Secret}`)}>{saving === "s3" ? tr("Saving…") : tr("Save S3")}</Button>
        </div>
      </section>

      <Separator />

      <section className="space-y-3 rounded-xl border p-4">
        <div className="flex items-center gap-2 text-sm font-medium"><CloudUpload className="size-4 text-brand" /> {tr("SSH static publishing")} {ssh && <CheckCircle2 className="size-3.5 text-emerald-500" />}<EnableToggle provider="ssh" /></div>
        <p className="text-xs text-muted-foreground">{tr("Render pages as static HTML and write them to a remote directory over SFTP. The private key is encrypted at rest.")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1.5"><Label>{tr("Host")}</Label><Input value={host} disabled={!owner} onChange={(event) => setHost(event.target.value)} placeholder="example.com" /></div>
          <div className="space-y-1.5"><Label>{tr("Port")}</Label><Input value={port} disabled={!owner} onChange={(event) => setPort(event.target.value)} placeholder="22" /></div>
          <div className="space-y-1.5"><Label>{tr("Username")}</Label><Input value={username} disabled={!owner} onChange={(event) => setUsername(event.target.value)} placeholder="deploy" /></div>
          <div className="space-y-1.5"><Label>{tr("Remote directory")}</Label><Input value={remotePath} disabled={!owner} onChange={(event) => setRemotePath(event.target.value)} placeholder="/var/www/motion" /></div>
          <div className="space-y-1.5"><Label>{tr("Public base URL")}</Label><Input value={publicBaseUrl} disabled={!owner} onChange={(event) => setPublicBaseUrl(event.target.value)} placeholder="https://docs.example.com" /></div>
          <div className="space-y-1.5"><Label>{tr("Host fingerprint")}</Label><Input value={fingerprint} disabled={!owner} onChange={(event) => setFingerprint(event.target.value)} placeholder="SHA256:…" /></div>
        </div>
        <div className="space-y-1.5"><Label>{tr("Private key")}</Label><textarea value={privateKey} disabled={!owner} onChange={(event) => setPrivateKey(event.target.value)} rows={4} placeholder={ssh?.hasSecret ? tr("Saved — leave blank to keep") : "-----BEGIN OPENSSH PRIVATE KEY-----"} className="w-full resize-y rounded-md border bg-background px-2.5 py-2 font-mono text-[11px] leading-5 outline-none" /></div>
        <div className="flex justify-end gap-2">
          {ssh && <Button type="button" variant="ghost" size="sm" onClick={() => void remove("ssh")} disabled={!owner} className="gap-1 text-destructive"><Trash2 className="size-3.5" /> {tr("Remove")}</Button>}
          <Button type="button" size="sm" disabled={!owner || saving === "ssh"} onClick={() => void save("ssh", { host: host.trim(), port: port.trim(), username: username.trim(), remotePath: remotePath.trim(), publicBaseUrl: publicBaseUrl.trim(), hostFingerprint: fingerprint.trim() }, privateKey)}>{saving === "ssh" ? tr("Saving…") : tr("Save SSH")}</Button>
        </div>
      </section>
      {!owner && <p className="text-[11px] text-muted-foreground">{tr("Only the workspace owner can change integrations.")}</p>}
    </div>
  )
}
