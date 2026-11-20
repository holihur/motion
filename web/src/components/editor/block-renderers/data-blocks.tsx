import type { BlockRenderProps } from "@/components/editor/block-renderers/types"
import { TableBlockView } from "@/components/editor/table-block-view"
import { DiagramBlockView } from "@/components/editor/diagram-block-view"
import { DatabaseBlock } from "@/components/editor/database-block"
import { ChartBlock, GanttBlock } from "@/components/editor/data-blocks"
import { CalendarBlock } from "@/components/editor/calendar-block"

export function TableBlockRenderer({ block, readOnly, onUpdate, onFocusBlock }: BlockRenderProps) {
  return <TableBlockView block={block} readOnly={readOnly} onUpdate={onUpdate} onFocusBlock={onFocusBlock} />
}

export function DiagramBlockRenderer({ block, readOnly, onUpdate, onFocusBlock }: BlockRenderProps) {
  return <DiagramBlockView block={block} readOnly={readOnly} onUpdate={onUpdate} onFocusBlock={onFocusBlock} />
}

export function DatabaseBlockRenderer({ block, workspaceId, readOnly, onUpdate }: BlockRenderProps) {
  return <DatabaseBlock block={block} workspaceId={workspaceId} readOnly={readOnly} onUpdate={onUpdate} />
}

export function GanttBlockRenderer({ block, readOnly, autoFocus, onUpdate }: BlockRenderProps) {
  return <GanttBlock block={block} readOnly={readOnly} autoFocus={autoFocus} onUpdate={onUpdate} />
}

export function ChartBlockRenderer({ block, readOnly, autoFocus, onUpdate }: BlockRenderProps) {
  return <ChartBlock block={block} readOnly={readOnly} autoFocus={autoFocus} onUpdate={onUpdate} />
}

export function CalendarBlockRenderer({ block, readOnly, onUpdate }: BlockRenderProps) {
  return <CalendarBlock block={block} readOnly={readOnly} onUpdate={onUpdate} />
}
