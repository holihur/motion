import { useEffect, useState } from "react"
import {
  ArrowUpRight,
  BookOpen,
  Bug,
  CloudUpload,
  Copy,
  GitBranch,
  Globe,
  Loader2,
} from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { tr } from "@/lib/i18n"
import type { PageSummary, PublishGroup } from "@/lib/types"
import { useWorkspaceStore } from "@/stores/workspace"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function PagePublishingCard({
  page,
  readOnly = false,
  onSlugChange,
}: {
  page: PageSummary
  readOnly?: boolean
  onSlugChange?: (slug: string | null) => void
}) {
  const activeId = useWorkspaceStore((state) => state.activeId)
  const [enabledProviders, setEnabledProviders] = useState<Set<string>>(new Set())
  const [groups, setGroups] = useState<PublishGroup[]>([])
  const [publishOpen, setPublishOpen] = useState(false)
  const [publicSlug, setPublicSlug] = useState<string | null>(page.publicSlug ?? null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    setPublicSlug(page.publicSlug ?? null)
  }, [page.publicSlug])

  useEffect(() => {
    if (!activeId) return
    void Promise.all([
      api.integrations.list(activeId),
      api.integrations.groups(activeId),
    ]).then(([integrations, publishGroups]) => {
      setEnabledProviders(new Set(integrations.filter((item) => item.enabled).map((item) => item.provider)))
      setGroups(publishGroups ?? [])
    }).catch(() => {
      setEnabledProviders(new Set())
      setGroups([])
    })
  }, [activeId])

  function markPublished(slug: string | null) {
    setPublicSlug(slug)
    useWorkspaceStore.getState().patchSummary(page.id, { publicSlug: slug ?? undefined })
    onSlugChange?.(slug)
  }

  async function publishAtlassian(provider: "jira" | "confluence") {
    if (!activeId) return
    setBusy(true)
    try {
      const result = provider === "jira"
        ? await api.integrations.publishJira(activeId, page.id)
        : await api.integrations.publishConfluence(activeId, page.id)
      toast.success(provider === "jira" ? tr("Published to Jira") : tr("Published to Confluence"), {
        action: result.url ? { label: tr("Open"), onClick: () => window.open(result.url, "_blank", "noopener") } : undefined,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not publish page"))
    } finally {
      setBusy(false)
    }
  }

  async function publishGroup(group: PublishGroup) {
    if (!activeId) return
    const hasStorage = ["s3", "aliyun_oss", "qiniu", "tencent_cos"].some((provider) => enabledProviders.has(provider))
    const targets = group.targets.filter((target) => target === "storage" ? hasStorage : enabledProviders.has(target))
    if (targets.length === 0) {
      toast.error(tr("None of this group's targets are enabled"))
      return
    }
    setBusy(true)
    let ok = 0
    const failures: string[] = []
    for (const target of targets) {
      try {
        if (target === "ssh") await api.integrations.publishSSH(activeId, page.id, true)
        else if (target === "git") await api.integrations.publishGit(activeId, page.id, true)
        else if (target === "jira") await api.integrations.publishJira(activeId, page.id)
        else if (target === "confluence") await api.integrations.publishConfluence(activeId, page.id)
        else if (target === "storage") await api.integrations.publishS3(activeId, page.id, true)
        ok += 1
      } catch (error) {
        failures.push(`${target}: ${error instanceof Error ? error.message : tr("failed")}`)
      }
    }
    setBusy(false)
    if (failures.length > 0) toast.error(`${tr("Published to {n} target(s)", { n: ok })} · ${failures.join(" · ")}`)
    else toast.success(tr("Published to {n} target(s)", { n: ok }))
  }

  async function publishStorage(kind: "git" | "s3" | "ssh") {
    if (!activeId) return
    setBusy(true)
    try {
      const result = kind === "git"
        ? await api.integrations.publishGit(activeId, page.id, true)
        : kind === "ssh"
          ? await api.integrations.publishSSH(activeId, page.id, true)
          : await api.integrations.publishS3(activeId, page.id, true)
      const n = result.fileCount ?? 0
      toast.success(kind === "git" ? tr("Published {n} page(s) to Git", { n }) : kind === "ssh" ? tr("Published {n} page(s) via SSH", { n }) : tr("Published {n} file(s) to object storage", { n }), {
        action: result.url ? { label: tr("Open"), onClick: () => window.open(result.url, "_blank", "noopener") } : undefined,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not publish page"))
    } finally {
      setBusy(false)
    }
  }

  const hasStorage = ["s3", "aliyun_oss", "qiniu", "tencent_cos"].some((provider) => enabledProviders.has(provider))

  return (
    <>
      <div className="space-y-3">
        <div className="rounded-xl border bg-muted/20 px-3 py-2.5">
          <div className="flex items-center gap-2 text-xs font-medium"><Globe className="size-3.5 text-muted-foreground" /> {tr("Web publishing")}</div>
          {publicSlug ? (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <code className="min-w-0 flex-1 truncate rounded bg-background px-2 py-1 text-[11px]">{`${window.location.origin}/p/${publicSlug}`}</code>
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-[11px]" onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/p/${publicSlug}`).then(() => toast.success(tr("Copied")), () => toast.error(tr("Could not copy")))}>
                <Copy className="size-3" /> {tr("Copy")}
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-[11px]" onClick={() => window.open(`/p/${publicSlug}`, "_blank", "noopener")}>
                <ArrowUpRight className="size-3" /> {tr("Open")}
              </Button>
            </div>
          ) : (
            <p className="mt-1 text-[11px] text-muted-foreground">{tr("This page is not published to the web.")}</p>
          )}
          {!readOnly && (
            <Button type="button" variant="outline" size="sm" className="mt-2 h-8 text-xs" onClick={() => setPublishOpen(true)}>
              <Globe className="size-3.5" /> {publicSlug ? tr("Publishing settings") : tr("Publish to web")}
            </Button>
          )}
        </div>

        {!readOnly && (enabledProviders.has("git") || enabledProviders.has("jira") || enabledProviders.has("confluence") || hasStorage || enabledProviders.has("ssh") || groups.length > 0) && (
          <div>
            <div className="mb-1.5 text-[11px] font-medium text-muted-foreground">{tr("Publish to integrations")}</div>
            <div className="flex flex-wrap gap-1.5">
              {enabledProviders.has("git") && <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={busy} onClick={() => void publishStorage("git")}><GitBranch className="size-3.5" /> {tr("Git")}</Button>}
              {enabledProviders.has("jira") && <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={busy} onClick={() => void publishAtlassian("jira")}><Bug className="size-3.5" /> {tr("Jira")}</Button>}
              {enabledProviders.has("confluence") && <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={busy} onClick={() => void publishAtlassian("confluence")}><BookOpen className="size-3.5" /> {tr("Confluence")}</Button>}
              {hasStorage && <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={busy} onClick={() => void publishStorage("s3")}><CloudUpload className="size-3.5" /> {tr("Object storage")}</Button>}
              {enabledProviders.has("ssh") && <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={busy} onClick={() => void publishStorage("ssh")}><CloudUpload className="size-3.5" /> {tr("SSH")}</Button>}
              {groups.map((group) => <Button key={group.id} type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={busy} onClick={() => void publishGroup(group)}><CloudUpload className="size-3.5" /> {group.name}</Button>)}
            </div>
          </div>
        )}
      </div>
      <PublishDialog
        page={page}
        open={publishOpen}
        onOpenChange={setPublishOpen}
        onSlugChange={markPublished}
      />
    </>
  )
}

function PublishDialog({
  page,
  open,
  onOpenChange,
  onSlugChange,
}: {
  page: PageSummary
  open: boolean
  onOpenChange: (open: boolean) => void
  onSlugChange: (slug: string | null) => void
}) {
  const [publicSlug, setPublicSlug] = useState<string | null>(page.publicSlug ?? null)
  const [publishing, setPublishing] = useState(false)
  const [withChildren, setWithChildren] = useState(true)
  const [pubPassword, setPubPassword] = useState("")
  const [pubExpires, setPubExpires] = useState("")
  const [pubComments, setPubComments] = useState(false)
  const [pubIndex, setPubIndex] = useState(false)
  const [pubViews, setPubViews] = useState<number | null>(null)
  const [pubLocked, setPubLocked] = useState(false)

  useEffect(() => {
    if (!open) return
    setPublicSlug(page.publicSlug ?? null)
    setPubPassword("")
    setPubExpires("")
    setPubComments(false)
    setPubIndex(false)
    setPubViews(null)
    void api.pages.publishStatus(page.id).then((status) => {
      if (status.slug) setPublicSlug(status.slug)
      setPubLocked(status.locked)
      if (status.expiresAt) setPubExpires(status.expiresAt.slice(0, 16))
      setPubViews(status.views ?? 0)
      setPubComments(!!status.comments)
      setPubIndex(!!status.index)
    }).catch(() => undefined)
  }, [open, page.id, page.publicSlug])

  function applySlug(slug: string | null) {
    setPublicSlug(slug)
    onSlugChange(slug)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Globe className="size-4 text-brand" /> {tr("Publish to web")}</DialogTitle>
          <DialogDescription>{tr("Anyone with the link can read this page. No login required.")}</DialogDescription>
          <label className="flex cursor-pointer items-center gap-2 rounded-lg border bg-muted/40 px-2.5 py-2 text-xs">
            <input type="checkbox" checked={withChildren} onChange={(event) => setWithChildren(event.target.checked)} className="size-3.5 accent-[var(--brand)]" />
            <span>
              {tr("Include sub-pages")}
              <span className="block text-[11px] text-muted-foreground">{tr("Published sub-pages stay linked; others show as plain text.")}</span>
            </span>
          </label>
        </DialogHeader>
        {publicSlug && (
          <div className="flex items-center gap-2 rounded-lg border bg-muted/40 px-2.5 py-2">
            <span className="min-w-0 flex-1 truncate font-mono text-xs">{`${window.location.origin}/p/${publicSlug}`}</span>
            <Button variant="ghost" size="sm" className="h-7 shrink-0 gap-1 text-[11px]" onClick={() => void navigator.clipboard.writeText(`${window.location.origin}/p/${publicSlug}`).then(() => toast.success(tr("Copied")), () => toast.error(tr("Could not copy")))}>
              <Copy className="size-3" /> {tr("Copy")}
            </Button>
            <Button variant="ghost" size="sm" className="h-7 shrink-0 px-2 text-[11px]" onClick={() => window.open(`/p/${publicSlug}`, "_blank", "noopener")}>
              <ArrowUpRight className="size-3" />
            </Button>
          </div>
        )}
        <div className="space-y-2 rounded-lg border p-2.5">
          <div className="grid gap-2 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pub-password">{tr("Password (optional)")}</Label>
              <Input id="pub-password" type="password" value={pubPassword} onChange={(event) => setPubPassword(event.target.value)} placeholder={pubLocked ? tr("Saved — leave blank to keep") : tr("No password")} autoComplete="off" className="h-8 text-xs" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pub-expires">{tr("Expires at (optional)")}</Label>
              <div className="flex gap-1.5">
                <Input id="pub-expires" type="datetime-local" value={pubExpires} onChange={(event) => setPubExpires(event.target.value)} className="h-8 text-xs" />
                {pubExpires && <Button variant="ghost" size="sm" className="h-8 shrink-0 px-2 text-[11px]" onClick={() => setPubExpires("")}>{tr("Clear")}</Button>}
              </div>
            </div>
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input type="checkbox" checked={pubComments} onChange={(event) => setPubComments(event.target.checked)} className="size-3.5 accent-[var(--brand)]" />
            {tr("Allow public comments")}
            {typeof pubViews === "number" && <span className="ml-auto tabular-nums text-muted-foreground">{tr("{n} view(s)", { n: pubViews })}</span>}
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-xs">
            <input type="checkbox" checked={pubIndex} onChange={(event) => setPubIndex(event.target.checked)} className="size-3.5 accent-[var(--brand)]" />
            {tr("Allow search engines to index this page")}
          </label>
          <Button
            variant="outline"
            size="sm"
            className="h-7 w-full text-[11px]"
            disabled={publishing}
            onClick={() => {
              setPublishing(true)
              api.pages.publish(page.id, {
                includeChildren: withChildren,
                password: pubPassword || undefined,
                expiresAt: pubExpires ? new Date(pubExpires).toISOString() : "",
                comments: pubComments,
                index: pubIndex,
              }).then((result) => {
                applySlug(result.slug)
                setPubPassword("")
                toast.success(tr("Settings saved"))
              }).catch((error) => toast.error(error instanceof Error ? error.message : tr("Could not save"))).finally(() => setPublishing(false))
            }}
          >
            {tr("Save settings")}
          </Button>
        </div>
        <DialogFooter className="gap-1.5">
          {publicSlug ? (
            <>
              <Button variant="ghost" className="gap-1 text-destructive hover:text-destructive" disabled={publishing} onClick={() => {
                setPublishing(true)
                api.pages.unpublish(page.id, withChildren).then(() => {
                  applySlug(null)
                  toast.success(tr("Unpublished"))
                }).catch((error) => toast.error(error instanceof Error ? error.message : tr("Could not unpublish"))).finally(() => setPublishing(false))
              }}>{tr("Unpublish")}</Button>
              <Button variant="outline" onClick={() => onOpenChange(false)}>{tr("Done")}</Button>
            </>
          ) : (
            <>
              <Button variant="ghost" onClick={() => onOpenChange(false)}>{tr("Cancel")}</Button>
              <Button disabled={publishing} onClick={() => {
                setPublishing(true)
                api.pages.publish(page.id, { includeChildren: withChildren }).then((result) => {
                  applySlug(result.slug)
                  toast.success(tr("Published"))
                }).catch((error) => toast.error(error instanceof Error ? error.message : tr("Could not publish"))).finally(() => setPublishing(false))
              }}>
                {publishing && <Loader2 className="size-3.5 animate-spin" />} {tr("Publish")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
