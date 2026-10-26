import { useEffect, useState } from "react"
import { Clock3, History, Loader2, RotateCcw, Save } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { Page, PageRevision } from "@/lib/types"
import { cn, formatDate, formatRelative } from "@/lib/utils"
import { tr } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function HistoryDialog({
  open,
  onOpenChange,
  page,
  onRestored,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  page: Page
  onRestored: (page: Page) => void
}) {
  const [revisions, setRevisions] = useState<PageRevision[]>([])
  const [selected, setSelected] = useState<PageRevision | null>(null)
  const [loading, setLoading] = useState(false)
  const [previewLoading, setPreviewLoading] = useState(false)
  const [restoring, setRestoring] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setSelected(null)
    api.pages
      .revisions(page.id)
      .then((items) => {
        setRevisions(items)
        if (items[0]) void selectRevision(items[0])
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : "Could not load history"))
      .finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, page.id])

  async function selectRevision(revision: PageRevision) {
    setPreviewLoading(true)
    try {
      setSelected(await api.pages.revision(page.id, revision.id))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not load version")
    } finally {
      setPreviewLoading(false)
    }
  }

  async function saveVersion() {
    try {
      const revision = await api.pages.createRevision(page.id)
      setRevisions((items) => [revision, ...items])
      setSelected(revision)
      toast.success(tr("Current version saved"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not save version")
    }
  }

  async function restore() {
    if (!selected) return
    setRestoring(true)
    try {
      const restored = await api.pages.restoreRevision(page.id, selected.id)
      onRestored(restored)
      setConfirmOpen(false)
      onOpenChange(false)
      toast.success(tr("Version restored"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not restore version")
    } finally {
      setRestoring(false)
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[90svh] max-w-3xl overflow-hidden p-0">
          <DialogHeader className="border-b px-6 py-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <DialogTitle className="flex items-center gap-2">
                  <History className="size-4 text-brand" /> {tr("Version history")}
                </DialogTitle>
                <DialogDescription>
                  {tr("Snapshots are taken automatically, or whenever you save one.")}
                </DialogDescription>
              </div>
              <Button variant="outline" size="sm" className="mr-6 h-7 gap-1.5 text-[11px]" onClick={() => void saveVersion()}>
                <Save className="size-3" /> {tr("Save current version")}
              </Button>
            </div>
          </DialogHeader>

          <div className="grid min-h-0 flex-1 grid-cols-1 sm:grid-cols-[220px_1fr]">
            <div className="max-h-48 overflow-y-auto border-b p-2 thin-scrollbar sm:max-h-[440px] sm:border-b-0 sm:border-r">
              {loading ? (
                <div className="flex items-center justify-center py-10 text-muted-foreground">
                  <Loader2 className="size-4 animate-spin" />
                </div>
              ) : revisions.length === 0 ? (
                <p className="px-2 py-8 text-center text-xs text-muted-foreground">
                  {tr("No versions yet. Start editing to create the first snapshot.")}
                </p>
              ) : (
                <div className="space-y-0.5">
                  {revisions.map((revision, index) => (
                    <button
                      key={revision.id}
                      type="button"
                      onClick={() => void selectRevision(revision)}
                      className={cn(
                        "flex w-full items-start gap-2 rounded-lg px-2 py-2 text-left transition",
                        selected?.id === revision.id ? "bg-accent" : "hover:bg-accent/50",
                      )}
                    >
                      <Clock3 className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[11px] font-medium">
                          {index === 0 ? tr("Latest") + " · " : ""}
                          {formatRelative(revision.createdAt)}
                        </span>
                        <span className="block text-[10px] text-muted-foreground">
                          {revision.authorName || "Someone"}
                        </span>
                        <span className="mt-0.5 block truncate text-[10px] text-muted-foreground/80">
                          {revision.title || tr("Untitled")}
                        </span>
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="min-h-0 max-h-[440px] overflow-y-auto p-5 thin-scrollbar">
              {previewLoading ? (
                <div className="flex h-full items-center justify-center">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : !selected ? (
                <div className="flex h-full flex-col items-center justify-center gap-2 text-center text-xs text-muted-foreground">
                  <History className="size-6" />
                  {tr("Choose a version to preview it.")}
                </div>
              ) : (
                <div>
                  <div className="mb-4 border-b pb-3">
                    <h3 className="text-lg font-semibold">{selected.title.trim() || tr("Untitled")}</h3>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      {formatDate(selected.createdAt)} · {tr("saved by {name}", { name: selected.authorName || "Someone" })}
                    </p>
                  </div>
                  <div className="space-y-2">
                    {(selected.blocks ?? []).map((block) => (
                      <PreviewBlock key={block.id} block={block} />
                    ))}
                  </div>
                  <div className="mt-5 flex justify-end border-t pt-4">
                    <Button variant="outline" size="sm" className="gap-1.5" onClick={() => setConfirmOpen(true)}>
                      <RotateCcw className="size-3.5" /> {tr("Restore this version")}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tr("Restore this version")}?</DialogTitle>
            <DialogDescription>
              {tr("The current page will be saved as a version first, so you can undo this restore.")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmOpen(false)}>{tr("Cancel")}</Button>
            <Button onClick={() => void restore()} disabled={restoring}>
              {restoring && <Loader2 className="size-4 animate-spin" />}
              Restore version
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function PreviewBlock({ block }: { block: PageRevision["blocks"] extends (infer T)[] | undefined ? T : never }) {
  switch (block.type) {
    case "heading1":
      return <h1 className="text-xl font-semibold">{block.text}</h1>
    case "heading2":
      return <h2 className="text-lg font-semibold">{block.text}</h2>
    case "heading3":
      return <h3 className="text-base font-semibold">{block.text}</h3>
    case "bulleted":
      return <p className="text-xs">• {block.text}</p>
    case "numbered":
      return <p className="text-xs">1. {block.text}</p>
    case "todo":
      return <p className="text-xs">{block.checked ? "☑" : "☐"} {block.text}</p>
    case "quote":
      return <blockquote className="border-l-2 pl-3 text-xs italic">{block.text}</blockquote>
    case "callout":
      return <div className="rounded bg-muted px-2 py-1.5 text-xs">💡 {block.text}</div>
    case "code":
      return <pre className="overflow-x-auto rounded bg-muted p-2 font-mono text-[10px]">{block.text}</pre>
    case "divider":
      return <hr />
    case "image":
      return block.url ? <p className="text-xs text-muted-foreground">[Image: {block.url}]</p> : null
    case "table":
      return (
        <div className="overflow-x-auto text-[10px]">
          {block.table && (
            <table className="border-collapse">
              <thead>
                <tr>
                  {block.table.columns.map((column, index) => (
                    <th key={index} className="border bg-muted/50 px-2 py-1 text-left font-medium">{column}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {block.table.rows.map((row, rowIndex) => (
                  <tr key={rowIndex}>
                    {block.table!.columns.map((_, cellIndex) => (
                      <td key={cellIndex} className="border px-2 py-1">{row[cellIndex] ?? ""}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )
    case "diagram":
      return <pre className="overflow-x-auto rounded bg-muted p-2 font-mono text-[10px]">{block.text}</pre>
    default:
      return <p className="whitespace-pre-wrap text-xs leading-5">{block.text || "—"}</p>
  }
}
