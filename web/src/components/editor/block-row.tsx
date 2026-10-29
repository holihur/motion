import { useEffect, useRef, useState } from "react"
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Check,
  ClipboardCopy,
  Columns2,
  Copy,
  GripVertical,
  LockKeyhole,
  LockOpen,
  ImageIcon,
  MessageSquare,
  MoreHorizontal,
  MoreVertical,
  Network,
  Palette,
  Plus,
  RefreshCw,
  ChevronRight,
  Table2,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import type { Block, BlockType, Comment, Member } from "@/lib/types"
import { BLOCK_LABELS, SLASH_COMMANDS } from "@/components/editor/commands"
import { CALLOUT_COLORS, CALLOUT_EMOJI } from "@/lib/covers"
import { cn, formatRelative } from "@/lib/utils"
import { isImeKeyEvent } from "@/lib/keyboard"
import { useTableBlock } from "@/components/editor/use-table-block"
import {
  ALIGN_STYLE_TYPES,
  BACKGROUND_COLORS,
  TEXT_COLORS,
  TEXT_STYLE_TYPES,
  alignClass,
  backgroundColorClass,
  imageAlignClass,
  imageWidthClass,
  textColorClass,
} from "@/lib/block-style"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { RealtimePresence } from "@/lib/realtime"
import { MermaidDiagram } from "@/components/editor/mermaid-diagram"
import { LexicalBlock } from "@/components/editor/lexical-block"
import { PasswordBlock } from "@/components/editor/password-block"
import { CodeBlock } from "@/components/editor/code-block"
import { DatabaseBlock } from "@/components/editor/database-block"
import { ChartBlock, GanttBlock } from "@/components/editor/data-blocks"
import { BarcodeBlock, QRCodeBlock } from "@/components/editor/code-image-blocks"
import { FormBlock } from "@/components/editor/form-block"
import { ImageBlock } from "@/components/editor/image-block"
import { MapBlock } from "@/components/editor/map-block"
import { BreadcrumbBlock, ColumnsBlock, PageLinkBlock } from "@/components/editor/link-blocks"
import {
  BookmarkBlock,
  EmbedBlock,
  EquationBlock,
  FileBlock,
  TocBlock,
  VideoBlock,
  type HeadingItem,
} from "@/components/editor/rich-blocks"
import { tr } from "@/lib/i18n"
import { ColorGrid } from "@/components/ui/color-grid"

export interface BlockRowProps {
  block: Block
  index: number
  number: number
  placeholder: string
  slashActive: boolean
  isDragging: boolean
  dropPosition: "before" | "after" | null
  readOnly?: boolean
  isLayout?: boolean
  hasContentPlaceholder?: boolean
  selected?: boolean
  onSelectionStart?: (event: React.MouseEvent<HTMLElement>, index: number) => void
  onSelectBlock?: () => void
  onToggleLock?: () => void
  resetKey?: number
  autoFocus?: boolean
  autoFocusWhere?: "start" | "end"
  autoFocusOffset?: number
  hasChildren?: boolean
  onToggleCollapsed?: () => void
  headings?: HeadingItem[]
  breadcrumb?: { id: string; title: string; icon: string }[]
  workspaceId?: string
  pageId?: string
  members?: Member[]
  focusUsers?: RealtimePresence[]
  commentCount?: number
  comments?: Comment[]
  onOpenComments?: () => void
  onCommentsChanged?: () => void
  onCommentBlock?: (blockId: string) => void
  onFocusBlock?: (blockId: string) => void
  onInput: (text: string, el: HTMLElement, rich?: string) => void
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>, index: number) => void
  onPaste: (text: string) => void
  onToggle: () => void
  onUpdate: (patch: Partial<Block>) => void
  onConvert: (type: BlockType) => void
  onDelete: () => void
  onDuplicate: () => void
  onInsertAbove?: () => void
  onInsertBelow?: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  canMoveUp?: boolean
  canMoveDown?: boolean
  onInsertAfter: (rect: DOMRect) => void
  onDragStart: () => void
  onDragEnd: () => void
  onDragOver: (position: "before" | "after") => void
  onDrop: (position: "before" | "after") => void
}

