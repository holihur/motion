import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowUpRight, FileText, Link2, Loader2, RefreshCw, Repeat2 } from "lucide-react"
import { api } from "@/lib/api"
import type { Block, Page } from "@/lib/types"
import { useWorkspaceStore } from "@/stores/workspace"
import { pageTitle } from "@/lib/tree"
import { tr } from "@/lib/i18n"
import { cn } from "@/lib/utils"

function blockPreview(block: Block | undefined): string {
  if (!block) return ""
  if (block.type === "table" || block.type === "database" || block.type === "gantt" || block.type === "chart" || block.type === "calendar") {
    return tr("{n} rows", { n: block.table?.rows?.length ?? block.database?.rows?.length ?? 0 })
  }
  if (block.type === "image") return block.url ?? tr("Image")
  if (block.type === "code") return block.text.slice(0, 400)
  return block.text
}

/**
 * Read-only reference to a block in another page (`blockRef`) or a live mirror
 * of it (`blockSync`). Editing always happens at the source block.
 */
export function ReferenceBlock({
  block,
  pageId,
  readOnly,
  onUpdate,
}: {
  block: Block
  pageId: string
  readOnly: boolean
  onUpdate: (patch: Partial<Block>) => void
}) {
  const pages = useWorkspaceStore((state) => state.pages)
  const navigate = useNavigate()
  const synced = block.type === "blockSync"
  const [target, setTarget] = useState<Page | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState("")
  const [editing, setEditing] = useState(!block.refPageId || !block.refBlockId)
  const [pickPage, setPickPage] = useState(block.refPageId ?? "")
  const [pickBlock, setPickBlock] = useState(block.refBlockId ?? "")
  const [pickerBlocks, setPickerBlocks] = useState<Block[]>([])
  const [pickerLoading, setPickerLoading] = useState(false)

  const candidates = useMemo(
    () => pages.filter((page) => !page.archived && page.id !== pageId),
    [pages, pageId],
  )

  useEffect(() => {
    setEditing(!block.refPageId || !block.refBlockId)
    setPickPage(block.refPageId ?? "")
    setPickBlock(block.refBlockId ?? "")
  }, [block.refPageId, block.refBlockId])

  useEffect(() => {
    if (!block.refPageId) {
      setTarget(null)
      return
    }
    let alive = true
    setLoading(true)
    setError("")
    api.pages
      .get(block.refPageId)
      .then((page) => {
        if (alive) setTarget(page)
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : tr("Could not load the referenced block"))
      })
      .finally(() => {
        if (alive) setLoading(false)
      })
    return () => {
      alive = false
    }
  }, [block.refPageId])

  // Load the source page's blocks for the picker.
  useEffect(() => {
    if (!editing || !pickPage) {
      setPickerBlocks([])
      return
    }
    let alive = true
    setPickerLoading(true)
    api.pages
      .get(pickPage)
      .then((page) => {
        if (alive) setPickerBlocks(page.blocks.filter((item) => item.id !== block.id && item.type !== "blockRef" && item.type !== "blockSync"))
      })
      .catch(() => {
        if (alive) setPickerBlocks([])
      })
      .finally(() => {
        if (alive) setPickerLoading(false)
      })
    return () => {
      alive = false
    }
  }, [editing, pickPage, block.id])

  function openSource() {
    if (!block.refPageId) return
    navigate(`/page/${block.refPageId}`)
    window.setTimeout(() => {
      window.dispatchEvent(new CustomEvent("motion:scroll-block", { detail: { id: block.refBlockId } }))
      document.getElementById(`block-${block.refBlockId}`)?.scrollIntoView({ block: "center", behavior: "smooth" })
    }, 400)
  }

  if (editing) {
    return (
      <div id={`block-input-${block.id}`} data-block-input tabIndex={0} className="my-2 space-y-2 rounded-xl border border-dashed border-border bg-muted/15 p-3 outline-none focus-visible:ring-2 focus-visible:ring-brand/25">
        <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          {synced ? <Repeat2 className="size-3.5" /> : <Link2 className="size-3.5" />}
          {synced ? tr("Synced block") : tr("Reference block")}
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          <select
            value={pickPage}
            onChange={(event) => {
              setPickPage(event.target.value)
              setPickBlock("")
            }}
            className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs"
            aria-label={tr("Choose a page")}
          >
            <option value="">{tr("Choose a page")}</option>
            {candidates.map((page) => (
              <option key={page.id} value={page.id}>{pageTitle(page.title)}</option>
            ))}
          </select>
          <select
            value={pickBlock}
            onChange={(event) => setPickBlock(event.target.value)}
            disabled={!pickPage || pickerLoading}
            className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs"
            aria-label={tr("Choose a block")}
          >
            <option value="">{pickerLoading ? tr("Loading…") : tr("Choose a block")}</option>
            {pickerBlocks.map((item, index) => (
              <option key={item.id} value={item.id}>
                {`${index + 1}. ${(blockPreview(item) || item.type).slice(0, 60)}`}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!pickPage || !pickBlock || readOnly}
            onClick={() => {
              onUpdate({ refPageId: pickPage, refBlockId: pickBlock, text: "", rich: "" })
              setEditing(false)
            }}
            className="h-8 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground disabled:opacity-40"
          >
            {tr("Insert")}
          </button>
          {block.refPageId && (
            <button type="button" onClick={() => setEditing(false)} className="h-8 rounded-md border px-2 text-xs text-muted-foreground hover:bg-accent">
              {tr("Cancel")}
            </button>
          )}
        </div>
        {error && <p className="text-[11px] text-destructive">{error}</p>}
      </div>
    )
  }

  const sourceBlock = target?.blocks.find((item) => item.id === block.refBlockId)
  const preview = blockPreview(sourceBlock)

  return (
    <div className="group/reference my-2 overflow-hidden rounded-xl border border-border/70 bg-card shadow-sm">
      <div className="flex items-center gap-1.5 border-b border-border/60 bg-muted/30 px-3 py-1.5 text-[11px] text-muted-foreground">
        {synced ? <Repeat2 className="size-3.5 shrink-0 text-brand" /> : <Link2 className="size-3.5 shrink-0 text-brand" />}
        <span className="shrink-0 font-medium text-foreground">{synced ? tr("Synced block") : tr("Reference block")}</span>
        <button type="button" onClick={openSource} className="flex min-w-0 items-center gap-1 truncate hover:text-foreground" title={tr("Open source block")}>
          <span className="truncate">{pageTitle(target?.title ?? "")}</span>
          <ArrowUpRight className="size-3 shrink-0" />
        </button>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <button
            type="button"
            aria-label={tr("Refresh")}
            onClick={() => {
              if (!block.refPageId) return
              setLoading(true)
              api.pages.get(block.refPageId).then(setTarget).catch(() => undefined).finally(() => setLoading(false))
            }}
            className="rounded p-1 hover:bg-accent hover:text-foreground"
          >
            <RefreshCw className={cn("size-3", loading && "animate-spin")} />
          </button>
          {!readOnly && (
            <button type="button" onClick={() => setEditing(true)} className="rounded px-1.5 py-0.5 hover:bg-accent hover:text-foreground">
              {tr("Change reference")}
            </button>
          )}
        </div>
      </div>
      <div className="px-3 py-2.5 text-sm leading-6">
        {loading && !target ? (
          <span className="flex items-center gap-1.5 text-xs text-muted-foreground"><Loader2 className="size-3.5 animate-spin" /> {tr("Loading…")}</span>
        ) : error ? (
          <span className="text-xs text-destructive">{error}</span>
        ) : sourceBlock ? (
          <div className={cn(sourceBlock.type === "code" && "font-mono text-xs whitespace-pre-wrap")}>
            {preview || <span className="text-xs text-muted-foreground">{tr("Empty block")}</span>}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">{tr("The source block was deleted.")}</span>
        )}
      </div>
      <div className="flex items-center gap-1 border-t border-border/60 px-3 py-1 text-[10px] text-muted-foreground">
        <FileText className="size-3" />
        {synced ? tr("Mirrors the source block. Edit it there to update every copy.") : tr("Read-only copy of the source block.")}
      </div>
    </div>
  )
}

export function ReferenceBlockRenderer(props: {
  block: Block
  pageId: string
  readOnly: boolean
  onUpdate: (patch: Partial<Block>) => void
}) {
  return <ReferenceBlock {...props} />
}
