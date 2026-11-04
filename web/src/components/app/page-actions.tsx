import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowDown,
  ArrowUp,
  Copy,
  FilePlus2,
  Link2,
  MoreHorizontal,
  PencilLine,
  Settings2,
  Star,
  StarOff,
} from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
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
  onMoveUp?: () => void
  onMoveDown?: () => void
}

export function PageActionsMenu({ page, align = "start", trigger, readOnly = false, onRenameRequest, onMoveUp, onMoveDown }: PageActionsProps) {
  const navigate = useNavigate()
  const toggleFavorite = useWorkspaceStore((state) => state.toggleFavorite)
  const [renameOpen, setRenameOpen] = useState(false)

  async function onCopyLink() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/page/${page.id}`)
      toast.success(tr("Link copied to clipboard"))
    } catch {
      toast.error(tr("Could not copy link"))
    }
  }

  function onAddSubpage() {
    window.dispatchEvent(new CustomEvent("motion:expand-page", { detail: { id: page.id } }))
    navigate("/new-page", { state: { parentId: page.id } })
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
              aria-label={tr("Page options")}
              className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground data-[state=open]:bg-sidebar-accent"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          )}
        </DropdownMenuTrigger>
        <DropdownMenuContent align={align} className="w-56">
          <DropdownMenuItem onSelect={() => navigate(`/page/${page.id}/settings`)}>
            <Settings2 /> {tr("Page settings")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          {!readOnly && (
            <DropdownMenuItem onSelect={openRename}>
              <PencilLine /> {tr("Rename")}
            </DropdownMenuItem>
          )}
          {!readOnly && (
            <DropdownMenuItem
              onSelect={() => {
                void toggleFavorite(page.id).then((favorite) =>
                  toast.success(favorite ? tr("Added to Favorites") : tr("Removed from Favorites")),
                )
              }}
            >
              {page.favorite ? <StarOff /> : <Star />}
              {page.favorite ? tr("Remove from Favorites") : tr("Add to Favorites")}
            </DropdownMenuItem>
          )}
          {!readOnly && (
            <DropdownMenuItem onSelect={onAddSubpage}>
              <FilePlus2 /> {tr("Add sub-page")}
            </DropdownMenuItem>
          )}
          {!readOnly && onMoveUp && (
            <DropdownMenuItem onSelect={onMoveUp}>
              <ArrowUp /> {tr("Move up")}
            </DropdownMenuItem>
          )}
          {!readOnly && onMoveDown && (
            <DropdownMenuItem onSelect={onMoveDown}>
              <ArrowDown /> {tr("Move down")}
            </DropdownMenuItem>
          )}
          <DropdownMenuItem onSelect={() => void onCopyLink()}>
            <Link2 /> {tr("Copy link")}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={() => navigate(`/page/${page.id}/settings`)}>
            <Copy /> {tr("Import, export & publishing…")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <RenamePageDialog page={page} open={renameOpen} onOpenChange={setRenameOpen} />
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
      toast.error(error instanceof Error ? error.message : tr("Could not rename page"))
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
              {tr("Cancel")}
            </Button>
            <Button type="submit" disabled={pending}>
              {tr("Save")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
