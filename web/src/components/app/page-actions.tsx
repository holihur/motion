import { useEffect, useRef, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import {
  CloudUpload,
  Copy,
  Download,
  GitBranch,
  Bug,
  BookOpen,
  FileCode2,
  FilePlus2,
  FileText,
  FileType2,
  FileUp,
  Link2,
  LockKeyhole,
  LockOpen,
  MoreHorizontal,
  PencilLine,
  Star,
  StarOff,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { downloadMarkdown } from "@/lib/markdown"
import { pageTitle } from "@/lib/tree"
import { tr } from "@/lib/i18n"
import type { PageSummary, PublishGroup } from "@/lib/types"
import { useWorkspaceStore } from "@/stores/workspace"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

interface PageActionsProps {
  page: PageSummary
  align?: "start" | "center" | "end"
  trigger?: React.ReactNode
  readOnly?: boolean
  onRenameRequest?: () => void
}

function safeFilename(name: string) {
  return name.replace(/[\\/:*?"<>|]+/g, "-").replace(/\s+/g, " ").trim() || "page"
}

export function PageActionsMenu({ page, align = "start", trigger, readOnly = false, onRenameRequest }: PageActionsProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const createPage = useWorkspaceStore((state) => state.createPage)
  const toggleFavorite = useWorkspaceStore((state) => state.toggleFavorite)
  const archivePage = useWorkspaceStore((state) => state.archivePage)
  const restorePage = useWorkspaceStore((state) => state.restorePage)
  const duplicatePage = useWorkspaceStore((state) => state.duplicatePage)
  const activeId = useWorkspaceStore((state) => state.activeId)
  const [renameOpen, setRenameOpen] = useState(false)
  const [enabledProviders, setEnabledProviders] = useState<Set<string>>(new Set())
  const [groups, setGroups] = useState<PublishGroup[]>([])
  const importRef = useRef<HTMLInputElement>(null)
  const locked = Boolean(page.locked)

  const isCurrent = location.pathname === `/page/${page.id}`
  const hasStorage = ["s3", "aliyun_oss", "qiniu", "tencent_cos"].some((provider) => enabledProviders.has(provider))

  async function refreshEnabledIntegrations() {
    if (!activeId) return
    try {
      const [integrations, publishGroups] = await Promise.all([
        api.integrations.list(activeId),
        api.integrations.groups(activeId),
      ])
      setEnabledProviders(new Set(integrations.filter((item) => item.enabled).map((item) => item.provider)))
      setGroups(publishGroups ?? [])
    } catch {
      setEnabledProviders(new Set())
      setGroups([])
    }
  }

  async function onAddSubpage() {
    window.dispatchEvent(
      new CustomEvent("motion:expand-page", { detail: { id: page.id } }),
    )
    const created = await createPage(page.id)
    navigate(`/page/${created.id}`)
  }

  async function onDuplicate() {
    try {
      const copy = await duplicatePage(page.id)
      window.dispatchEvent(
        new CustomEvent("motion:expand-page", { detail: { id: copy.parentId ?? "" } }),
      )
      toast.success(tr("Page duplicated"))
      navigate(`/page/${copy.id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not duplicate page"))
    }
  }

  async function onCopyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/page/${page.id}`)
      toast.success(tr("Link copied to clipboard"))
    } catch {
      toast.error(tr("Could not copy link"))
    }
  }

  async function onArchive() {
    try {
      await archivePage(page.id)
      if (isCurrent) navigate("/")
      toast(tr("Moved to Trash"), {
        description: pageTitle(page.title),
        action: {
          label: tr("Undo"),
          onClick: () => {
            void restorePage(page.id).then(() => toast.success(tr("Page restored")))
          },
        },
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not move page to Trash")
    }
  }

  async function onToggleLock() {
    try {
      const updated = locked ? await api.pages.unlock(page.id) : await api.pages.lock(page.id)
      useWorkspaceStore.getState().patchSummary(page.id, { locked: updated.locked })
      window.dispatchEvent(new CustomEvent("motion:page-lock", {
        detail: { id: page.id, locked: updated.locked, lockedByName: updated.lockedByName },
      }))
      toast.success(updated.locked ? tr("Page locked") : tr("Page unlocked"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not change page lock"))
    }
  }

  async function onImportFile(file: File) {
    try {
      const text = await file.text()
      window.dispatchEvent(new CustomEvent("motion:import-markdown", { detail: { pageId: page.id, text, filename: file.name } }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not read file"))
    }
  }

  async function exportFile(format: "html" | "pdf" | "docx") {
    try {
      const blob = await api.pages.exportFile(page.id, format)
      const href = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = href
      link.download = `${safeFilename(pageTitle(page.title))}.${format}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      // Keep the object URL alive until the browser has started the download.
      window.setTimeout(() => URL.revokeObjectURL(href), 1000)
      toast.success(tr("Export ready"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not export page"))
    }
  }

  async function onPublishAtlassian(provider: "jira" | "confluence") {
    if (!activeId) return
    try {
      const result = provider === "jira"
        ? await api.integrations.publishJira(activeId, page.id)
        : await api.integrations.publishConfluence(activeId, page.id)
      toast.success(provider === "jira" ? tr("Published to Jira") : tr("Published to Confluence"), {
        action: result.url ? { label: tr("Open"), onClick: () => window.open(result.url, "_blank", "noopener") } : undefined,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not publish page"))
    }
  }

  async function publishGroup(group: PublishGroup) {
    if (!activeId) return
    const targets = group.targets.filter((target) => target === "storage" ? hasStorage : enabledProviders.has(target))
    if (targets.length === 0) {
      toast.error(tr("None of this group's targets are enabled"))
      return
    }
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
        failures.push(`${target}: ${error instanceof Error ? error.message : "failed"}`)
      }
    }
    if (failures.length > 0) toast.error(`${tr("Published to {n} target(s)", { n: ok })} · ${failures.join(" · ")}`)
    else toast.success(tr("Published to {n} target(s)", { n: ok }))
  }

  async function onPublishS3() {
    if (!activeId) return
    try {
      const result = await api.integrations.publishS3(activeId, page.id, true)
      toast.success(tr("Published {n} file(s) to object storage", { n: result.fileCount ?? 0 }), {
        action: result.url ? { label: tr("Open"), onClick: () => window.open(result.url, "_blank", "noopener") } : undefined,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not publish page"))
    }
  }

  async function onPublishGit() {
    if (!activeId) return
    try {
      const result = await api.integrations.publishGit(activeId, page.id, true)
      toast.success(tr("Published {n} page(s) to Git", { n: result.fileCount ?? 0 }), {
        action: result.url ? { label: tr("Open"), onClick: () => window.open(result.url, "_blank", "noopener") } : undefined,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not publish page"))
    }
  }

  async function onPublishSSH() {
    if (!activeId) return
    try {
      const result = await api.integrations.publishSSH(activeId, page.id, true)
      toast.success(tr("Published {n} page(s) via SSH", { n: result.fileCount ?? 0 }), {
        action: result.url ? { label: tr("Open"), onClick: () => window.open(result.url, "_blank", "noopener") } : undefined,
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not publish page"))
    }
  }

  async function onExport() {
    try {
      const full = await api.pages.get(page.id)
      downloadMarkdown(full)
      toast.success(tr("Markdown downloaded"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not export page")
    }
  }

  function openRename() {
    setRenameOpen(true)
    onRenameRequest?.()
  }

  return (
    <>
      <DropdownMenu onOpenChange={(open) => { if (open) void refreshEnabledIntegrations() }}>
        <DropdownMenuTrigger asChild>
          {trigger ?? (
            <button
              type="button"
              aria-label="Page options"
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground data-[state=open]:bg-sidebar-accent"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-56">
          {!readOnly && <DropdownMenuItem onSelect={onToggleLock}>
            {locked ? <LockOpen /> : <LockKeyhole />}
            {locked ? tr("Unlock page") : tr("Lock page")}
          </DropdownMenuItem>}
          {!readOnly && <DropdownMenuSeparator />}
          {!readOnly && !locked && <DropdownMenuItem onSelect={openRename}>
            <PencilLine /> {tr("Rename")}
          </DropdownMenuItem>}
          {!readOnly && !locked && <DropdownMenuItem
            onSelect={() => {
              void toggleFavorite(page.id).then((favorite) =>
                toast.success(favorite ? "Added to Favorites" : "Removed from Favorites"),
              )
            }}
          >
            {page.favorite ? <StarOff /> : <Star />}
            {page.favorite ? tr("Remove from Favorites") : tr("Add to Favorites")}
          </DropdownMenuItem>}
          {!readOnly && !locked && <DropdownMenuItem onSelect={() => void onAddSubpage()}>
            <FilePlus2 /> {tr("Add sub-page")}
          </DropdownMenuItem>}
          {!readOnly && !locked && <DropdownMenuSeparator />}
          {!readOnly && !locked && <DropdownMenuItem onSelect={() => importRef.current?.click()}>
            <FileUp /> {tr("Import Markdown")}
          </DropdownMenuItem>}
          {!readOnly && !locked && <DropdownMenuItem onSelect={() => void onDuplicate()}>
            <Copy /> {tr("Duplicate")}
          </DropdownMenuItem>}
          <DropdownMenuItem onSelect={() => void onCopyLink()}>
            <Link2 /> {tr("Copy link")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void onExport()}>
            <Download /> {tr("Export as Markdown")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void exportFile("html")}>
            <FileCode2 /> {tr("Export as HTML")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void exportFile("pdf")}>
            <FileText /> {tr("Export as PDF")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void exportFile("docx")}>
            <FileType2 /> {tr("Export as Word")}
          </DropdownMenuItem>
          {!readOnly && enabledProviders.has("git") && <DropdownMenuItem onSelect={() => void onPublishGit()}>
            <GitBranch /> {tr("Publish to Git")}
          </DropdownMenuItem>}
          {!readOnly && enabledProviders.has("jira") && <DropdownMenuItem onSelect={() => void onPublishAtlassian("jira")}>
            <Bug /> {tr("Publish to Jira")}
          </DropdownMenuItem>}
          {!readOnly && enabledProviders.has("confluence") && <DropdownMenuItem onSelect={() => void onPublishAtlassian("confluence")}>
            <BookOpen /> {tr("Publish to Confluence")}
          </DropdownMenuItem>}
          {!readOnly && hasStorage && <DropdownMenuItem onSelect={() => void onPublishS3()}>
            <CloudUpload /> {tr("Publish to object storage")}
          </DropdownMenuItem>}
          {!readOnly && enabledProviders.has("ssh") && <DropdownMenuItem onSelect={() => void onPublishSSH()}>
            <CloudUpload /> {tr("Publish via SSH")}
          </DropdownMenuItem>}
          {!readOnly && groups.length > 0 && <DropdownMenuSeparator />}
          {!readOnly && groups.map((group) => (
            <DropdownMenuItem key={group.id} onSelect={() => void publishGroup(group)}>
              <CloudUpload /> {group.name}
            </DropdownMenuItem>
          ))}
          {!readOnly && !locked && <DropdownMenuSeparator />}
          {!readOnly && !locked && <DropdownMenuItem variant="destructive" onSelect={() => void onArchive()}>
            <Trash2 /> {tr("Move to Trash")}
          </DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>

      <input
        ref={importRef}
        type="file"
        accept=".md,.markdown,.txt,text/markdown,text/plain"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void onImportFile(file)
          event.target.value = ""
        }}
      />
      <RenamePageDialog
        page={page}
        open={renameOpen}
        onOpenChange={setRenameOpen}
      />
    </>
  )
}

function RenamePageDialog({
  page,
  open,
  onOpenChange,
}: {
  page: PageSummary
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const patchSummary = useWorkspaceStore((state) => state.patchSummary)
  const [value, setValue] = useState(page.title)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (open) setValue(page.title)
  }, [open, page.title])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (pending) return
    setPending(true)
    try {
      await api.pages.update(page.id, { title: value })
      patchSummary(page.id, { title: value })
      onOpenChange(false)
      toast.success(tr("Page renamed"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not rename page")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{tr("Rename page")}</DialogTitle>
          <DialogDescription>{tr("Give this page a name that feels right.")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`rename-${page.id}`}>{tr("Title")}</Label>
            <Input
              id={`rename-${page.id}`}
              autoFocus
              value={value}
              onChange={(event) => setValue(event.target.value)}
              placeholder={tr("Untitled")}
              onFocus={(event) => event.currentTarget.select()}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              Save
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
