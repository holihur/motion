import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronRight, Columns2, FileText, Link2, Pencil, Plus, X } from "lucide-react"
import type { Block, PageSummary, TableData } from "@/lib/types"
import { useWorkspaceStore } from "@/stores/workspace"
import { pageTitle } from "@/lib/tree"
import { cn } from "@/lib/utils"
import { tr } from "@/lib/i18n"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export function defaultColumnsTable(): TableData {
  return { columns: ["Column 1", "Column 2"], rows: [["", ""]], header: false }
}

export function PageLinkBlock({
  block, readOnly, onUpdate,
}: {
  block: Block
  readOnly: boolean
  onUpdate: (patch: Partial<Block>) => void
}) {
  const pages = useWorkspaceStore((state) => state.pages)
  const navigate = useNavigate()
  const target = pages.find((page) => page.id === block.url)
  const [open, setOpen] = useState(!block.url)
  const [query, setQuery] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const matches = pages
    .filter((page) => !page.archived && pageTitle(page.title).toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 24)

  useEffect(() => {
    if (!open) return
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30)
    return () => window.clearTimeout(timer)
  }, [open])

  function choose(page: PageSummary) {
    onUpdate({ url: page.id, text: page.title })
    setOpen(false)
    setQuery("")
  }

  return (
    <div id={`block-input-${block.id}`} data-block-input tabIndex={0} className="my-2 flex items-center gap-1">
      {target ? (
        <button
          type="button"
          onClick={() => navigate(`/page/${target.id}`)}
          className="flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border border-border/70 bg-card px-3 py-2 text-left transition hover:border-brand/40 hover:bg-accent/30"
        >
          <span className="text-base leading-none">{target.icon || "📄"}</span>
          <span className="truncate text-[13px] font-medium">{pageTitle(target.title)}</span>
          <span className="ml-auto text-[10px] text-muted-foreground">{tr("Page")}</span>
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex min-w-0 flex-1 items-center gap-2 rounded-lg border border-dashed px-3 py-2 text-left text-xs text-muted-foreground transition hover:bg-accent/30"
        >
          <Link2 className="size-3.5" /> {block.url ? tr("Missing page — choose another") : tr("Link a page")}
        </button>
      )}
      {!readOnly && (
        <Popover open={open} onOpenChange={setOpen}>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={tr("Change page link")}
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <Pencil className="size-3.5" />
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="w-80 p-2">
            <input
              ref={inputRef}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={tr("Search pages…")}
              className="h-8 w-full rounded-md border bg-background px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
            />
            <div className="mt-1 max-h-64 space-y-0.5 overflow-y-auto thin-scrollbar">
              {matches.map((page) => (
                <button
                  key={page.id}
                  type="button"
                  onClick={() => choose(page)}
                  className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition hover:bg-accent"
                >
                  <span>{page.icon || "📄"}</span>
                  <span className="truncate">{pageTitle(page.title)}</span>
                </button>
              ))}
              {matches.length === 0 && <p className="px-2 py-4 text-center text-[11px] text-muted-foreground">{tr("No pages found.")}</p>}
            </div>
          </PopoverContent>
        </Popover>
      )}
    </div>
  )
}

export function BreadcrumbBlock({ block, breadcrumb }: { block: Block; breadcrumb: { id: string; title: string; icon: string }[] }) {
  const navigate = useNavigate()
  const chain = breadcrumb.length > 0 ? breadcrumb : []
  return (
    <div id={`block-input-${block.id}`} data-block-input tabIndex={0} className="my-2 flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
      <button type="button" onClick={() => navigate("/")} className="rounded px-1 py-0.5 hover:bg-accent hover:text-foreground">{tr("Home")}</button>
      {chain.map((item) => (
        <span key={item.id} className="flex min-w-0 items-center gap-1">
          <ChevronRight className="size-3 shrink-0 opacity-50" />
          <button type="button" onClick={() => navigate(`/page/${item.id}`)} className="flex min-w-0 items-center gap-1 rounded px-1 py-0.5 hover:bg-accent hover:text-foreground">
            {item.icon ? <span>{item.icon}</span> : <FileText className="size-3" />}
            <span className="max-w-[180px] truncate">{pageTitle(item.title)}</span>
          </button>
        </span>
      ))}
    </div>
  )
}

export function ColumnsBlock({
  block, readOnly, onUpdate,
}: {
  block: Block
  readOnly: boolean
  onUpdate: (patch: Partial<Block>) => void
}) {
  const table = block.table ?? defaultColumnsTable()
  const columns = table.columns.length >= 2 ? table.columns : defaultColumnsTable().columns
  const cells = columns.map((_, index) => table.rows[0]?.[index] ?? "")
  const grid = columns.length >= 4 ? "sm:grid-cols-4" : columns.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"

  function save(nextCells: string[], nextColumns = columns) {
    onUpdate({ table: { columns: nextColumns, rows: [nextCells], header: false } })
  }
  function setCell(index: number, value: string) {
    save(cells.map((cell, cellIndex) => (cellIndex === index ? value : cell)))
  }
  function addColumn() {
    if (columns.length >= 4) return
    save([...cells, ""], [...columns, `${tr("Column")} ${columns.length + 1}`])
  }
  function removeColumn(index: number) {
    if (columns.length <= 2) return
    save(cells.filter((_, cellIndex) => cellIndex !== index), columns.filter((_, columnIndex) => columnIndex !== index))
  }

  return (
    <div id={`block-input-${block.id}`} data-block-input tabIndex={0} className="my-2 rounded-xl border border-border/80 bg-card p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <Columns2 className="size-3" /> {tr("Columns")}
        {!readOnly && (
          <div className="ml-auto flex items-center gap-1 normal-case tracking-normal">
            {columns.length < 4 && <button type="button" onClick={addColumn} className="flex items-center gap-1 rounded px-1.5 py-0.5 hover:bg-accent hover:text-foreground"><Plus className="size-3" /> {tr("Column")}</button>}
            {columns.length > 2 && <button type="button" onClick={() => removeColumn(columns.length - 1)} className="rounded p-1 hover:bg-destructive/10 hover:text-destructive" aria-label={tr("Remove column")}><X className="size-3" /></button>}
          </div>
        )}
      </div>
      <div className={cn("grid grid-cols-1 gap-2", grid)}>
        {cells.map((cell, index) => (
          <div key={index} className="min-w-0 rounded-lg border border-border/50 bg-background/40 p-2">
            {readOnly ? (
              <div className="whitespace-pre-wrap text-[13px] leading-6">{cell || <span className="text-muted-foreground/50">—</span>}</div>
            ) : (
              <textarea
                value={cell}
                onChange={(event) => setCell(index, event.target.value)}
                rows={4}
                placeholder={tr("Write in this column…")}
                className="block w-full resize-y bg-transparent text-[13px] leading-6 outline-none placeholder:text-muted-foreground/40"
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
