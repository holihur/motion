import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { FileText, Home, RotateCcw, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { formatRelative } from "@/lib/utils"
import { pageTitle } from "@/lib/tree"
import { tr } from "@/lib/i18n"
import type { PageSummary } from "@/lib/types"
import { useWorkspaceStore } from "@/stores/workspace"
import { SidebarToggle } from "@/components/app/sidebar-toggle"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function TrashView() {
  const navigate = useNavigate()
  const activeId = useWorkspaceStore((state) => state.activeId)
  const trash = useWorkspaceStore((state) => state.trash)
  const fetchTrash = useWorkspaceStore((state) => state.fetchTrash)
  const restorePage = useWorkspaceStore((state) => state.restorePage)
  const deletePageForever = useWorkspaceStore((state) => state.deletePageForever)
  const [loading, setLoading] = useState(true)
  const [pendingDelete, setPendingDelete] = useState<PageSummary | null>(null)
  const [busy, setBusy] = useState<string | null>(null)

  useEffect(() => {
    document.title = tr("Trash") + " · Motion"
  }, [])

  useEffect(() => {
    if (!activeId) return
    let alive = true
    setLoading(true)
    fetchTrash()
      .catch((error) => toast.error(error instanceof Error ? error.message : "Could not load Trash"))
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [activeId, fetchTrash])

  async function restore(page: PageSummary) {
    setBusy(page.id)
    try {
      await restorePage(page.id)
      toast.success(`Restored “${pageTitle(page.title)}”`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not restore page")
    } finally {
      setBusy(null)
    }
  }

  async function destroy(page: PageSummary) {
    setBusy(page.id)
    try {
      await deletePageForever(page.id)
      setPendingDelete(null)
      toast.success("Page permanently deleted")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete page")
    } finally {
      setBusy(null)
    }
  }

  return (
    <>
      <header className="flex h-11 shrink-0 items-center gap-1 border-b border-border/70 px-3">
        <SidebarToggle />
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <button
            type="button"
            onClick={() => navigate("/")}
            className="flex items-center gap-1 rounded px-1 py-0.5 hover:bg-accent hover:text-foreground"
          >
            <Home className="size-3.5" />
            Home
          </button>
          <span className="text-muted-foreground/60">/</span>
          <span className="font-medium text-foreground">{tr("Trash")}</span>
        </nav>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto thin-scrollbar">
        <div className="mx-auto w-full max-w-3xl px-5 pb-24 pt-12 sm:px-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-2.5 text-2xl font-semibold tracking-tight">
                <Trash2 className="size-5 text-muted-foreground" />
                Trash
              </h1>
              <p className="mt-2 text-sm text-muted-foreground">
                {tr("Pages stay here until you restore or delete them forever.")}
              </p>
            </div>
            <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
              {trash.length} {tr("items")}
            </span>
          </div>

          <div className="mt-8">
            {loading ? (
              <div className="space-y-2">
                {[0, 1, 2].map((item) => (
                  <Skeleton key={item} className="h-16 w-full rounded-xl" />
                ))}
              </div>
            ) : trash.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-border px-6 py-16 text-center">
                <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted">
                  <Trash2 className="size-5 text-muted-foreground" />
                </div>
                <h2 className="mt-4 text-sm font-medium">{tr("Trash is empty")}</h2>
                <p className="mt-1 text-xs text-muted-foreground">{tr("Deleted pages will show up here.")}</p>
              </div>
            ) : (
              <div className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/80 bg-card">
                {trash.map((page) => (
                  <div key={page.id} data-page-id={page.id} className="flex items-center gap-3 px-4 py-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-lg">
                      {page.icon || <FileText className="size-4 text-muted-foreground" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium">{pageTitle(page.title)}</div>
                      <div className="text-[11px] text-muted-foreground">
                        {tr("Last edited {time}", { time: formatRelative(page.updatedAt) })}
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1.5"
                        disabled={busy === page.id}
                        onClick={() => void restore(page)}
                      >
                        <RotateCcw className="size-3.5" />
                        <span className="hidden sm:inline">{tr("Restore")}</span>
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                        disabled={busy === page.id}
                        onClick={() => setPendingDelete(page)}
                        aria-label={tr("Delete forever")}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <Dialog open={!!pendingDelete} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tr("Delete forever?")}</DialogTitle>
            <DialogDescription>
              {tr("“{title}” and any nested pages will be permanently removed. This cannot be undone.", {
                title: pageTitle(pendingDelete?.title ?? ""),
              })}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPendingDelete(null)}>{tr("Cancel")}</Button>
            <Button
              variant="destructive"
              disabled={busy === pendingDelete?.id}
              onClick={() => pendingDelete && void destroy(pendingDelete)}
            >
              {tr("Delete forever")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
