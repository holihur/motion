import { useEffect, useMemo, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  ArrowLeft,
  Check,
  Copy,
  Download,
  ExternalLink,
  FileCode2,
  FileJson,
  FileText,
  FileType2,
  GitMerge,
  ImagePlus,
  LayoutTemplate,
  Loader2,
  LockKeyhole,
  LockOpen,
  Palette,
  Scissors,
  Star,
  StarOff,
  Trash2,
  Upload,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { tr } from "@/lib/i18n"
import { coverStyle } from "@/lib/covers"
import { downloadMarkdown } from "@/lib/markdown"
import { renderDiagramImages } from "@/lib/mermaid-export"
import { PAGE_THEMES } from "@/lib/page-theme"
import { cn, formatRelative } from "@/lib/utils"
import { pageTitle } from "@/lib/tree"
import type { Page } from "@/lib/types"
import { useWorkspaceStore } from "@/stores/workspace"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { CoverPicker } from "@/components/editor/cover-picker"
import { EmojiPicker } from "@/components/editor/emoji-picker"
import { PageLayoutDialog } from "@/components/app/page-layout-dialog"
import { ShareDialog } from "@/components/app/share-dialog"
import { PagePublishingCard } from "@/components/app/page-publishing"
import { ImportDialog } from "@/components/app/import-dialog"
import { MergePagesDialog, SplitPageDialog } from "@/components/app/page-structure-dialogs"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

type Width = "standard" | "wide" | "full"

function safeFilename(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "page"
}

function SettingsCard({
  title,
  description,
  children,
}: {
  title: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <section className="rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="mt-1 max-w-2xl text-xs leading-5 text-muted-foreground">{description}</p>}
      </div>
      {children}
    </section>
  )
}

function PageSettingsSkeleton() {
  return (
    <div className="h-full overflow-y-auto">
      <div className="mx-auto w-full max-w-4xl px-5 py-8 sm:px-8">
        <div className="mb-8 flex items-center gap-4">
          <Skeleton className="size-14 rounded-2xl" />
          <div className="space-y-2">
            <Skeleton className="h-5 w-48" />
            <Skeleton className="h-3 w-64" />
          </div>
        </div>
        <div className="space-y-5">
          {[160, 220, 150].map((height) => <Skeleton key={height} className="w-full rounded-2xl" style={{ height }} />)}
        </div>
      </div>
    </div>
  )
}

export function PageSettingsPage() {
  const { pageId } = useParams<{ pageId: string }>()
  const navigate = useNavigate()
  const pages = useWorkspaceStore((state) => state.pages)
  const activeId = useWorkspaceStore((state) => state.activeId)
  const setActive = useWorkspaceStore((state) => state.setActive)
  const patchSummary = useWorkspaceStore((state) => state.patchSummary)
  const toggleFavorite = useWorkspaceStore((state) => state.toggleFavorite)
  const duplicatePage = useWorkspaceStore((state) => state.duplicatePage)
  const archivePage = useWorkspaceStore((state) => state.archivePage)
  const restorePage = useWorkspaceStore((state) => state.restorePage)

  const [page, setPage] = useState<Page | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [title, setTitle] = useState("")
  const [icon, setIcon] = useState("")
  const [cover, setCover] = useState("")
  const [saving, setSaving] = useState(false)
  const [busy, setBusy] = useState(false)
  const [layoutOpen, setLayoutOpen] = useState(false)
  const [shareOpen, setShareOpen] = useState(false)
  const [structure, setStructure] = useState<"split" | "merge" | null>(null)
  const [importOpen, setImportOpen] = useState(false)
  const [exporting, setExporting] = useState(false)

  const readOnly = page?.role === "viewer"
  const locked = Boolean(page?.locked)
  const canEdit = !!page && !readOnly && !locked
  const layoutPage = useMemo(() => (page?.layoutId ? pages.find((item) => item.id === page.layoutId) : null), [page?.layoutId, pages])

  function hydrate(next: Page) {
    setPage(next)
    setTitle(next.title)
    setIcon(next.icon)
    setCover(next.cover)
    setError(null)
    setLoading(false)
    patchSummary(next.id, {
      title: next.title,
      icon: next.icon,
      cover: next.cover,
      favorite: next.favorite,
      theme: next.theme,
      width: next.width,
      watermark: next.watermark,
      locked: next.locked,
      lockedByName: next.lockedByName,
      layoutId: next.layoutId,
      isLayout: next.isLayout,
      publicSlug: next.publicSlug,
    })
  }

  async function load() {
    if (!pageId) return
    setLoading(true)
    setError(null)
    try {
      const next = await api.pages.get(pageId)
      if (next.workspaceId !== useWorkspaceStore.getState().activeId) {
        await setActive(next.workspaceId).catch(() => undefined)
      }
      hydrate(next)
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("Could not load page settings"))
      setLoading(false)
    }
  }

  useEffect(() => {
    void load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, activeId])

  function applyMeta(patch: Partial<Page>) {
    if (!page) return
    const next = { ...page, ...patch }
    setPage(next)
    patchSummary(page.id, patch)
    window.dispatchEvent(new CustomEvent("motion:page-meta", { detail: { id: page.id, patch } }))
  }

  async function updatePage(patch: Parameters<typeof api.pages.update>[1], message: string) {
    if (!page || busy) return
    setBusy(true)
    try {
      const updated = await api.pages.update(page.id, patch)
      const next = { ...page, ...updated, ...(patch as Partial<Page>) }
      setPage(next)
      setTitle(next.title)
      setIcon(next.icon)
      setCover(next.cover)
      patchSummary(page.id, {
        ...(patch.title !== undefined ? { title: next.title } : {}),
        ...(patch.icon !== undefined ? { icon: next.icon } : {}),
        ...(patch.cover !== undefined ? { cover: next.cover } : {}),
        ...(patch.theme !== undefined ? { theme: next.theme } : {}),
        ...(patch.width !== undefined ? { width: next.width } : {}),
        ...(patch.watermark !== undefined ? { watermark: next.watermark } : {}),
      })
      window.dispatchEvent(new CustomEvent("motion:page-meta", { detail: { id: page.id, patch } }))
      toast.success(message)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Could not update page settings"))
    } finally {
      setBusy(false)
    }
  }

  async function saveDetails() {
    if (!page || saving) return
    const trimmed = title.replace(/\s+/g, " ").trim()
    setSaving(true)
    try {
      const updated = await api.pages.update(page.id, { title: trimmed, icon, cover })
      hydrate({ ...page, ...updated, title: updated.title, icon: updated.icon, cover: updated.cover })
      toast.success(tr("Page settings updated"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Could not update page settings"))
    } finally {
      setSaving(false)
    }
  }

  async function toggleLock() {
    if (!page || busy) return
    setBusy(true)
    try {
      const updated = locked ? await api.pages.unlock(page.id) : await api.pages.lock(page.id)
      applyMeta({ locked: updated.locked, lockedByName: updated.lockedByName })
      window.dispatchEvent(new CustomEvent("motion:page-lock", {
        detail: { id: page.id, locked: updated.locked, lockedByName: updated.lockedByName },
      }))
      toast.success(updated.locked ? tr("Page locked") : tr("Page unlocked"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Could not change page lock"))
    } finally {
      setBusy(false)
    }
  }

  async function onFavorite() {
    if (!page || busy) return
    setBusy(true)
    try {
      const favorite = await toggleFavorite(page.id)
      applyMeta({ favorite })
      toast.success(favorite ? tr("Added to Favorites") : tr("Removed from Favorites"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Could not update Favorites"))
    } finally {
      setBusy(false)
    }
  }

  async function onDuplicate() {
    if (!page || busy) return
    setBusy(true)
    try {
      const copy = await duplicatePage(page.id)
      toast.success(tr("Page duplicated"))
      navigate(`/page/${copy.id}/settings`)
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Could not duplicate page"))
    } finally {
      setBusy(false)
    }
  }

  async function exportFile(format: "html" | "pdf" | "docx" | "json" | "md") {
    if (!page || exporting) return
    setExporting(true)
    try {
      if (format === "md") {
        const full = await api.pages.get(page.id)
        downloadMarkdown(full)
        toast.success(tr("Markdown downloaded"))
        return
      }
      let diagrams: Awaited<ReturnType<typeof renderDiagramImages>> | undefined
      if (format === "pdf" || format === "docx") {
        try {
          const full = await api.pages.get(page.id)
          diagrams = await renderDiagramImages(full.blocks ?? [])
        } catch {
          diagrams = undefined
        }
      }
      const blob = await api.pages.exportFile(page.id, format, diagrams)
      const href = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = href
      link.download = `${safeFilename(pageTitle(page.title))}.${format === "json" ? "blocks.json" : format}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(href), 1000)
      toast.success(tr("Export ready"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Could not export page"))
    } finally {
      setExporting(false)
    }
  }

  async function onArchive() {
    if (!page || busy) return
    setBusy(true)
    try {
      await archivePage(page.id)
      toast(tr("Moved to Trash"), {
        description: pageTitle(page.title),
        action: {
          label: tr("Undo"),
          onClick: () => void restorePage(page.id).then(() => toast.success(tr("Page restored"))),
        },
      })
      navigate("/")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Could not move page to Trash"))
    } finally {
      setBusy(false)
    }
  }

  async function copyPageLink() {
    if (!page) return
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/page/${page.id}`)
      toast.success(tr("Link copied to clipboard"))
    } catch {
      toast.error(tr("Could not copy link"))
    }
  }

  if (loading) return <PageSettingsSkeleton />

  if (!page) {
    return (
      <div className="flex h-full items-center justify-center px-6">
        <div className="max-w-sm text-center">
          <p className="text-sm font-medium">{tr("Could not load page settings")}</p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          <div className="mt-4 flex justify-center gap-2">
            <Button variant="outline" size="sm" onClick={() => void load()}>{tr("Retry")}</Button>
            <Button variant="ghost" size="sm" onClick={() => navigate("/")}>{tr("Back")}</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="h-full overflow-y-auto bg-muted/15">
      <header className="sticky top-0 z-20 flex h-12 items-center gap-2 border-b bg-background/85 px-3 backdrop-blur sm:px-5">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={tr("Back to page")}
          onClick={() => navigate(`/page/${page.id}`)}
          className="text-muted-foreground"
        >
          <ArrowLeft className="size-4" />
        </Button>
        <div className="min-w-0">
          <div className="truncate text-xs font-semibold">{tr("Page settings")}</div>
          <div className="truncate text-[10px] text-muted-foreground">{pageTitle(page.title)}</div>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          {readOnly && <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground">{tr("Read-only")}</span>}
          {locked && <span className="flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] text-amber-700 dark:text-amber-200"><LockKeyhole className="size-3" /> {tr("Locked")}</span>}
          <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[11px]" onClick={() => navigate(`/page/${page.id}`)}>
            <ExternalLink className="size-3" /> {tr("Open page")}
          </Button>
        </div>
      </header>

      <main className="mx-auto w-full max-w-4xl px-4 py-7 sm:px-8 sm:py-9">
        <div className="mb-7 flex items-center gap-4">
          <div className="flex size-14 shrink-0 items-center justify-center rounded-2xl border bg-card text-3xl shadow-sm">
            {icon || "📄"}
          </div>
          <div className="min-w-0">
            <h1 className="truncate text-2xl font-semibold tracking-tight">{pageTitle(title)}</h1>
            <p className="mt-1 text-xs text-muted-foreground">
              {tr("Manage this page's title, appearance, layout and access.")}
              <span className="ml-2 tabular-nums">{formatRelative(page.updatedAt)}</span>
            </p>
          </div>
        </div>

        <div className="space-y-5">
          <SettingsCard title={tr("General")} description={tr("The title, icon and cover shown in the sidebar and at the top of the page.")}>
            <div className="space-y-4">
              <div className="flex items-start gap-3">
                <EmojiPicker value={icon} onSelect={setIcon}>
                  <button
                    type="button"
                    disabled={!canEdit}
                    aria-label={tr("Change icon")}
                    className="flex size-11 shrink-0 items-center justify-center rounded-xl border bg-background text-2xl transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {icon || "📄"}
                  </button>
                </EmojiPicker>
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Label htmlFor="page-settings-title">{tr("Page title")}</Label>
                  <Input
                    id="page-settings-title"
                    value={title}
                    maxLength={200}
                    disabled={!canEdit}
                    onChange={(event) => setTitle(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault()
                        void saveDetails()
                      }
                    }}
                    placeholder={tr("Untitled")}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label>{tr("Cover")}</Label>
                <div
                  className={cn("relative flex h-28 items-center justify-center overflow-hidden rounded-xl border bg-muted/40", !cover && "border-dashed")}
                  style={coverStyle(cover)}
                >
                  {!cover && <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><ImagePlus className="size-4" /> {tr("No cover")}</span>}
                  <div className="absolute right-2 top-2 flex gap-1.5">
                    <CoverPicker value={cover} onSelect={setCover}>
                      <Button type="button" size="sm" variant="secondary" className="h-7 text-[11px]" disabled={!canEdit}>
                        {cover ? tr("Change cover") : tr("Add cover")}
                      </Button>
                    </CoverPicker>
                    {cover && canEdit && (
                      <Button type="button" size="sm" variant="secondary" className="h-7 text-[11px]" onClick={() => setCover("")}>
                        {tr("Remove")}
                      </Button>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2">
                <span className="mr-auto text-[11px] text-muted-foreground">{locked ? tr("Unlock the page to edit its details.") : readOnly ? tr("You have view-only access to this page.") : ""}</span>
                <Button size="sm" onClick={() => void saveDetails()} disabled={!canEdit || saving}>
                  {saving && <Loader2 className="size-3.5 animate-spin" />} {tr("Save changes")}
                </Button>
              </div>
            </div>
          </SettingsCard>

          <SettingsCard title={tr("Content")} description={tr("Import files, split or merge pages, duplicate this page or export its content.")}>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={!canEdit || busy} onClick={() => setStructure("split")}>
                <Scissors className="size-3.5" /> {tr("Split into sub-pages")}
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={!canEdit || busy} onClick={() => setStructure("merge")}>
                <GitMerge className="size-3.5" /> {tr("Merge sub-pages")}
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={!canEdit || busy} onClick={() => setImportOpen(true)}>
                <Upload className="size-3.5" /> {tr("Import files or other notes…")}
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={!canEdit || busy} onClick={() => void onDuplicate()}>
                <Copy className="size-3.5" /> {tr("Duplicate")}
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={exporting}>
                    <Download className="size-3.5" /> {tr("Export")}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-52">
                  <DropdownMenuItem onSelect={() => void exportFile("md")}><Download /> {tr("Export as Markdown")}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void exportFile("html")}><FileCode2 /> {tr("Export as HTML")}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void exportFile("pdf")}><FileText /> {tr("Export as PDF")}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void exportFile("docx")}><FileType2 /> {tr("Export as Word")}</DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void exportFile("json")}><FileJson /> {tr("Export blocks as JSON")}</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </SettingsCard>

          <SettingsCard title={tr("Appearance")} description={tr("Choose the accent color, width and watermark for this page.")}>
            <div className="space-y-5">
              <div>
                <div className="mb-2 flex items-center gap-1.5 text-xs font-medium text-muted-foreground"><Palette className="size-3.5" /> {tr("Page color")}</div>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
                  {PAGE_THEMES.map((theme) => {
                    const selected = (page.theme || "default") === theme.value
                    return (
                      <button
                        key={theme.value}
                        type="button"
                        disabled={!canEdit || busy}
                        aria-pressed={selected}
                        onClick={() => void updatePage({ theme: theme.value === "default" ? "" : theme.value }, tr("Page color updated"))}
                        className={cn(
                          "flex flex-col items-center gap-1.5 rounded-lg border p-2 text-[10px] transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60",
                          selected && "border-brand bg-brand-soft",
                        )}
                      >
                        <span className="relative flex size-7 items-center justify-center rounded-full text-white" style={{ backgroundColor: theme.brand }}>
                          {selected && <Check className="size-4" strokeWidth={3} />}
                        </span>
                        <span className="text-muted-foreground">{tr(theme.label)}</span>
                      </button>
                    )
                  })}
                </div>
              </div>

              <div>
                <div className="mb-2 text-xs font-medium text-muted-foreground">{tr("Page width")}</div>
                <div className="grid gap-2 sm:grid-cols-3">
                  {(["standard", "wide", "full"] as Width[]).map((width) => (
                    <button
                      key={width}
                      type="button"
                      disabled={!canEdit || busy}
                      onClick={() => void updatePage({ width }, tr("Page width updated"))}
                      className={cn(
                        "rounded-lg border px-3 py-2 text-left text-xs transition hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60",
                        (page.width ?? "standard") === width && "border-brand bg-brand-soft text-brand",
                      )}
                    >
                      <span className="font-medium">{tr(width === "standard" ? "Standard" : width === "wide" ? "Wide" : "Full width")}</span>
                      <span className="mt-0.5 block text-[10px] text-muted-foreground">{tr(width === "standard" ? "Comfortable reading width" : width === "wide" ? "More room for tables and media" : "Use the entire editor width")}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-4 rounded-lg border bg-muted/20 px-3 py-2.5">
                <div>
                  <div className="text-xs font-medium">{tr("Watermark")}</div>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">{tr("Show a faint page title watermark on the page.")}</p>
                </div>
                <Switch
                  checked={Boolean(page.watermark)}
                  disabled={!canEdit || busy}
                  onCheckedChange={(checked) => void updatePage({ watermark: checked }, checked ? tr("Watermark enabled") : tr("Watermark disabled"))}
                />
              </div>
            </div>
          </SettingsCard>

          <SettingsCard title={tr("Layout")} description={tr("Use a layout page to share a header and footer with other pages.")}>
            <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-muted/20 px-3 py-3">
              <div className="flex size-9 items-center justify-center rounded-lg bg-background text-muted-foreground"><LayoutTemplate className="size-4" /></div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-medium">{layoutPage ? pageTitle(layoutPage.title) : tr("No layout")}</div>
                <div className="mt-0.5 text-[11px] text-muted-foreground">
                  {page.isLayout ? tr("This page is a layout") : layoutPage ? tr("Shared header and footer") : tr("This page uses its own blocks from top to bottom.")}
                </div>
              </div>
              {layoutPage && (
                <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 text-[11px]" onClick={() => navigate(`/page/${layoutPage.id}`)}>
                  <ExternalLink className="size-3" /> {tr("Open")}
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" className="h-7 text-[11px]" disabled={!canEdit || busy} onClick={() => setLayoutOpen(true)}>
                {layoutPage ? tr("Change layout") : tr("Choose layout")}
              </Button>
            </div>
          </SettingsCard>

          <SettingsCard title={tr("Access")} description={tr("Manage who can view or edit this page, and share its public link.")}>
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => setShareOpen(true)}>
                  <Users className="size-3.5" /> {tr("Manage access")}
                </Button>
                <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" onClick={() => void copyPageLink()}>
                  <Copy className="size-3.5" /> {tr("Copy page link")}
                </Button>
                <span className="text-[11px] text-muted-foreground">{tr("Workspace members can be granted editor or viewer access.")}</span>
              </div>

              <PagePublishingCard
                page={page}
                readOnly={readOnly}
                onSlugChange={(slug) => setPage((current) => current ? { ...current, publicSlug: slug ?? undefined } : current)}
              />
            </div>
          </SettingsCard>

          <SettingsCard title={tr("Page actions")} description={tr("Lock, favorite or remove this page.")}>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={busy || readOnly} onClick={() => void toggleLock()}>
                {locked ? <LockOpen className="size-3.5" /> : <LockKeyhole className="size-3.5" />}
                {locked ? tr("Unlock page") : tr("Lock page")}
              </Button>
              <Button type="button" variant="outline" size="sm" className="h-8 gap-1.5 text-xs" disabled={busy || readOnly} onClick={() => void onFavorite()}>
                {page.favorite ? <StarOff className="size-3.5" /> : <Star className="size-3.5" />}
                {page.favorite ? tr("Remove from Favorites") : tr("Add to Favorites")}
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 border-destructive/30 text-xs text-destructive hover:bg-destructive/10 hover:text-destructive"
                disabled={busy || readOnly || locked}
                onClick={() => void onArchive()}
              >
                <Trash2 className="size-3.5" /> {tr("Move to Trash")}
              </Button>
            </div>
            {locked && <p className="mt-3 text-[11px] text-amber-700 dark:text-amber-200">{tr("This page is locked. Unlock it before editing or moving it.")}</p>}
          </SettingsCard>
        </div>
      </main>

      <SplitPageDialog
        page={page}
        open={structure === "split"}
        onOpenChange={(open) => setStructure(open ? "split" : null)}
        onDone={() => void load()}
      />
      <MergePagesDialog
        page={page}
        open={structure === "merge"}
        onOpenChange={(open) => setStructure(open ? "merge" : null)}
        onDone={() => void load()}
      />
      <ImportDialog open={importOpen} onOpenChange={setImportOpen} page={page} />
      <PageLayoutDialog
        page={page}
        open={layoutOpen}
        onOpenChange={(open) => {
          setLayoutOpen(open)
          if (!open) void load()
        }}
      />
      <ShareDialog open={shareOpen} onOpenChange={setShareOpen} page={page} />
    </div>
  )
}
