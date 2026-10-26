import { useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import {
  Copy,
  Download,
  FilePlus2,
  Link2,
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
import type { PageSummary } from "@/lib/types"
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

export function PageActionsMenu({ page, align = "start", trigger, readOnly = false, onRenameRequest }: PageActionsProps) {
  const navigate = useNavigate()
  const location = useLocation()
  const createPage = useWorkspaceStore((state) => state.createPage)
  const toggleFavorite = useWorkspaceStore((state) => state.toggleFavorite)
  const archivePage = useWorkspaceStore((state) => state.archivePage)
  const restorePage = useWorkspaceStore((state) => state.restorePage)
  const duplicatePage = useWorkspaceStore((state) => state.duplicatePage)
  const [renameOpen, setRenameOpen] = useState(false)

  const isCurrent = location.pathname === `/page/${page.id}`

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
      <DropdownMenu>
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
          {!readOnly && <DropdownMenuItem onSelect={openRename}>
            <PencilLine /> {tr("Rename")}
          </DropdownMenuItem>}
          {!readOnly && <DropdownMenuItem
            onSelect={() => {
              void toggleFavorite(page.id).then((favorite) =>
                toast.success(favorite ? "Added to Favorites" : "Removed from Favorites"),
              )
            }}
          >
            {page.favorite ? <StarOff /> : <Star />}
            {page.favorite ? tr("Remove from Favorites") : tr("Add to Favorites")}
          </DropdownMenuItem>}
          {!readOnly && <DropdownMenuItem onSelect={() => void onAddSubpage()}>
            <FilePlus2 /> {tr("Add sub-page")}
          </DropdownMenuItem>}
          {!readOnly && <DropdownMenuSeparator />}
          {!readOnly && <DropdownMenuItem onSelect={() => void onDuplicate()}>
            <Copy /> {tr("Duplicate")}
          </DropdownMenuItem>}
          <DropdownMenuItem onSelect={() => void onCopyLink()}>
            <Link2 /> {tr("Copy link")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void onExport()}>
            <Download /> {tr("Export as Markdown")}
          </DropdownMenuItem>
          {!readOnly && <DropdownMenuSeparator />}
          {!readOnly && <DropdownMenuItem variant="destructive" onSelect={() => void onArchive()}>
            <Trash2 /> {tr("Move to Trash")}
          </DropdownMenuItem>}
        </DropdownMenuContent>
      </DropdownMenu>

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
