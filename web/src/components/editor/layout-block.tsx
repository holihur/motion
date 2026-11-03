import { lazy, Suspense } from "react"
import { Columns3, Plus, X } from "lucide-react"
import type { Block, LayoutColumn, Member } from "@/lib/types"
import { tr } from "@/lib/i18n"
import { createBlock } from "@/components/editor/block-factory"

const NestedBlockEditor = lazy(() =>
  import("@/components/editor/block-editor").then((module) => ({ default: module.BlockEditor })),
)

function emptyColumn(): LayoutColumn {
  return { blocks: [createBlock("paragraph")] }
}

function normalizeColumns(block: Block): LayoutColumn[] {
  const columns = block.layout?.columns?.filter(Boolean) ?? []
  if (columns.length === 0) return [emptyColumn(), emptyColumn()]
  return columns.slice(0, 4).map((column) => ({ blocks: column.blocks ?? [] }))
}

export function LayoutBlock({
  block,
  readOnly,
  onUpdate,
  pageId,
  workspaceId,
  members,
  onFocusBlock,
}: {
  block: Block
  readOnly: boolean
  onUpdate: (patch: Partial<Block>) => void
  pageId: string
  workspaceId: string
  members: Member[]
  onFocusBlock?: (blockId: string) => void
}) {
  const columns = normalizeColumns(block)
  const save = (next: LayoutColumn[]) => onUpdate({ layout: { columns: next } })
  const grid = columns.length >= 4 ? "sm:grid-cols-4" : columns.length === 3 ? "sm:grid-cols-3" : "sm:grid-cols-2"

  return (
    <div id={`block-input-${block.id}`} data-block-input tabIndex={0} className="my-2 rounded-xl border border-border/80 bg-card p-3">
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <Columns3 className="size-3" /> {tr("Layout")}
        <span className="normal-case tracking-normal text-muted-foreground/60">{columns.length}</span>
        {!readOnly && (
          <div className="ml-auto flex items-center gap-1 normal-case tracking-normal">
            {columns.length < 4 && (
              <button
                type="button"
                onClick={() => save([...columns, emptyColumn()])}
                className="flex items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 hover:bg-accent hover:text-foreground"
              >
                <Plus className="size-3" /> {tr("Add column")}
              </button>
            )}
            {columns.length > 2 && (
              <button
                type="button"
                onClick={() => save(columns.slice(0, -1))}
                aria-label={tr("Remove column")}
                title={tr("Remove column")}
                className="rounded p-1 hover:bg-destructive/10 hover:text-destructive"
              >
                <X className="size-3" />
              </button>
            )}
          </div>
        )}
      </div>
      <div className={`grid grid-cols-1 gap-2 ${grid}`}>
        {columns.map((column, index) => (
          <div key={index} className="min-w-0 rounded-lg border border-border/50 bg-background/40 p-2">
            <Suspense fallback={<div className="h-24 animate-pulse rounded-md bg-muted/25" />}>
              <NestedBlockEditor
                blocks={column.blocks}
                onChange={(blocks) => save(columns.map((item, itemIndex) => (itemIndex === index ? { blocks } : item)))}
                readOnly={readOnly}
                pageId={pageId}
                workspaceId={workspaceId}
                members={members}
                onFocusBlock={onFocusBlock}
              />
            </Suspense>
          </div>
        ))}
      </div>
    </div>
  )
}