export function BlockRow(props: BlockRowProps) {
  const {
    block,
    index,
    number,
    placeholder,
    slashActive,
    isDragging,
    dropPosition,
    readOnly: pageReadOnly = false,
    isLayout = false,
    hasContentPlaceholder = false,
    selected = false,
    onSelectionStart,
    onSelectBlock,
    onToggleLock,
    resetKey = 0,
    autoFocus = false,
    autoFocusWhere,
    autoFocusOffset,
    hasChildren = false,
    onToggleCollapsed,
    headings = [],
    breadcrumb = [],
    workspaceId = "",
    pageId = "",
    members = [],
    focusUsers,
    commentCount = 0,
    comments = [],
    onOpenComments,
    onCommentsChanged,
    onCommentBlock,
    onFocusBlock,
    onInput,
    onKeyDown,
    onPaste,
    onToggle,
    onUpdate,
    onConvert,
    onDelete,
    onDuplicate,
    onInsertAbove,
    onInsertBelow,
    onMoveUp,
    onMoveDown,
    canMoveUp = false,
    canMoveDown = false,
    onInsertAfter,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDrop,
  } = props

  const locked = Boolean(block.locked)
  const readOnly = pageReadOnly || locked
  const textStyled = TEXT_STYLE_TYPES.has(block.type)
  const aligned = ALIGN_STYLE_TYPES.has(block.type)
  const blockBackground = textStyled ? backgroundColorClass(block.bgColor) : ""
  const contentClassName = cn(
    "min-w-0 flex-1",
    textStyled && textColorClass(block.textColor),
    aligned && alignClass(block.align),
    blockBackground && cn("-mx-2 rounded-md px-2", blockBackground),
  )

  const editableRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const [diagramEditing, setDiagramEditing] = useState(!block.text)

  useEffect(() => {
    const el = editableRef.current
    if (!el) return
    if (el.innerText !== block.text) el.innerText = block.text
  }, [block.text, block.type])

  function handleOver(event: React.DragEvent) {
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    const rect = rowRef.current?.getBoundingClientRect()
    if (!rect) return
    onDragOver(event.clientY < rect.top + rect.height / 2 ? "before" : "after")
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault()
    const rect = rowRef.current?.getBoundingClientRect()
    if (!rect) return
    onDrop(event.clientY < rect.top + rect.height / 2 ? "before" : "after")
  }

  function deleteDividerFocused(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault()
      onDelete()
    } else {
      onKeyDown(event, index)
    }
  }

  function renderEditable(className: string) {
    return (
      <LexicalBlock
        id={block.id}
        text={block.text}
        rich={block.rich}
        placeholder={placeholder}
        className={className}
        readOnly={readOnly}
        resetKey={resetKey}
        autoFocus={autoFocus}
        autoFocusWhere={autoFocusWhere}
        autoFocusOffset={autoFocusOffset}
        onFocus={() => onFocusBlock?.(block.id)}
        onInput={(text, rich, el) => onInput(text, el, rich)}
        onKeyDown={(event) => onKeyDown(event, index)}
        onPaste={(text) => onPaste(text)}
        members={members}
      />
    )
  }

  function renderContent() {
    switch (block.type) {
      case "toggle":
      case "toggleHeading1":
      case "toggleHeading2":
      case "toggleHeading3": {
        const headingClass =
          block.type === "toggleHeading1"
            ? "text-[30px] font-semibold leading-[1.25] tracking-[-0.02em] py-1.5 mt-5"
            : block.type === "toggleHeading2"
              ? "text-[24px] font-semibold leading-[1.3] tracking-[-0.015em] py-1 mt-4"
              : block.type === "toggleHeading3"
                ? "text-[19px] font-semibold leading-[1.4] py-1 mt-3"
                : "text-[15px] leading-[1.7] py-[3px]"
        return (
          <div className={cn("flex items-start gap-1", block.type !== "toggle" && "mt-0.5")}>
            <button
              type="button"
              aria-label={block.collapsed ? tr("Expand") : tr("Collapse")}
              aria-expanded={!block.collapsed}
              onClick={onToggleCollapsed}
              className={cn(
                "mt-[7px] flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/70 transition hover:bg-accent hover:text-foreground",
                !hasChildren && "opacity-30",
              )}
            >
              <ChevronRight className={cn("size-3.5 transition-transform", !block.collapsed && "rotate-90")} />
            </button>
            {renderEditable(headingClass)}
          </div>
        )
      }
      case "heading1":
        return renderEditable("text-[30px] font-semibold leading-[1.25] tracking-[-0.02em] py-1.5 mt-5")
      case "heading2":
        return renderEditable("text-[24px] font-semibold leading-[1.3] tracking-[-0.015em] py-1 mt-4")
      case "heading3":
        return renderEditable("text-[19px] font-semibold leading-[1.4] py-1 mt-3")
      case "bulleted":
        return (
          <div className="flex items-start gap-2.5">
            <span className="mt-[9px] flex h-4 w-4 shrink-0 items-center justify-center">
              <span className="size-[5px] rounded-full bg-foreground/70" />
            </span>
            {renderEditable("text-[15px] leading-[1.7] py-[3px]")}
          </div>
        )
      case "numbered":
        return (
          <div className="flex items-start gap-2">
            <span className="mt-[3px] flex h-6 w-5 shrink-0 items-center justify-end text-[14px] tabular-nums text-muted-foreground">
              {number}.
            </span>
            {renderEditable("text-[15px] leading-[1.7] py-[3px]")}
          </div>
        )
      case "todo":
        return (
          <div className="flex items-start gap-2.5">
            <button
              type="button"
              role="checkbox"
              aria-checked={!!block.checked}
              onClick={onToggle}
              className={cn(
                "mt-[5px] flex size-[17px] shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                block.checked
                  ? "border-brand bg-brand text-white"
                  : "border-muted-foreground/40 bg-background hover:border-brand/60",
              )}
            >
              {block.checked && <Check className="size-3" strokeWidth={3.2} />}
            </button>
            {renderEditable(
              cn(
                "text-[15px] leading-[1.7] py-[3px] transition-colors",
                block.checked && "text-muted-foreground line-through decoration-muted-foreground/50",
              ),
            )}
          </div>
        )
      case "quote":
        return (
          <div className="border-l-[3px] border-foreground/60 py-0.5 pl-4">
            {renderEditable("text-[15px] leading-[1.7] py-[3px] text-foreground/90")}
            <div className="mt-1 flex items-center gap-1.5">
              <span className="text-[10px] text-muted-foreground">—</span>
              <input
                value={block.caption ?? ""}
                onChange={(e) => onUpdate({ caption: e.target.value })}
                readOnly={readOnly}
                placeholder={tr("Citation (optional)")}
                className="h-6 min-w-0 flex-1 bg-transparent text-[11px] italic text-muted-foreground outline-none placeholder:text-muted-foreground/40"
              />
            </div>
            {block.caption && <div className="mt-0.5 text-right text-[11px] italic text-muted-foreground">— {block.caption}</div>}
          </div>
        )
      case "callout": {
        const color = block.color || "amber"
        const icon = block.icon || CALLOUT_EMOJI[color] || "💡"
        return (
          <div
            className={cn(
              "flex items-start gap-3 rounded-lg px-3.5 py-3",
              CALLOUT_COLORS[color] ?? CALLOUT_COLORS.amber,
            )}
          >
            <button type="button" onClick={() => { if (readOnly) return; const next = prompt(tr("Callout icon"), icon) ?? icon; if (next) onUpdate({ icon: next }) }} className={cn("mt-[1px] shrink-0 select-none text-[17px] leading-6", !readOnly && "cursor-pointer hover:scale-110")} title={readOnly ? undefined : tr("Change icon")}>
              {icon}
            </button>
            {renderEditable("text-[15px] leading-[1.7] py-0")}
          </div>
        )
      }
      case "code":
        return (
          <CodeBlock
            block={block}
            index={index}
            readOnly={readOnly}
            placeholder={placeholder}
            autoFocus={autoFocus}
            onInput={(text, el) => onInput(text, el)}
            onKeyDown={(event, rowIndex) => onKeyDown(event, rowIndex)}
            onFocus={() => onFocusBlock?.(block.id)}
            onUpdate={onUpdate}
          />
        )
      case "table": {
        const { table, widths, aligns, updateTable, setCell, addRow, removeRow, addColumn, removeColumn, setColumn, setAlignment, resizeColumn, copyTable } = useTableBlock(block, onUpdate)
        const sortByColumn = (index: number) => {
          const sorted = [...table.rows].sort((a, b) => {
            const av = a[index] ?? ""
            const bv = b[index] ?? ""
            const an = Number(av), bn = Number(bv)
            if (!Number.isNaN(an) && !Number.isNaN(bn) && av !== "" && bv !== "") return av.localeCompare(bv)
            return av.localeCompare(bv)
          })
          updateTable({ ...table, rows: sorted })
        }
        const focusCell = (rowIndex: number, columnIndex: number) => {
          window.setTimeout(() => {
            document.getElementById(`table-cell-${block.id}-${rowIndex}-${columnIndex}`)?.focus()
          }, 20)
        }
        const handleCellKeyDown = (
          event: React.KeyboardEvent<HTMLInputElement>,
          rowIndex: number,
          columnIndex: number,
        ) => {
          if (readOnly || isImeKeyEvent(event)) return
          if (event.key !== "Tab" && event.key !== "Enter") return
          event.preventDefault()
          const direction = event.key === "Tab" && event.shiftKey ? -1 : 1
          if (event.key === "Tab") {
            const nextColumn = columnIndex + direction
            if (nextColumn >= 0 && nextColumn < table.columns.length) {
              focusCell(rowIndex, nextColumn)
              return
            }
            if (rowIndex === -1) {
              focusCell(direction > 0 ? 0 : table.rows.length - 1, direction > 0 ? 0 : table.columns.length - 1)
              return
            }
            const nextRow = rowIndex + direction
            if (nextRow >= 0 && nextRow < table.rows.length) {
              focusCell(nextRow, direction > 0 ? 0 : table.columns.length - 1)
              return
            }
            if (direction > 0) {
              addRow()
              focusCell(table.rows.length, 0)
            } else {
              focusCell(-1, table.columns.length - 1)
            }
            return
          }
          if (rowIndex === -1) {
            focusCell(0, columnIndex)
            return
          }
          if (rowIndex + 1 < table.rows.length) {
            focusCell(rowIndex + 1, columnIndex)
          } else {
            addRow()
            focusCell(table.rows.length, columnIndex)
          }
        }
        const pasteCells = (event: React.ClipboardEvent<HTMLInputElement>, rowIndex: number, columnIndex: number) => {
          if (rowIndex < 0) return
          const raw = event.clipboardData.getData("text/plain")
          if (!raw.includes("\t") && !raw.includes("\n")) return
          event.preventDefault()
          const matrix = raw.replace(/\r/g, "").split("\n").filter((line, index, lines) => line.length > 0 || index < lines.length - 1).map((line) => line.split("\t"))
          if (matrix.length === 0) return
          const width = Math.max(table.columns.length, columnIndex + Math.max(...matrix.map((row) => row.length)))
          const columns = Array.from({ length: width }, (_, index) => table.columns[index] ?? `Column ${index + 1}`)
          const rows = table.rows.map((row) => Array.from({ length: width }, (_, index) => row[index] ?? ""))
          while (rows.length < rowIndex + matrix.length) rows.push(Array.from({ length: width }, () => ""))
          matrix.forEach((cells, rowOffset) => {
            cells.forEach((value, columnOffset) => {
              rows[rowIndex + rowOffset][columnIndex + columnOffset] = value
            })
          })
          updateTable({ ...table, columns, rows })
          const lastRow = rowIndex + matrix.length - 1
          const lastColumn = columnIndex + Math.max(...matrix.map((row) => row.length)) - 1
          focusCell(lastRow, lastColumn)
        }
        return (
          <div className="my-2 overflow-hidden rounded-lg border border-border/80 bg-card" onFocus={() => onFocusBlock?.(block.id)}>
            <div className="flex items-center gap-1.5 border-b border-border/60 px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <Table2 className="size-3" /> Table
              <span className="normal-case tracking-normal text-muted-foreground/60">
                {table.columns.length} × {table.rows.length + (table.header === false ? 0 : 1)}
              </span>
              <div className="ml-auto flex items-center gap-0.5 normal-case tracking-normal">
                {!readOnly && <button
                  type="button"
                  onClick={() => updateTable({ ...table, header: table.header === false })}
                  aria-pressed={table.header !== false}
                  className="rounded px-1.5 py-0.5 text-[10px] font-normal transition hover:bg-accent hover:text-foreground"
                >
                  {tr("Header row")}
                </button>}
                <button
                  type="button"
                  onClick={copyTable}
                  className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-normal transition hover:bg-accent hover:text-foreground"
                >
                  <Copy className="size-3" /> {tr("Copy")}
                </button>
              </div>
            </div>
            <div className="max-h-[65vh] overflow-auto">
              <table className="w-full border-collapse text-sm" style={{ tableLayout: "fixed", minWidth: widths.reduce((sum, width) => sum + width, 0) }}>
                <colgroup>{widths.map((width, index) => <col key={index} style={{ width }} />)}</colgroup>
                {table.header !== false && <thead className="sticky top-0 z-10">
                  <tr>
                    {table.columns.map((column, columnIndex) => (
                      <th key={columnIndex} className="group/head relative border-b border-r border-border/60 bg-muted/35 p-0 text-left last:border-r-0">
                        <div className="flex items-center gap-0.5 px-1">
                          <input
                            id={`table-cell-${block.id}-${-1}-${columnIndex}`}
                            data-table-cell
                            value={column}
                            readOnly={readOnly}
                            onChange={(event) => setColumn(columnIndex, event.target.value)}
                            onKeyDown={(event) => handleCellKeyDown(event, -1, columnIndex)}
                            onFocus={() => onFocusBlock?.(block.id)}
                            className="h-8 min-w-0 flex-1 bg-transparent px-1.5 text-xs font-semibold outline-none"
                            style={{ textAlign: aligns[columnIndex] }}
                            placeholder={`Column ${columnIndex + 1}`}
                          />
                          {!readOnly && (
                            <button
                              type="button"
                              onClick={() => sortByColumn(columnIndex)}
                              aria-label="Sort column"
                              title="Sort column"
                              className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/0 transition group-hover/head:text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                              <ArrowUp className="size-3" />
                            </button>
                          )}
                          {!readOnly && (
                            <button
                              type="button"
                              onClick={() => setAlignment(columnIndex, aligns[columnIndex] === "left" ? "center" : aligns[columnIndex] === "center" ? "right" : "left")}
                              aria-label={tr("Align column")}
                              className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/0 transition group-hover/head:text-muted-foreground hover:bg-accent hover:text-foreground"
                            >
                              {aligns[columnIndex] === "center" ? <AlignCenter className="size-3" /> : aligns[columnIndex] === "right" ? <AlignRight className="size-3" /> : <AlignLeft className="size-3" />}
                            </button>
                          )}
                          {!readOnly && table.columns.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeColumn(columnIndex)}
                              className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/0 transition group-hover/head:text-muted-foreground hover:bg-destructive/10 hover:!text-destructive"
                              aria-label={tr("Delete column")}
                            >
                              <X className="size-3" />
                            </button>
                          )}
                          <span
                            role="separator"
                            aria-label={tr("Resize column")}
                            onMouseDown={(event) => resizeColumn(event, columnIndex)}
                            className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-brand/40"
                          />
                        </div>
                      </th>
                    ))}
                    <th className="w-6 border-b border-border/60 bg-muted/35" />
                  </tr>
                </thead>}
                <tbody>
                  {table.rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="group/row transition-colors hover:bg-brand-soft/15">
                      {table.columns.map((_, columnIndex) => (
                        <td key={columnIndex} className="border-b border-r border-border/60 p-0 last:border-r-0">
                          <input
                            id={`table-cell-${block.id}-${rowIndex}-${columnIndex}`}
                            data-table-cell
                            value={row[columnIndex] ?? ""}
                            readOnly={readOnly}
                            onChange={(event) => setCell(rowIndex, columnIndex, event.target.value)}
                            onKeyDown={(event) => handleCellKeyDown(event, rowIndex, columnIndex)}
                            onPaste={(event) => pasteCells(event, rowIndex, columnIndex)}
                            onFocus={() => onFocusBlock?.(block.id)}
                            className="h-9 w-full bg-transparent px-2 text-[13px] outline-none transition focus:bg-brand-soft/20"
                            style={{ textAlign: aligns[columnIndex] }}
                            placeholder=" "
                          />
                        </td>
                      ))}
                      <td className="border-b border-border/60 p-0 text-center">
                        {!readOnly && table.rows.length > 1 && <button
                          type="button"
                          onClick={() => removeRow(rowIndex)}
                          className="flex size-6 items-center justify-center rounded text-muted-foreground/0 transition group-hover/row:text-muted-foreground hover:bg-destructive/10 hover:!text-destructive"
                          aria-label={tr("Delete row")}
                        >
                          <X className="size-3" />
                        </button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!readOnly && <div className="flex items-center gap-1 border-t border-border/60 p-1.5">
              <button
                type="button"
                onClick={addRow}
                className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <Plus className="size-3" /> Row
              </button>
              <button
                type="button"
                onClick={addColumn}
                className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <Plus className="size-3" /> Column
              </button>
            </div>}
          </div>
        )
      }
      case "diagram": {
        const zoom = Number(block.align ?? "100") || 100
        return (
          <div className="my-2 overflow-hidden rounded-lg border border-border/80 bg-card">
            <div className="flex items-center gap-1.5 border-b border-border/60 px-2.5 py-1.5">
              <Network className="size-3 text-muted-foreground" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Mermaid diagram
              </span>
              {!diagramEditing && (
                <div className="ml-auto flex items-center gap-1">
                  <button type="button" onClick={() => onUpdate({ align: String(Math.max(50, zoom - 10)) })} className="rounded px-1.5 py-0.5 text-[10px] hover:bg-accent">−</button>
                  <span className="text-[10px] text-muted-foreground">{zoom}%</span>
                  <button type="button" onClick={() => onUpdate({ align: String(Math.min(200, zoom + 10)) })} className="rounded px-1.5 py-0.5 text-[10px] hover:bg-accent">+</button>
                </div>
              )}
              <button
                type="button"
                onClick={() => setDiagramEditing((value) => !value)}
                className="ml-auto rounded px-2 py-0.5 text-[10px] text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                {diagramEditing ? tr("Preview") : tr("Edit source")}
              </button>
            </div>
            {diagramEditing ? (
              <textarea
                value={block.text}
                readOnly={readOnly}
                onChange={(event) => onUpdate({ text: event.target.value })}
                onFocus={() => onFocusBlock?.(block.id)}
                spellCheck={false}
                rows={Math.min(16, Math.max(5, block.text.split("\n").length + 1))}
                placeholder={"flowchart LR\n  A[Start] --> B[Finish]"}
                className="block w-full resize-y bg-transparent p-3 font-mono text-[12px] leading-5 outline-none placeholder:text-muted-foreground/50"
              />
            ) : (
              <div className="cursor-pointer" onClick={() => setDiagramEditing(true)}>
                <MermaidDiagram source={block.text} />
              </div>
            )}
          </div>
        )
      }
      case "divider": {
        const style = (block.color as string) || "solid"
        return (
          <div className="py-3">
            <div
              id={`block-input-${block.id}`}
              data-block-input
              tabIndex={0}
              onKeyDown={deleteDividerFocused}
              onFocus={() => onFocusBlock?.(block.id)}
              className="group/divider rounded-sm py-1 outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
            >
              <hr className={style === "dashed" ? "border-dashed" : style === "dotted" ? "border-dotted" : "border-solid"} style={{ borderColor: "var(--border)" }} />
              {!readOnly && (
                <div className="mt-1 hidden justify-center gap-1 opacity-0 transition-opacity group-hover/divider:opacity-100 group-focus-within/divider:opacity-100 sm:flex">
                  {["solid","dashed","dotted"].map((s) => (
                    <button key={s} type="button" onClick={() => onUpdate({ color: s })} className={cn("rounded px-2 py-0.5 text-[10px] capitalize", style===s ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent")}>{s}</button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      }
      case "password":
        return (
          <PasswordBlock
            block={block}
            readOnly={readOnly}
            autoFocus={autoFocus}
            onUpdate={onUpdate}
            onFocus={() => onFocusBlock?.(block.id)}
          />
        )
      case "bookmark":
        return <BookmarkBlock block={block} readOnly={readOnly} autoFocus={autoFocus} onUpdate={onUpdate} />
      case "video":
        return <VideoBlock block={block} readOnly={readOnly} autoFocus={autoFocus} onUpdate={onUpdate} />
      case "embed":
        return <EmbedBlock block={block} readOnly={readOnly} autoFocus={autoFocus} onUpdate={onUpdate} />
      case "file":
        return <FileBlock block={block} readOnly={readOnly} autoFocus={autoFocus} workspaceId={workspaceId} onUpdate={onUpdate} />
      case "equation":
        return <EquationBlock block={block} readOnly={readOnly} autoFocus={autoFocus} onUpdate={onUpdate} />
      case "toc":
        return <TocBlock block={block} headings={headings} readOnly={readOnly} />
      case "database":
        return <DatabaseBlock block={block} readOnly={readOnly} onUpdate={onUpdate} />
      case "gantt":
        return <GanttBlock block={block} readOnly={readOnly} autoFocus={autoFocus} onUpdate={onUpdate} />
      case "chart":
        return <ChartBlock block={block} readOnly={readOnly} autoFocus={autoFocus} onUpdate={onUpdate} />
      case "pageLink":
        return <PageLinkBlock block={block} readOnly={readOnly} onUpdate={onUpdate} />
      case "breadcrumb":
        return <BreadcrumbBlock block={block} breadcrumb={breadcrumb} />
      case "columns":
        return <ColumnsBlock block={block} readOnly={readOnly} onUpdate={onUpdate} />
      case "qrcode":
        return <QRCodeBlock block={block} readOnly={readOnly} autoFocus={autoFocus} onUpdate={onUpdate} />
      case "barcode":
        return <BarcodeBlock block={block} readOnly={readOnly} autoFocus={autoFocus} onUpdate={onUpdate} />
      case "form":
        return <FormBlock block={block} pageId={pageId} readOnly={readOnly} autoFocus={autoFocus} onUpdate={onUpdate} />
      case "content":
        return (
          <div className="my-3 rounded-xl border-2 border-dashed border-brand/35 bg-gradient-to-br from-brand-soft/30 to-brand-two/10 px-4 py-6 text-center">
            <div className="mx-auto flex size-8 items-center justify-center rounded-lg bg-brand text-white">
              <Columns2 className="size-4" />
            </div>
            <div className="mt-2 text-xs font-semibold text-brand">{tr("Page content appears here")}</div>
            <div className="mt-1 text-[11px] leading-5 text-muted-foreground">
              {tr("Everything before this block is the shared header; everything after it is the footer.")}
            </div>
            <div className="mt-3 flex justify-center gap-1.5 text-[10px] text-muted-foreground">
              <span className="rounded bg-background px-1.5 py-0.5">{tr("Header")}</span>
              <span>→</span>
              <span className="rounded bg-brand px-1.5 py-0.5 font-medium text-white">{tr("Content")}</span>
              <span>→</span>
              <span className="rounded bg-background px-1.5 py-0.5">{tr("Footer")}</span>
            </div>
          </div>
        )
      case "map":
        return <MapBlock block={block} readOnly={readOnly} onUpdate={onUpdate} onKeyDown={(event) => onKeyDown(event, index)} onFocus={() => onFocusBlock?.(block.id)} />
      case "image":
        return (
          <ImageBlock
            block={block}
            pageId={pageId}
            readOnly={readOnly}
            workspaceId={workspaceId}
            autoFocus={autoFocus}
            comments={comments}
            onUpdate={onUpdate}
            onKeyDown={(event) => onKeyDown(event, index)}
            onFocus={() => onFocusBlock?.(block.id)}
            onOpenComments={onOpenComments}
            onCommentsChanged={onCommentsChanged}
          />
        )
      case "paragraph":
      default:
        return renderEditable("text-[15px] leading-[1.7] py-[3px]")
    }
  }

  return (
    <div
      ref={rowRef}
      data-block-row
      data-block-id={block.id}
      data-block-index={index}
      data-selected={selected || undefined}
      className={cn(
        "group/block relative flex items-start gap-0.5 rounded-md transition-colors",
        selected && "bg-brand-soft/25 ring-1 ring-inset ring-brand/20",
        isDragging && "block-dragging",
        dropPosition === "before" && "block-drop-before",
        dropPosition === "after" && "block-drop-after",
        slashActive && "z-10",
      )}
      style={{ marginLeft: (block.indent ?? 0) * 18 }}
      onDragOver={handleOver}
      onDrop={handleDrop}
    >
      {!readOnly && <div className="absolute -left-[90px] top-0 hidden h-7 items-center gap-0.5 opacity-0 transition-opacity group-hover/block:opacity-100 has-[[data-state=open]]:opacity-100 md:flex">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-label={tr("Select block")}
              aria-pressed={selected}
              onMouseDown={(event) => onSelectionStart?.(event, index)}
              className="flex size-5 cursor-cell items-center justify-center rounded text-muted-foreground/70 transition hover:bg-accent hover:text-foreground"
            >
              <span className={cn(
                "flex size-3.5 items-center justify-center rounded-[3px] border transition-colors",
                selected ? "border-brand bg-brand text-white" : "border-muted-foreground/45 bg-background",
              )}>
                {selected && <Check className="size-2.5" strokeWidth={3.4} />}
              </span>
            </button>
          </TooltipTrigger>
          <TooltipContent>{tr("Drag to select blocks")}</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={(event) => onInsertAfter(event.currentTarget.getBoundingClientRect())}
              className="flex size-5 items-center justify-center rounded text-muted-foreground/70 transition hover:bg-accent hover:text-foreground"
              aria-label="Add block below"
            >
              <Plus className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Add block below</TooltipContent>
        </Tooltip>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move"
                event.dataTransfer.setData("text/plain", block.id)
                onDragStart()
              }}
              onDragEnd={onDragEnd}
              className="flex size-5 cursor-grab items-center justify-center rounded text-muted-foreground opacity-[0.12] transition hover:bg-accent hover:text-foreground hover:opacity-100 group-hover/block:opacity-100 active:cursor-grabbing"
              aria-label="Drag block"
            >
              <GripVertical className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Drag to move</TooltipContent>
        </Tooltip>
        <BlockMenu
          block={block}
          locked={locked}
          selected={selected}
          isLayout={isLayout}
          hasContentPlaceholder={hasContentPlaceholder}
          onToggleLock={onToggleLock}
          onConvert={onConvert}
          onUpdate={onUpdate}
          onSelectBlock={onSelectBlock}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onInsertAbove={onInsertAbove}
          onInsertBelow={onInsertBelow}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          onComment={onCommentBlock ? () => onCommentBlock(block.id) : undefined}
          trigger={
            <button
              type="button"
              className="flex size-5 items-center justify-center rounded text-muted-foreground/70 transition hover:bg-accent hover:text-foreground data-[state=open]:bg-accent"
              aria-label="Block options"
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          }
        />
      </div>}

      {focusUsers && focusUsers.length > 0 && (
        <span
          className="absolute -left-1.5 bottom-0.5 top-0.5 w-[3px] rounded-full"
          style={{ backgroundColor: focusUsers[0].color }}
          title={`${focusUsers.map((person) => person.name).join(", ")} editing`}
        />
      )}

      <div key={block.type} className={contentClassName}>
        {renderContent()}
      </div>

      {locked && !pageReadOnly && (
        <button
          type="button"
          onClick={onToggleLock}
          aria-label={tr("Unlock block")}
          className="ml-1 mt-1 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/70 transition hover:bg-accent hover:text-foreground"
        >
          <LockOpen className="size-3" />
        </button>
      )}

      {commentCount > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`View ${commentCount} comment${commentCount === 1 ? "" : "s"}`}
              className="ml-1 mt-1 flex h-5 shrink-0 items-center gap-1 rounded-full bg-brand-soft px-1.5 text-[10px] font-medium text-brand transition hover:bg-brand/15"
            >
              <MessageSquare className="size-3" />
              {commentCount}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-2">
            <div className="flex items-center justify-between px-1.5 pb-1.5">
              <span className="text-xs font-medium">{tr("Comments")}</span>
              <span className="text-[10px] text-muted-foreground">
                {commentCount} {tr("open")}
              </span>
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto thin-scrollbar">
              {comments.slice(0, 3).map((comment) => (
                <button
                  key={comment.id}
                  type="button"
                  onClick={onOpenComments}
                  className="block w-full rounded-lg px-2 py-1.5 text-left transition hover:bg-accent/60"
                >
                  {comment.quote && (
                    <div className="truncate border-l-2 border-brand/50 pl-1.5 text-[10px] italic text-muted-foreground">
                      “{comment.quote}”
                    </div>
                  )}
                  <div className="mt-0.5 flex items-baseline gap-1.5">
                    <span className="truncate text-[10px] font-medium">{comment.authorName}</span>
                    <span className="shrink-0 text-[9px] text-muted-foreground">
                      {formatRelative(comment.createdAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[11px] leading-4">{comment.body}</div>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onOpenComments}
              className="mt-1 w-full rounded-md border border-border/70 px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              {tr("Open all comments")}
            </button>
          </PopoverContent>
        </Popover>
      )}

      {!readOnly && <div className="flex size-6 shrink-0 items-center justify-center md:hidden">
        <BlockMenu
          block={block}
          locked={locked}
          selected={selected}
          isLayout={isLayout}
          hasContentPlaceholder={hasContentPlaceholder}
          onToggleLock={onToggleLock}
          onConvert={onConvert}
          onUpdate={onUpdate}
          onSelectBlock={onSelectBlock}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onInsertAbove={onInsertAbove}
          onInsertBelow={onInsertBelow}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          onComment={onCommentBlock ? () => onCommentBlock(block.id) : undefined}
          align="end"
          trigger={
            <button
              type="button"
              aria-label="Block options"
              className="flex size-6 items-center justify-center rounded text-muted-foreground/40 hover:bg-accent hover:text-foreground data-[state=open]:bg-accent"
            >
              <MoreVertical className="size-3.5" />
            </button>
          }
        />
      </div>}
    </div>
  )
}

function BlockMenu({
  block,
  locked = false,
  selected = false,
  isLayout = false,
  hasContentPlaceholder = false,
  onToggleLock,
  trigger,
  onConvert,
  onUpdate,
  onSelectBlock,
  onDuplicate,
  onDelete,
  onInsertAbove,
  onInsertBelow,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
  onComment,
  align = "start",
}: {
  block: Block
  locked?: boolean
  selected?: boolean
  isLayout?: boolean
  hasContentPlaceholder?: boolean
  onToggleLock?: () => void
  trigger: React.ReactNode
  onConvert: (type: BlockType) => void
  onUpdate: (patch: Partial<Block>) => void
  onSelectBlock?: () => void
  onDuplicate: () => void
  onDelete: () => void
  onInsertAbove?: () => void
  onInsertBelow?: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  canMoveUp?: boolean
  canMoveDown?: boolean
  onComment?: () => void
  align?: "start" | "end"
}) {
  const canColor = TEXT_STYLE_TYPES.has(block.type)
  const canAlign = ALIGN_STYLE_TYPES.has(block.type) || block.type === "image"
  const alignValue = block.align || (block.type === "image" ? "center" : "left")
  const copyText = () => {
    void navigator.clipboard.writeText(block.text).then(
      () => toast.success(tr("Copied to clipboard")),
      () => toast.error(tr("Could not copy text")),
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        sideOffset={6}
        className="max-h-[70vh] w-52 overflow-y-auto thin-scrollbar"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <RefreshCw /> Turn into
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-[280px] w-48 overflow-y-auto thin-scrollbar">
            {SLASH_COMMANDS.filter((command) =>
              command.type !== "content" || (isLayout && (!hasContentPlaceholder || block.type === "content")),
            ).map((command) => (
              <DropdownMenuItem key={command.type} onSelect={() => onConvert(command.type)}>
                <command.icon />
                {BLOCK_LABELS[command.type]}
                {block.type === command.type && (
                  <Check className="ml-auto size-3.5 text-brand" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {onSelectBlock && (
          <DropdownMenuItem onSelect={onSelectBlock}>
            <span className={cn(
              "flex size-3.5 items-center justify-center rounded-[3px] border",
              selected ? "border-brand bg-brand text-white" : "border-muted-foreground/45",
            )}>
              {selected && <Check className="size-2.5" strokeWidth={3.4} />}
            </span>
            {tr("Select block")}
          </DropdownMenuItem>
        )}
        {block.type === "callout" && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette /> {tr("Callout color")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48 p-1.5">
              {Object.keys(CALLOUT_COLORS).map((value) => (
                <DropdownMenuItem key={value} onSelect={() => onUpdate({ color: value })}>
                  <span className={cn("flex size-5 items-center justify-center rounded-md border text-[11px]", CALLOUT_COLORS[value])}>
                    {CALLOUT_EMOJI[value]}
                  </span>
                  {tr(value === "neutral" ? "Gray" : value[0].toUpperCase() + value.slice(1))}
                  {(block.color || "amber") === value && <Check className="ml-auto size-3.5 text-brand" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {canColor && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette /> {tr("Color")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-[min(92vw,22rem)] p-2.5">
              <ColorGrid
                label={tr("Text color")}
                options={TEXT_COLORS}
                value={block.textColor}
                onChange={(value) => onUpdate({ textColor: value === "default" ? "" : value })}
              />
              {block.type !== "callout" && (
                <div className="mt-3 border-t pt-2.5">
                  <ColorGrid
                    label={tr("Background")}
                    options={BACKGROUND_COLORS}
                    value={block.bgColor}
                    onChange={(value) => onUpdate({ bgColor: value === "default" ? "" : value })}
                  />
                </div>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {canAlign && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              {alignValue === "center" ? <AlignCenter /> : alignValue === "right" ? <AlignRight /> : <AlignLeft />}
              {tr("Align")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-40">
              <DropdownMenuItem onSelect={() => onUpdate({ align: "left" })}>
                <AlignLeft /> {tr("Left")}
                {alignValue === "left" && <Check className="ml-auto size-3.5" />}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onUpdate({ align: "center" })}>
                <AlignCenter /> {tr("Center")}
                {alignValue === "center" && <Check className="ml-auto size-3.5" />}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onUpdate({ align: "right" })}>
                <AlignRight /> {tr("Right")}
                {alignValue === "right" && <Check className="ml-auto size-3.5" />}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {block.type === "image" && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ImageIcon /> {tr("Image size")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-40">
              {[
                ["small", "Small"],
                ["medium", "Medium"],
                ["full", "Full width"],
              ].map(([value, label]) => (
                <DropdownMenuItem key={value} onSelect={() => onUpdate({ width: value })}>
                  {tr(label)}
                  {(block.width || "full") === value && <Check className="ml-auto size-3.5" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {(onInsertAbove || onInsertBelow) && <DropdownMenuSeparator />}
        {onInsertAbove && (
          <DropdownMenuItem onSelect={onInsertAbove}>
            <Plus /> {tr("Insert above")}
          </DropdownMenuItem>
        )}
        {onInsertBelow && (
          <DropdownMenuItem onSelect={onInsertBelow}>
            <Plus /> {tr("Insert below")}
          </DropdownMenuItem>
        )}
        {(onMoveUp || onMoveDown) && <DropdownMenuSeparator />}
        {onMoveUp && (
          <DropdownMenuItem disabled={!canMoveUp} onSelect={onMoveUp}>
            <ArrowUp /> {tr("Move up")}
          </DropdownMenuItem>
        )}
        {onMoveDown && (
          <DropdownMenuItem disabled={!canMoveDown} onSelect={onMoveDown}>
            <ArrowDown /> {tr("Move down")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={onDuplicate}>
          <Copy /> {tr("Duplicate")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={copyText}>
          <ClipboardCopy /> {tr("Copy text")}
        </DropdownMenuItem>
        {onToggleLock && (
          <DropdownMenuItem onSelect={onToggleLock}>
            {locked ? <LockOpen /> : <LockKeyhole />}
            {locked ? tr("Unlock block") : tr("Lock block")}
          </DropdownMenuItem>
        )}
        {onComment && (
          <DropdownMenuItem onSelect={onComment}>
            <MessageSquare /> {tr("Comment")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 /> {tr("Delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
