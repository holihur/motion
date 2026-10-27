import { useEffect, useMemo, useState } from "react"
import { Check, GitMerge, Loader2, Scissors } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { tr } from "@/lib/i18n"
import type { Block, Page, PageSummary } from "@/lib/types"
import { useWorkspaceStore } from "@/stores/workspace"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

function headingLevel(type: string) {
  if (type === "heading1" || type === "toggleHeading1") return 1
  if (type === "heading2" || type === "toggleHeading2") return 2
  if (type === "heading3" || type === "toggleHeading3") return 3
  return 0
}

function splitSections(blocks: Block[], level: number) {
  const sections: { title: string; blocks: number }[] = []
  let intro = 0
  for (const block of blocks) {
    if (headingLevel(block.type) === level) {
      sections.push({ title: block.text.trim() || tr("Untitled section"), blocks: 1 })
    } else if (sections.length === 0) {
      intro += 1
    } else {
      sections[sections.length - 1].blocks += 1
    }
  }
  return { intro, sections }
}

/** Wait for the open page editor to persist its pending changes, with a timeout
 * so the dialog still works when it is opened outside a page (e.g. from Home). */
function flushPage(pageId: string) {
  return new Promise<void>((resolve) => {
    let done = false
    const finish = () => {
      if (done) return
      done = true
      resolve()
    }
    window.dispatchEvent(new CustomEvent("motion:flush-page", {
      detail: { id: pageId, done: finish },
    }))
    window.setTimeout(finish, 1200)
  })
}

export function SplitPageDialog({
  page,
  open,
  onOpenChange,
  onDone,
}: {
  page: PageSummary
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const [full, setFull] = useState<Page | null>(null)
  const [level, setLevel] = useState(2)
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!open) return
    setFull(null)
    setLevel(2)
    setLoading(true)
    api.pages.get(page.id)
      .then(setFull)
      .catch((error) => toast.error(error instanceof Error ? error.message : tr("Could not load page")))
      .finally(() => setLoading(false))
  }, [open, page.id])

  const preview = useMemo(
    () => splitSections(full?.blocks ?? [], level),
    [full?.blocks, level],
  )

  async function submit() {
    if (pending || preview.sections.length === 0) return
    setPending(true)
    try {
      await flushPage(page.id)
      const result = await api.pages.split(page.id, level)
      await useWorkspaceStore.getState().refreshPages()
      toast.success(tr("Split into {n} sub-pages", { n: result.children.length }))
      onOpenChange(false)
      onDone()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not split page"))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Scissors className="size-4 text-brand" /> {tr("Split into sub-pages")}
          </DialogTitle>
          <DialogDescription>
            {tr("Each section becomes a child page. The original page keeps an index with links.")}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
        ) : (
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-muted-foreground">{tr("Split at")}</span>
              {[1, 2, 3].map((value) => {
                const count = splitSections(full?.blocks ?? [], value).sections.length
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setLevel(value)}
                    className={`rounded-md border px-2.5 py-1 text-xs transition ${level === value ? "border-brand bg-brand-soft text-brand" : "text-muted-foreground hover:bg-accent"}`}
                  >
                    H{value} <span className="opacity-60">({count})</span>
                  </button>
                )
              })}
            </div>
            {preview.sections.length === 0 ? (
              <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
                {tr("No headings at this level. Add a heading or choose another level.")}
              </p>
            ) : (
              <div className="max-h-56 overflow-y-auto rounded-lg border thin-scrollbar">
                {preview.sections.map((section, index) => (
                  <div key={`${section.title}-${index}`} className="flex items-center gap-2 border-b px-3 py-2 text-xs last:border-b-0">
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-muted text-[10px] text-muted-foreground">{index + 1}</span>
                    <span className="min-w-0 flex-1 truncate font-medium">{section.title}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{tr("{n} blocks", { n: section.blocks })}</span>
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] text-muted-foreground">
              {tr("Content before the first {level} heading stays on this page.", { level: `H${level}` })}
            </p>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{tr("Cancel")}</Button>
          <Button type="button" onClick={() => void submit()} disabled={pending || loading || preview.sections.length === 0}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : null}
            {tr("Split into {n} pages", { n: preview.sections.length })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function MergePagesDialog({
  page,
  open,
  onOpenChange,
  onDone,
}: {
  page: PageSummary
  open: boolean
  onOpenChange: (open: boolean) => void
  onDone: () => void
}) {
  const activeId = useWorkspaceStore((state) => state.activeId)
  const [children, setChildren] = useState<PageSummary[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [addTitles, setAddTitles] = useState(true)
  const [loading, setLoading] = useState(false)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!open || !activeId) return
    setLoading(true)
    setChildren([])
    setSelected(new Set())
    api.pages.list(activeId)
      .then((pages) => {
        const direct = pages
          .filter((item) => item.parentId === page.id && !item.archived)
          .sort((a, b) => a.order - b.order)
        setChildren(direct)
        setSelected(new Set(direct.map((item) => item.id)))
      })
      .catch((error) => toast.error(error instanceof Error ? error.message : tr("Could not load sub-pages")))
      .finally(() => setLoading(false))
  }, [open, activeId, page.id])

  function toggle(id: string) {
    setSelected((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function submit() {
    if (pending || selected.size === 0) return
    setPending(true)
    try {
      await flushPage(page.id)
      const result = await api.pages.merge(page.id, [...selected], addTitles)
      await useWorkspaceStore.getState().refreshPages()
      toast.success(tr("Merged {n} sub-pages", { n: result.merged }))
      onOpenChange(false)
      onDone()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not merge sub-pages"))
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <GitMerge className="size-4 text-brand" /> {tr("Merge sub-pages")}
          </DialogTitle>
          <DialogDescription>
            {tr("Append the selected sub-pages to this page. They will be moved to Trash and can be restored.")}
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>
        ) : children.length === 0 ? (
          <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">
            {tr("This page has no sub-pages to merge.")}
          </p>
        ) : (
          <div className="space-y-3">
            <div className="max-h-64 overflow-y-auto rounded-lg border thin-scrollbar">
              {children.map((child) => (
                <label key={child.id} className="flex cursor-pointer items-center gap-2 border-b px-3 py-2 text-xs last:border-b-0 hover:bg-accent/40">
                  <input
                    type="checkbox"
                    checked={selected.has(child.id)}
                    onChange={() => toggle(child.id)}
                  />
                  <span className="text-base leading-none">{child.icon || "📄"}</span>
                  <span className="min-w-0 flex-1 truncate">{child.title.trim() || tr("Untitled")}</span>
                </label>
              ))}
            </div>
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              <input type="checkbox" checked={addTitles} onChange={(event) => setAddTitles(event.target.checked)} />
              {tr("Add each page title as a heading")}
            </label>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{tr("Cancel")}</Button>
          <Button type="button" onClick={() => void submit()} disabled={pending || loading || selected.size === 0}>
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
            {tr("Merge {n} pages", { n: selected.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
