import { lazy, Suspense, useEffect, useRef, useState } from "react"
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Bold,
  BookOpen,
  Check,
  ClipboardCopy,
  Columns2,
  Copy,
  Download,
  EyeOff,
  Globe,
  GripVertical,
  Filter,
  Flag,
  Languages,
  Link2,
  List,
  ListFilter,
  ListOrdered,
  Maximize2,
  Minus,
  LockKeyhole,
  LockOpen,
  ImageIcon,
  Italic,
  MessageSquare,
  MoreHorizontal,
  MoreVertical,
  Network,
  Palette,
  Plus,
  RefreshCw,
  Rows3,
  Sigma,
  Snowflake,
  SquareCheckBig,
  ChevronRight,
  Table2,
  TextCursorInput,
  ToggleRight,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { toast } from "sonner"
import type { Block, BlockType, Comment, Member, TableCellStyle, TableQuery } from "@/lib/types"
import { BLOCK_LABELS, SLASH_COMMANDS } from "@/components/editor/commands"
import { CALLOUT_COLORS, CALLOUT_EMOJI } from "@/lib/covers"
import { EmojiPicker } from "@/components/editor/emoji-picker"
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
import { Switch } from "@/components/ui/switch"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import type { RealtimePresence } from "@/lib/realtime"
import { DiagramLightbox, MermaidDiagram } from "@/components/editor/mermaid-diagram"
import { LexicalBlock } from "@/components/editor/lexical-block"
import { PasswordBlock } from "@/components/editor/password-block"
import { CurlBlock } from "@/components/editor/curl-block"
import { TableCell } from "@/components/editor/table-cell"
import { TableInputCell } from "@/components/editor/table-input-cell"
import { parseTableImport } from "@/lib/table-import"
import { columnLabel, formulaCellKey, isFormulaInput } from "@/lib/table-formula"
import { TABLE_COLUMN_TYPES, normalizeTableCell, tableColumnOptions, tableColumnType } from "@/lib/table-input"
import { tableColumnOrder, tableFrozenColumnIndexes, tableFrozenOffsets, tableVisibleColumnIndexes } from "@/lib/table-layout"
import { DatabaseBlock } from "@/components/editor/database-block"
import { JsonVisualBlock } from "@/components/editor/json-visual-block"
import { ChartBlock, GanttBlock } from "@/components/editor/data-blocks"
import { CalendarBlock } from "@/components/editor/calendar-block"
import { FormBlock } from "@/components/editor/form-block"
import { RadioGroupBlock } from "@/components/editor/input-blocks"
import { PollBlock } from "@/components/editor/poll-block"
import { ImageBlock } from "@/components/editor/image-block"
import { MapBlock } from "@/components/editor/map-block"
import { BreadcrumbBlock, ColumnsBlock, PageLinkBlock } from "@/components/editor/link-blocks"
import {
  BookmarkBlock,
  EmbedBlock,
  FileBlock,
  TocBlock,
  VideoBlock,
  type HeadingItem,
} from "@/components/editor/rich-blocks"
import { tr } from "@/lib/i18n"
import { TRANSLATE_LANGS, translateText } from "@/lib/translate"
import { ColorGrid } from "@/components/ui/color-grid"
import { FormulaHelpDialog } from "@/components/editor/formula-help-dialog"

const CodeBlock = lazy(() => import("@/components/editor/code-block").then((module) => ({ default: module.CodeBlock })))
const EquationBlock = lazy(() => import("@/components/editor/equation-block").then((module) => ({ default: module.EquationBlock })))
const QRCodeBlock = lazy(() => import("@/components/editor/code-image-blocks").then((module) => ({ default: module.QRCodeBlock })))
const BarcodeBlock = lazy(() => import("@/components/editor/code-image-blocks").then((module) => ({ default: module.BarcodeBlock })))
const LayoutBlock = lazy(() => import("@/components/editor/layout-block").then((module) => ({ default: module.LayoutBlock })))

export interface BlockRowProps {
  block: Block
  index: number
  number: number
  placeholder: string
  slashActive: boolean
  isDragging: boolean
  dropPosition: "before" | "after" | null
  readOnly?: boolean
  allowVote?: boolean
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

function tableCellStyleClasses(style?: TableCellStyle | null) {
  if (!style) return ""
  return cn(
    style.bg && backgroundColorClass(style.bg),
    style.color && textColorClass(style.color),
    style.bold && "font-semibold",
    style.italic && "italic",
  )
}

function LazyBlockFallback() {
  return <div className="my-2 h-20 animate-pulse rounded-lg border border-border/60 bg-muted/20" />
}

function TableStylePopover({ label, style, onChange, className }: {
  label: string
  style?: TableCellStyle | null
  onChange: (style: TableCellStyle) => void
  className?: string
}) {
  const current = style ?? {}
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label={label} title={label} className={cn("flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/0 transition hover:bg-accent hover:text-foreground max-md:text-muted-foreground", className)}>
          <Palette className="size-3" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-2.5">
        <div className="mb-2 text-xs font-medium">{label}</div>
        <ColorGrid label={tr("Background")} options={BACKGROUND_COLORS} value={current.bg} onChange={(value) => onChange({ ...current, bg: value === "default" ? "" : value })} />
        <div className="mt-2">
          <ColorGrid label={tr("Text color")} options={TEXT_COLORS} value={current.color} onChange={(value) => onChange({ ...current, color: value === "default" ? "" : value })} />
        </div>
        <div className="mt-2 flex items-center gap-1">
          <button type="button" aria-pressed={!!current.bold} onClick={() => onChange({ ...current, bold: !current.bold })} className={cn("flex h-7 items-center gap-1 rounded px-2 text-[11px] transition hover:bg-accent", current.bold && "bg-accent text-foreground")}><Bold className="size-3" /> {tr("Bold")}</button>
          <button type="button" aria-pressed={!!current.italic} onClick={() => onChange({ ...current, italic: !current.italic })} className={cn("flex h-7 items-center gap-1 rounded px-2 text-[11px] transition hover:bg-accent", current.italic && "bg-accent text-foreground")}><Italic className="size-3" /> {tr("Italic")}</button>
          <button type="button" onClick={() => onChange({})} className="ml-auto rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground">{tr("Clear style")}</button>
        </div>
      </PopoverContent>
    </Popover>
  )
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
    allowVote = false,
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
  const tableImportRef = useRef<HTMLInputElement>(null)
  const [dragColumn, setDragColumn] = useState<number | null>(null)
  const [formulaHelpOpen, setFormulaHelpOpen] = useState(false)
  const [statusColumn, setStatusColumn] = useState<number | null>(null)
  const [statusDraft, setStatusDraft] = useState("")
  const readOnly = pageReadOnly || locked
  const textStyled = TEXT_STYLE_TYPES.has(block.type)
  const aligned = ALIGN_STYLE_TYPES.has(block.type)
  const blockBackground = textStyled ? backgroundColorClass(block.bgColor) : ""
  const contentClassName = cn(
    "min-w-0 flex-1",
    textStyled && textColorClass(block.textColor),
    aligned && alignClass(block.align),
    (block.type === "code" || block.type === "curl") && "py-2",
    blockBackground && cn("-mx-2 rounded-md px-2", blockBackground),
  )

  const editableRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const [diagramMode, setDiagramMode] = useState<"preview" | "split" | "source">(block.text ? "split" : "source")
  const [diagramZoom, setDiagramZoom] = useState(false)
  const [longFolded, setLongFolded] = useState(true)
  const [calloutFolded, setCalloutFolded] = useState(false)
  // Call the table hook unconditionally: block types can change in place
  // (e.g. "Turn into table"), and hooks must run in the same order every render.
  const { table, widths, aligns, updateTable, setCell, addRow, removeRow, addColumn, removeColumn, setColumn, setColumnType, setColumnOptions, setAlignment, resizeColumn, reorderColumn, toggleColumnHidden, toggleFreezeFirst, toggleColumnFrozen, toggleHeaderSticky, sortRows, copyTable, downloadCSV, downloadJSONL, downloadExcel } = useTableBlock(block, onUpdate)
  const [tableSort, setTableSort] = useState<{ column: number; dir: "asc" | "desc" } | null>(null)
  const [activeTableCell, setActiveTableCell] = useState<{ row: number; column: number } | null>(null)

  useEffect(() => {
    const el = editableRef.current
    if (!el) return
    if (el.innerText !== block.text) el.innerText = block.text
  }, [block.text, block.type])

  useEffect(() => {
    setTableSort(null)
  }, [block.id])

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

  function copyBlockLink() {
    const path = pageId ? `/page/${pageId}` : window.location.pathname
    const url = `${window.location.origin}${path}#block-${encodeURIComponent(block.id)}`
    void navigator.clipboard.writeText(url).then(
      () => toast.success(tr("Block link copied")),
      () => toast.error(tr("Could not copy block link")),
    )
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

  function toRoman(n: number): string {
    const table: [number, string][] = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]]
    let out = ""
    let rest = Math.max(1, Math.min(3999, n))
    for (const [v, s] of table) {
      while (rest >= v) {
        out += s
        rest -= v
      }
    }
    return out
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
      case "heading2":
      case "heading3": {
        const headingClass =
          block.type === "heading1"
            ? "text-[30px] font-semibold leading-[1.25] tracking-[-0.02em] py-1.5 mt-5"
            : block.type === "heading2"
              ? "text-[24px] font-semibold leading-[1.3] tracking-[-0.015em] py-1 mt-4"
              : "text-[19px] font-semibold leading-[1.4] py-1 mt-3"
        return block.collapsed ? (
          <div className="flex items-start gap-1">
            <button
              type="button"
              aria-label={tr("Expand section")}
              aria-expanded={false}
              title={tr("Expand section")}
              onClick={onToggleCollapsed}
              className="mt-[9px] flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <ChevronRight className="size-3.5" />
            </button>
            <div className="min-w-0 flex-1">{renderEditable(headingClass)}</div>
          </div>
        ) : renderEditable(headingClass)
      }
      case "bulleted":
        return (
          <div className="flex items-start gap-2.5">
            <span className="mt-[9px] flex h-4 w-4 shrink-0 items-center justify-center">
              <span className={cn("size-[5px] bg-foreground/70", block.language === "square" ? "rounded-[1px]" : "rounded-full")} />
            </span>
            {renderEditable("text-[15px] leading-[1.7] py-[3px]")}
          </div>
        )
      case "numbered":
        return (
          <div className="flex items-start gap-2">
            <span className="mt-[3px] flex h-6 w-7 shrink-0 items-center justify-end text-[14px] tabular-nums text-muted-foreground">
              {block.language === "alpha" ? `${String.fromCharCode(96 + ((number - 1) % 26) + 1)}.` : block.language === "roman" ? `${toRoman(number)}.` : `${number}.`}
            </span>
            {renderEditable("text-[15px] leading-[1.7] py-[3px]")}
          </div>
        )
      case "todo":
        return (
          <div className="flex items-start gap-2.5">
            {Boolean(block.language) && (
              <span title={tr("Priority: {p}", { p: block.language === "high" ? tr("High") : block.language === "med" ? tr("Medium") : tr("Low") })} className={cn("mt-[5px] h-[17px] w-1 shrink-0 rounded-full", block.language === "high" ? "bg-red-500" : block.language === "med" ? "bg-amber-500" : "bg-sky-500")} />
            )}
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
          <div className={cn("border-l-[3px] py-0.5 pl-4", block.color === "brand" ? "border-brand/70" : block.color === "green" ? "border-emerald-500/70" : block.color === "red" ? "border-red-500/70" : block.color === "sky" ? "border-sky-500/70" : "border-foreground/60")}>
            {renderEditable("text-[15px] leading-[1.7] py-[3px] text-foreground/90")}
            {readOnly ? (
              block.caption ? <div className="mt-1 text-right text-[11px] italic text-muted-foreground">— {block.caption}</div> : null
            ) : (
              <div className="mt-1 flex items-center gap-1.5">
                <span className="text-[10px] text-muted-foreground">—</span>
                <input
                  value={block.caption ?? ""}
                  onChange={(e) => onUpdate({ caption: e.target.value })}
                  placeholder={tr("Citation (optional)")}
                  className="h-6 min-w-0 flex-1 bg-transparent text-[11px] italic text-muted-foreground outline-none placeholder:text-muted-foreground/40"
                />
              </div>
            )}
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
            {readOnly ? (
              <span className="mt-[1px] shrink-0 select-none text-[17px] leading-6">{icon}</span>
            ) : (
              <EmojiPicker value={icon} onSelect={(next) => { if (next) onUpdate({ icon: next }) }}>
                <button type="button" className="mt-[1px] shrink-0 cursor-pointer select-none text-[17px] leading-6 transition hover:scale-110" title={tr("Change icon")}>
                  {icon}
                </button>
              </EmojiPicker>
            )}
            <div className="min-w-0 flex-1">
              <div className={cn(calloutFolded && "line-clamp-2")}>{renderEditable("text-[15px] leading-[1.7] py-0")}</div>
              {calloutFolded ? (
                <button type="button" onClick={() => setCalloutFolded(false)} className="mt-0.5 text-[11px] text-brand hover:underline">{tr("Show more")}</button>
              ) : (
                block.text.length > 240 && (
                  <button type="button" onClick={() => setCalloutFolded(true)} className="mt-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:underline">{tr("Show less")}</button>
                )
              )}
            </div>
          </div>
        )
      }
      case "curl":
        return <CurlBlock block={block} readOnly={readOnly} autoFocus={autoFocus} onUpdate={onUpdate} />
      case "code":
        return (
          <Suspense fallback={<LazyBlockFallback />}>
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
          </Suspense>
        )
      case "table": {
        const sortByColumn = (index: number, dir?: "asc" | "desc") => {
          const nextDir: "asc" | "desc" = dir ?? (tableSort?.column === index && tableSort.dir === "asc" ? "desc" : "asc")
          setTableSort({ column: index, dir: nextDir })
          sortRows(index, nextDir)
        }
        const formulaTarget = activeTableCell && activeTableCell.row >= 0 && tableColumnType(table, activeTableCell.column) === "text" ? activeTableCell : null
        const insertFormula = (name: string) => {
          const target = formulaTarget ?? { row: Math.max(0, table.rows.length - 1), column: activeTableCell?.column ?? 0 }
          const label = columnLabel(target.column)
          const template = target.row > 0 ? `=${name}(${label}1:${label}${target.row})` : `=${name}(`
          setCell(target.row, target.column, template)
          window.setTimeout(() => {
            const element = document.getElementById(`table-cell-${block.id}-${target.row}-${target.column}`) as HTMLInputElement | null
            if (!element) return
            element.focus()
            element.setSelectionRange(template.length, template.length)
          }, 30)
        }
        const clearFormula = () => {
          if (!formulaTarget) return
          if (!table.formulas?.[formulaCellKey(formulaTarget.row, formulaTarget.column)]) return
          setCell(formulaTarget.row, formulaTarget.column, "")
        }
        const query = table.query ?? { match: "all" as const, filters: [] }
        const activeFilters = query.filters.filter((filter) => table.columns.includes(filter.column))
        const cellMatches = (cell: string, filter: { op: string; value: string }) => {
          const value = filter.value.trim()
          const a = cell.toLowerCase()
          const b = value.toLowerCase()
          switch (filter.op) {
            case "equals": return a === b
            case "notEquals": return a !== b
            case "isEmpty": return cell.trim() === ""
            case "isNotEmpty": return cell.trim() !== ""
            case "gt": return Number.isFinite(Number(cell)) && Number.isFinite(Number(value)) && Number(cell) > Number(value)
            case "lt": return Number.isFinite(Number(cell)) && Number.isFinite(Number(value)) && Number(cell) < Number(value)
            case "gte": return Number.isFinite(Number(cell)) && Number.isFinite(Number(value)) && Number(cell) >= Number(value)
            case "lte": return Number.isFinite(Number(cell)) && Number.isFinite(Number(value)) && Number(cell) <= Number(value)
            default: return a.includes(b)
          }
        }
        const visibleRows = table.rows
          .map((row, rowIndex) => ({ row, rowIndex }))
          .filter(({ row }) => {
            if (activeFilters.length === 0) return true
            const results = activeFilters.map((filter) => {
              const columnIndex = table.columns.indexOf(filter.column)
              return cellMatches(row[columnIndex] ?? "", filter)
            })
            return query.match === "any" ? results.some(Boolean) : results.every(Boolean)
          })
        const columnIndexes = tableVisibleColumnIndexes(table)
        const columnOrder = tableColumnOrder(table)
        const firstVisibleColumn = columnIndexes[0]
        const hiddenSet = new Set(table.hiddenColumns ?? [])
        const frozenSet = tableFrozenColumnIndexes(table)
        const frozenOffsets = tableFrozenOffsets(table, Boolean(table.rowNumbers))
        const updateQuery = (next: TableQuery) => {
          updateTable({ ...table, query: next.filters.length ? next : undefined })
        }
        const compactStyle = (style: TableCellStyle) => Object.fromEntries(Object.entries(style).filter(([, value]) => Boolean(value))) as TableCellStyle
        const setColumnStyle = (columnIndex: number, style: TableCellStyle) => {
          const next = [...(table.columnStyles ?? [])]
          const compact = compactStyle(style)
          next[columnIndex] = Object.keys(compact).length ? compact : null
          updateTable({ ...table, columnStyles: next })
        }
        const setRowStyle = (rowIndex: number, style: TableCellStyle) => {
          const next = [...(table.rowStyles ?? [])]
          const compact = compactStyle(style)
          next[rowIndex] = Object.keys(compact).length ? compact : null
          updateTable({ ...table, rowStyles: next })
        }
        const filterOps = [
          ["contains", "Contains"], ["equals", "Equals"], ["notEquals", "Not equals"],
          ["isEmpty", "Is empty"], ["isNotEmpty", "Is not empty"],
          ["gt", "Greater than"], ["lt", "Less than"], ["gte", "Greater or equal"], ["lte", "Less or equal"],
        ] as const
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
          let formulas = table.formulas
          if (formulas) {
            const pasted = new Set<string>()
            matrix.forEach((cells, rowOffset) => cells.forEach((_, columnOffset) => pasted.add(formulaCellKey(rowIndex + rowOffset, columnIndex + columnOffset))))
            const kept = Object.entries(formulas).filter(([key]) => !pasted.has(key))
            formulas = kept.length ? Object.fromEntries(kept) : undefined
          }
          const pastedFormulas: Record<string, string> = {}
          matrix.forEach((cells, rowOffset) => {
            cells.forEach((value, columnOffset) => {
              const row = rowIndex + rowOffset
              const column = columnIndex + columnOffset
              const type = column < table.columns.length ? tableColumnType(table, column) : "text"
              const normalized = normalizeTableCell(value, type)
              rows[row][column] = normalized
              if (type === "text" && isFormulaInput(normalized)) pastedFormulas[formulaCellKey(row, column)] = normalized.trim()
            })
          })
          if (Object.keys(pastedFormulas).length > 0) formulas = { ...(formulas ?? {}), ...pastedFormulas }
          updateTable({ ...table, columns, rows, formulas })
          const lastRow = rowIndex + matrix.length - 1
          const lastColumn = columnIndex + Math.max(...matrix.map((row) => row.length)) - 1
          focusCell(lastRow, lastColumn)
        }
        return (
          <div className="my-2 overflow-hidden rounded-lg border border-border/80 bg-card" onFocus={() => onFocusBlock?.(block.id)}>
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 border-b border-border/60 px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <Table2 className="size-3 shrink-0" /> <span className="shrink-0 whitespace-nowrap">{tr("Table")}</span>
              <span className="shrink-0 whitespace-nowrap normal-case tracking-normal text-muted-foreground/60">
                {columnIndexes.length}{columnIndexes.length !== table.columns.length ? `/${table.columns.length}` : ""} × {visibleRows.length}{activeFilters.length > 0 ? ` / ${table.rows.length}` : ""}
              </span>
              <div className="ml-auto flex flex-wrap items-center justify-end gap-0.5 gap-y-1 normal-case tracking-normal">
                {!readOnly && <button
                  type="button"
                  onClick={() => updateTable({ ...table, header: table.header === false })}
                  aria-pressed={table.header !== false}
                  className="hidden shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-normal transition hover:bg-accent hover:text-foreground sm:flex"
                >
                  {tr("Header row")}
                </button>}
                {!readOnly && <button
                  type="button"
                  onClick={() => updateTable({ ...table, rowNumbers: !table.rowNumbers })}
                  aria-pressed={Boolean(table.rowNumbers)}
                  title={tr("Row numbers")}
                  className={`hidden shrink-0 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-normal transition hover:bg-accent hover:text-foreground sm:flex ${table.rowNumbers ? "bg-accent text-foreground" : ""}`}
                >
                  # {tr("Row numbers")}
                </button>}
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" aria-label={tr("Filter")} title={tr("Filter")} className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-normal transition hover:bg-accent hover:text-foreground ${activeFilters.length ? "bg-accent text-foreground" : ""}`}>
                      <Filter className="size-3" /> <span className="hidden sm:inline">{tr("Filter")}</span>{activeFilters.length ? ` ${activeFilters.length}` : ""}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-[min(92vw,26rem)] p-3">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium">{tr("Filter rows")}</span>
                      <select value={query.match} onChange={(event) => updateQuery({ ...query, match: event.target.value as "all" | "any" })} className="ml-auto h-7 rounded border bg-background px-1 text-[11px]">
                        <option value="all">{tr("Match all")}</option>
                        <option value="any">{tr("Match any")}</option>
                      </select>
                    </div>
                    <div className="mt-2 space-y-1.5">
                      {query.filters.map((filter, index) => (
                        <div key={index} className="flex flex-wrap items-center gap-1">
                          <select value={filter.column} onChange={(event) => updateQuery({ ...query, filters: query.filters.map((item, i) => i === index ? { ...item, column: event.target.value } : item) })} className="h-7 min-w-0 flex-1 rounded border bg-background px-1 text-[11px]">
                            {table.columns.map((column) => <option key={column} value={column}>{column}</option>)}
                          </select>
                          <select value={filter.op} onChange={(event) => updateQuery({ ...query, filters: query.filters.map((item, i) => i === index ? { ...item, op: event.target.value as TableQuery["filters"][number]["op"] } : item) })} className="h-7 rounded border bg-background px-1 text-[11px]">
                            {filterOps.map(([op, label]) => <option key={op} value={op}>{tr(label)}</option>)}
                          </select>
                          {filter.op !== "isEmpty" && filter.op !== "isNotEmpty" && <input value={filter.value} onChange={(event) => updateQuery({ ...query, filters: query.filters.map((item, i) => i === index ? { ...item, value: event.target.value } : item) })} placeholder={tr("Value")} className="h-7 min-w-0 flex-1 rounded border bg-background px-1.5 text-[11px] outline-none" />}
                          <button type="button" onClick={() => updateQuery({ ...query, filters: query.filters.filter((_, i) => i !== index) })} aria-label={tr("Remove filter")} className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><X className="size-3" /></button>
                        </div>
                      ))}
                    </div>
                    <div className="mt-2 flex items-center gap-1 border-t border-border/60 pt-2">
                      <button type="button" onClick={() => updateQuery({ ...query, filters: [...query.filters, { column: table.columns[0] ?? "", op: "contains", value: "" }] })} className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"><Plus className="size-3" /> {tr("Add condition")}</button>
                      {query.filters.length > 0 && <button type="button" onClick={() => updateQuery({ match: "all", filters: [] })} className="ml-auto rounded px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground">{tr("Clear filters")}</button>}
                    </div>
                  </PopoverContent>
                </Popover>
                <Popover>
                  <PopoverTrigger asChild>
                    <button type="button" aria-label={tr("Table columns")} title={tr("Table columns")} className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-normal transition hover:bg-accent hover:text-foreground ${hiddenSet.size ? "bg-accent text-foreground" : ""}`}>
                      <Columns2 className="size-3" /> <span className="hidden sm:inline">{tr("Table columns")}</span>{hiddenSet.size ? ` ${hiddenSet.size}` : ""}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent align="end" className="w-64 p-2.5">
                    <div className="mb-1.5 flex items-center justify-between text-[11px]">
                      <span className="font-medium">{tr("Visible columns")}</span>
                      {hiddenSet.size > 0 && <button type="button" onClick={() => updateTable({ ...table, hiddenColumns: undefined })} className="text-muted-foreground hover:text-foreground">{tr("Show all")}</button>}
                    </div>
                    <div className="max-h-64 space-y-0.5 overflow-auto">
                      {columnOrder.map((columnIndex) => {
                        const hidden = hiddenSet.has(columnIndex)
                        return (
                          <div key={columnIndex} className="flex items-center gap-1 rounded px-1.5 py-1 text-[11px] hover:bg-accent">
                            <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-2">
                              <input
                                type="checkbox"
                                checked={!hidden}
                                disabled={!hidden && columnIndexes.length <= 1}
                                onChange={() => toggleColumnHidden(columnIndex)}
                                className="size-3.5 accent-[var(--brand)]"
                              />
                              <span className="min-w-0 flex-1 truncate">{table.columns[columnIndex] || tr("Column")}</span>
                              {hidden && <EyeOff className="size-3 text-muted-foreground" />}
                            </label>
                            <button
                              type="button"
                              onClick={() => toggleColumnFrozen(columnIndex)}
                              aria-pressed={frozenSet.has(columnIndex)}
                              title={tr("Freeze column")}
                              aria-label={tr("Freeze column")}
                              className={cn("flex size-5 shrink-0 items-center justify-center rounded transition hover:bg-accent", frozenSet.has(columnIndex) ? "text-brand" : "text-muted-foreground/50 hover:text-foreground")}
                            >
                              <Snowflake className="size-3" />
                            </button>
                          </div>
                        )
                      })}
                    </div>
                    <div className="mt-2 space-y-1 border-t border-border/60 pt-2">
                      <label className="flex cursor-pointer items-center gap-2 text-[11px]">
                        <input type="checkbox" checked={table.stickyHeader !== false} onChange={toggleHeaderSticky} className="size-3.5 accent-[var(--brand)]" />
                        {tr("Sticky header")}
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-[11px]">
                        <input type="checkbox" checked={firstVisibleColumn !== undefined && frozenSet.has(firstVisibleColumn)} onChange={toggleFreezeFirst} className="size-3.5 accent-[var(--brand)]" />
                        {tr("Freeze first column")}
                      </label>
                    </div>
                  </PopoverContent>
                </Popover>
                <button
                  type="button"
                  onClick={copyTable}
                  className="hidden shrink-0 items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-normal transition hover:bg-accent hover:text-foreground sm:flex"
                >
                  <Copy className="size-3" /> {tr("Copy")}
                </button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      title={tr("Export")}
                      aria-label={tr("Export")}
                      className="flex shrink-0 items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-normal transition hover:bg-accent hover:text-foreground"
                    >
                      <MoreHorizontal className="size-3" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-40">
                    <DropdownMenuItem onSelect={downloadCSV}>
                      <Download className="mr-2 size-3.5" /> CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={downloadJSONL}>
                      <Download className="mr-2 size-3.5" /> JSONL
                    </DropdownMenuItem>
                    <DropdownMenuItem onSelect={downloadExcel}>
                      <Download className="mr-2 size-3.5" /> Excel
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      aria-label={tr("More table actions")}
                      title={tr("More table actions")}
                      className="flex size-6 shrink-0 items-center justify-center rounded text-muted-foreground transition hover:bg-accent hover:text-foreground sm:hidden"
                    >
                      <MoreVertical className="size-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    {!readOnly && <>
                      <DropdownMenuItem onSelect={() => updateTable({ ...table, header: table.header === false })}>
                        {table.header !== false ? <Check className="mr-2 size-3.5" /> : <span className="mr-2 size-3.5" />}
                        {tr("Header row")}
                      </DropdownMenuItem>
                      <DropdownMenuItem onSelect={() => updateTable({ ...table, rowNumbers: !table.rowNumbers })}>
                        {table.rowNumbers ? <Check className="mr-2 size-3.5" /> : <span className="mr-2 size-3.5" />}
                        {tr("Row numbers")}
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                    </>}
                    <DropdownMenuItem onSelect={copyTable}>
                      <Copy className="mr-2 size-3.5" /> {tr("Copy")}
                    </DropdownMenuItem>
                    {!readOnly && (
                      <DropdownMenuItem onSelect={() => tableImportRef.current?.click()}>
                        <Upload className="mr-2 size-3.5" /> {tr("Import")}
                      </DropdownMenuItem>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
                {!readOnly && <>
                  <input
                    ref={tableImportRef}
                    type="file"
                    accept=".csv,.tsv,.tab,.json,.jsonl,.ndjson,.xlsx,.xlsm,.xls"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0]
                      event.target.value = ""
                      if (!file) return
                      void parseTableImport(file).then((imported) => {
                        updateTable({
                          ...table,
                          columns: imported.columns,
                          rows: imported.rows,
                          header: true,
                          widths: imported.columns.map(() => 160),
                          align: imported.columns.map(() => "left"),
                          columnStyles: undefined,
                          rowStyles: undefined,
                          query: undefined,
                          columnTypes: undefined,
                          columnOptions: undefined,
                        })
                        toast.success(tr("Imported {n} row(s)", { n: imported.rows.length }))
                      }).catch((error) => toast.error(error instanceof Error ? tr(error.message) : tr("Could not import file")))
                    }}
                  />
                  <button type="button" onClick={() => tableImportRef.current?.click()} title={tr("Import CSV, JSONL or Excel")} className="hidden shrink-0 items-center gap-1 whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-normal transition hover:bg-accent hover:text-foreground sm:flex"><Upload className="size-3" /> {tr("Import")}</button>
                </>}
              </div>
            </div>
            <div className="max-h-[65vh] overflow-auto">
              <table className="w-full border-collapse text-sm" style={{ tableLayout: "fixed", minWidth: widths.reduce((sum, width) => sum + width, 0) + (table.rowNumbers ? 40 : 0) }}>
                <colgroup>
                  {table.rowNumbers && <col style={{ width: 40 }} />}
                  {columnIndexes.map((columnIndex) => <col key={columnIndex} style={{ width: widths[columnIndex] }} />)}
                </colgroup>
                {table.header !== false && <thead className={cn("z-10", table.stickyHeader !== false && "sticky top-0")}>
                  <tr>
                    {table.rowNumbers && <th className={cn("border-b border-r border-border/60 bg-muted/35 px-2 text-center text-[10px] font-medium text-muted-foreground", frozenOffsets.size > 0 && "sticky left-0 z-20")}>#</th>}
                    {columnIndexes.map((columnIndex) => {
                      const type = tableColumnType(table, columnIndex)
                      return (
                      <th
                        key={columnIndex}
                        className={cn("group/head relative border-b border-r border-border/60 bg-muted/35 p-0 text-left last:border-r-0", tableCellStyleClasses(table.columnStyles?.[columnIndex]), frozenOffsets.has(columnIndex) && "sticky z-20")}
                        style={frozenOffsets.has(columnIndex) ? { left: frozenOffsets.get(columnIndex) } : undefined}
                        onDragOver={(event) => { if (dragColumn !== null) { event.preventDefault(); event.dataTransfer.dropEffect = "move" } }}
                        onDrop={(event) => { event.preventDefault(); if (dragColumn !== null && dragColumn !== columnIndex) reorderColumn(dragColumn, columnIndex); setDragColumn(null) }}
                      >
                        <div className="flex items-center gap-0.5 px-1">
                          {!readOnly && <span draggable onDragStart={(event) => { event.dataTransfer.effectAllowed = "move"; event.dataTransfer.setData("text/plain", String(columnIndex)); setDragColumn(columnIndex) }} onDragEnd={() => setDragColumn(null)} className="flex size-5 shrink-0 cursor-grab items-center justify-center rounded text-muted-foreground/0 transition active:cursor-grabbing max-md:text-muted-foreground group-hover/head:text-muted-foreground" title={tr("Drag to reorder column")}><GripVertical className="size-3" /></span>}
                          <TableCell
                            id={`table-cell-${block.id}-${-1}-${columnIndex}`}
                            value={table.columns[columnIndex] ?? ""}
                            readOnly={readOnly}
                            header
                            align={aligns[columnIndex]}
                            onChange={(value) => setColumn(columnIndex, value)}
                            onKeyDown={(event) => handleCellKeyDown(event, -1, columnIndex)}
                            onFocus={() => { setActiveTableCell({ row: -1, column: columnIndex }); onFocusBlock?.(block.id) }}
                            className="min-w-0 flex-1"
                            placeholder={`Column ${columnIndex + 1}`}
                          />
                          {!readOnly && <TableStylePopover label={tr("Column style")} style={table.columnStyles?.[columnIndex]} onChange={(style) => setColumnStyle(columnIndex, style)} className="group-hover/head:text-muted-foreground" />}
                          {!readOnly && (
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <button
                                  type="button"
                                  aria-label={tr("Column actions")}
                                  title={tr("Column actions")}
                                  className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/0 transition max-md:text-muted-foreground group-hover/head:text-muted-foreground hover:bg-accent hover:text-foreground"
                                >
                                  <MoreHorizontal className="size-3" />
                                </button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem onSelect={() => sortByColumn(columnIndex, "asc")}>
                                  <ArrowUp className="mr-2 size-3.5" /> {tr("Sort ascending")}
                                </DropdownMenuItem>
                                <DropdownMenuItem onSelect={() => sortByColumn(columnIndex, "desc")}>
                                  <ArrowDown className="mr-2 size-3.5" /> {tr("Sort descending")}
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuSub>
                                  <DropdownMenuSubTrigger>
                                    {tableColumnType(table, columnIndex) === "checkbox" ? <SquareCheckBig className="mr-2 size-3.5" /> : tableColumnType(table, columnIndex) === "switch" ? <ToggleRight className="mr-2 size-3.5" /> : tableColumnType(table, columnIndex) === "select" ? <ListFilter className="mr-2 size-3.5" /> : <TextCursorInput className="mr-2 size-3.5" />}
                                    {tr("Column type")}
                                  </DropdownMenuSubTrigger>
                                  <DropdownMenuSubContent>
                                    {TABLE_COLUMN_TYPES.map(({ value, label }) => (
                                      <DropdownMenuItem key={value} onSelect={() => setColumnType(columnIndex, value)}>
                                        {tableColumnType(table, columnIndex) === value ? <Check className="mr-2 size-3.5" /> : <span className="mr-2 size-3.5" />}
                                        {tr(label)}
                                      </DropdownMenuItem>
                                    ))}
                                    {tableColumnType(table, columnIndex) === "select" && (
                                      <>
                                        <DropdownMenuSeparator />
                                        <DropdownMenuItem onSelect={() => {
                                          setStatusColumn(columnIndex)
                                          setStatusDraft(tableColumnOptions(table, columnIndex).join(", "))
                                        }}>
                                          <ListFilter className="mr-2 size-3.5" /> {tr("Status options")}
                                        </DropdownMenuItem>
                                      </>
                                    )}
                                  </DropdownMenuSubContent>
                                </DropdownMenuSub>
                                <DropdownMenuSeparator />
                                <DropdownMenuSub>
                                  <DropdownMenuSubTrigger>
                                    {aligns[columnIndex] === "center" ? <AlignCenter className="mr-2 size-3.5" /> : aligns[columnIndex] === "right" ? <AlignRight className="mr-2 size-3.5" /> : <AlignLeft className="mr-2 size-3.5" />}
                                    {tr("Align")}
                                  </DropdownMenuSubTrigger>
                                  <DropdownMenuSubContent>
                                    {([["left", "Left"], ["center", "Center"], ["right", "Right"]] as const).map(([value, label]) => (
                                      <DropdownMenuItem key={value} onSelect={() => setAlignment(columnIndex, value)}>
                                        {aligns[columnIndex] === value ? <Check className="mr-2 size-3.5" /> : <span className="mr-2 size-3.5" />}
                                        {tr(label)}
                                      </DropdownMenuItem>
                                    ))}
                                  </DropdownMenuSubContent>
                                </DropdownMenuSub>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onSelect={() => toggleColumnFrozen(columnIndex)}>
                                  <Snowflake className="mr-2 size-3.5" /> {frozenSet.has(columnIndex) ? tr("Unfreeze column") : tr("Freeze column")}
                                </DropdownMenuItem>
                                {table.columns.length > 1 && (
                                  <DropdownMenuItem onSelect={() => toggleColumnHidden(columnIndex)}>
                                    <EyeOff className="mr-2 size-3.5" /> {tr("Hide column")}
                                  </DropdownMenuItem>
                                )}
                                {table.columns.length > 1 && (
                                  <DropdownMenuItem onSelect={() => removeColumn(columnIndex)} className="text-destructive focus:text-destructive">
                                    <X className="mr-2 size-3.5" /> {tr("Delete column")}
                                  </DropdownMenuItem>
                                )}
                              </DropdownMenuContent>
                            </DropdownMenu>
                          )}
                          <span
                            role="separator"
                            aria-label={tr("Resize column")}
                            onMouseDown={(event) => resizeColumn(event, columnIndex)}
                            className="absolute right-0 top-0 h-full w-1 cursor-col-resize bg-transparent hover:bg-brand/40"
                          />
                        </div>
                      </th>
                      )
                    })}
                    <th className="w-12 border-b border-border/60 bg-muted/35" />
                  </tr>
                </thead>}
                <tbody>
                  {visibleRows.map(({ row, rowIndex }, visibleIndex) => (
                    <tr key={rowIndex} className="group/row transition-colors hover:bg-brand-soft/15">
                      {table.rowNumbers && <td className={cn("border-b border-r border-border/60 text-center text-[11px] tabular-nums text-muted-foreground", frozenOffsets.size > 0 && "sticky left-0 z-10 bg-card", tableCellStyleClasses(table.rowStyles?.[rowIndex]))}>{visibleIndex + 1}</td>}
                      {columnIndexes.map((columnIndex) => {
                        const type = tableColumnType(table, columnIndex)
                        return (
                        <td key={columnIndex} className={cn("border-b border-r border-border/60 p-0 last:border-r-0", frozenOffsets.has(columnIndex) && "sticky z-10 bg-card", tableCellStyleClasses({ ...(table.rowStyles?.[rowIndex] ?? {}), ...(table.columnStyles?.[columnIndex] ?? {}) }))} style={frozenOffsets.has(columnIndex) ? { left: frozenOffsets.get(columnIndex) } : undefined}>
                          {type === "text" ? (
                            <TableCell
                              id={`table-cell-${block.id}-${rowIndex}-${columnIndex}`}
                              value={row[columnIndex] ?? ""}
                              formula={table.formulas?.[formulaCellKey(rowIndex, columnIndex)]}
                              readOnly={readOnly}
                              align={aligns[columnIndex]}
                              onChange={(value) => setCell(rowIndex, columnIndex, value)}
                              onKeyDown={(event) => handleCellKeyDown(event, rowIndex, columnIndex)}
                              onPaste={(event) => pasteCells(event, rowIndex, columnIndex)}
                              onFocus={() => { setActiveTableCell({ row: rowIndex, column: columnIndex }); onFocusBlock?.(block.id) }}
                              placeholder=" "
                            />
                          ) : (
                            <TableInputCell
                              id={`table-input-${block.id}-${rowIndex}-${columnIndex}`}
                              type={type}
                              value={row[columnIndex] ?? ""}
                              options={tableColumnOptions(table, columnIndex)}
                              readOnly={readOnly}
                              align={aligns[columnIndex]}
                              label={`${table.columns[columnIndex] || tr("Column")} ${rowIndex + 1}`}
                              onChange={(value) => setCell(rowIndex, columnIndex, value)}
                              onFocus={() => { setActiveTableCell({ row: rowIndex, column: columnIndex }); onFocusBlock?.(block.id) }}
                            />
                          )}
                        </td>
                        )
                      })}
                      <td className="border-b border-border/60 p-0 text-center">
                        {!readOnly && <TableStylePopover label={tr("Row style")} style={table.rowStyles?.[rowIndex]} onChange={(style) => setRowStyle(rowIndex, style)} className="inline-flex group-hover/row:text-muted-foreground" />}
                        {!readOnly && table.rows.length > 1 && <button
                          type="button"
                          onClick={() => removeRow(rowIndex)}
                          className="inline-flex size-6 items-center justify-center rounded text-muted-foreground/0 transition max-md:text-muted-foreground group-hover/row:text-muted-foreground hover:bg-destructive/10 hover:!text-destructive"
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
                className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <Plus className="size-3" /> Row
              </button>
              <button
                type="button"
                onClick={addColumn}
                className="flex shrink-0 items-center gap-1 whitespace-nowrap rounded px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <Plus className="size-3" /> Column
              </button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    title={tr("Insert formula")}
                    className="ml-auto flex shrink-0 items-center gap-1 whitespace-nowrap rounded px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-accent hover:text-foreground"
                  >
                    <Sigma className="size-3" /> {tr("Formula")}
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-60">
                  <div className="px-2 py-1 text-[10px] uppercase tracking-wider text-muted-foreground">{tr("Insert formula")}</div>
                  {(["SUM", "AVERAGE", "COUNT", "MIN", "MAX", "MEDIAN"] as const).map((name) => (
                    <DropdownMenuItem key={name} onSelect={() => insertFormula(name)} className="font-mono text-[11px] uppercase">{name}</DropdownMenuItem>
                  ))}
                  <DropdownMenuSeparator />
                  <DropdownMenuItem onSelect={() => setFormulaHelpOpen(true)}>
                    <BookOpen className="mr-2 size-3.5" /> {tr("Formula help")}
                  </DropdownMenuItem>
                  <DropdownMenuItem disabled={!formulaTarget || !table.formulas?.[formulaCellKey(formulaTarget.row, formulaTarget.column)]} onSelect={clearFormula}>
                    <X className="mr-2 size-3.5" /> {tr("Clear formula")}
                  </DropdownMenuItem>
                  <div className="px-2 pb-1 pt-1.5 text-[10px] leading-snug text-muted-foreground">{tr("Formulas recalculate when cells change")}</div>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>}
            <Dialog open={statusColumn !== null} onOpenChange={(open) => { if (!open) setStatusColumn(null) }}>
              <DialogContent className="max-w-md">
                <DialogHeader>
                  <DialogTitle>{tr("Status options")}</DialogTitle>
                </DialogHeader>
                <p className="text-xs text-muted-foreground">{tr("Comma or newline separated.")}</p>
                <Textarea value={statusDraft} onChange={(event) => setStatusDraft(event.target.value)} rows={5} className="font-mono text-xs" autoFocus />
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setStatusColumn(null)}>{tr("Cancel")}</Button>
                  <Button
                    type="button"
                    onClick={() => {
                      if (statusColumn === null) return
                      setColumnOptions(statusColumn, statusDraft.split(/[,\n]/).map((item) => item.trim()).filter(Boolean))
                      setStatusColumn(null)
                    }}
                  >
                    {tr("Save")}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
            <FormulaHelpDialog open={formulaHelpOpen} onOpenChange={setFormulaHelpOpen} />
          </div>
        )
      }
      case "diagram": {
        const zoom = Number(block.align ?? "100") || 100
        const mode = readOnly ? "preview" : diagramMode
        const sourceEditor = (
          <textarea
            value={block.text}
            readOnly={readOnly}
            onChange={(event) => onUpdate({ text: event.target.value })}
            onFocus={() => onFocusBlock?.(block.id)}
            spellCheck={false}
            rows={mode === "split" ? 12 : Math.min(16, Math.max(5, block.text.split("\n").length + 1))}
            placeholder={"flowchart LR\n  A[Start] --> B[Finish]"}
            className={cn(
              "block w-full resize-y bg-transparent p-3 font-mono text-[12px] leading-5 outline-none placeholder:text-muted-foreground/50",
              mode === "split" && "min-h-[240px] border-r md:max-h-[70svh]",
            )}
          />
        )
        const preview = (
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setDiagramZoom(true) } }}
            className="group/diagram relative min-w-0 cursor-zoom-in overflow-auto rounded-lg p-2 outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            onClick={() => setDiagramZoom(true)}
            title={tr("Click to zoom")}
          >
            <MermaidDiagram source={block.text} />
            <span className="pointer-events-none absolute right-2 top-2 hidden items-center gap-1 rounded-md border bg-background/85 px-2 py-1 text-[10px] text-muted-foreground shadow-sm backdrop-blur group-hover/diagram:flex">
              <Maximize2 className="size-3" /> {tr("Click to zoom")}
            </span>
          </div>
        )
        return (
          <div className="my-2 overflow-hidden rounded-lg border border-border/80 bg-card">
            <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 px-2.5 py-1.5">
              <Network className="size-3 text-muted-foreground" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {tr("Mermaid diagram")}
              </span>
              {!readOnly && (
                <div className="ml-2 flex rounded-md border bg-background p-0.5">
                  {(["preview", "split", "source"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={diagramMode === value}
                      onClick={() => setDiagramMode(value)}
                      className={cn("rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition hover:text-foreground", diagramMode === value && "bg-accent font-medium text-foreground")}
                    >
                      {tr(value === "preview" ? "Preview" : value === "split" ? "Split" : "Source")}
                    </button>
                  ))}
                </div>
              )}
              <div className="ml-auto flex items-center gap-1">
                {mode !== "source" && (
                  <>
                    <button type="button" onClick={() => onUpdate({ align: String(Math.max(50, zoom - 10)) })} className="rounded px-1.5 py-0.5 text-[10px] hover:bg-accent">−</button>
                    <span className="text-[10px] text-muted-foreground">{zoom}%</span>
                    <button type="button" onClick={() => onUpdate({ align: String(Math.min(200, zoom + 10)) })} className="rounded px-1.5 py-0.5 text-[10px] hover:bg-accent">+</button>
                    <button
                      type="button"
                      onClick={() => { void navigator.clipboard.writeText(block.text).then(() => toast.success(tr("Copied")), () => toast.error(tr("Could not copy"))) }}
                      title={tr("Copy source")}
                      className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                    >
                      <Copy className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiagramZoom(true)}
                      title={tr("Zoom preview")}
                      className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                    >
                      <Maximize2 className="size-3" />
                    </button>
                  </>
                )}
              </div>
              <DiagramLightbox source={block.text} title={tr("Diagram preview")} open={diagramZoom} onOpenChange={setDiagramZoom} />
            </div>
            {mode === "split" ? (
              <div className="grid grid-cols-1 md:grid-cols-2">
                {sourceEditor}
                {preview}
              </div>
            ) : mode === "source" ? sourceEditor : preview}
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
              <hr className={cn(style === "dashed" ? "border-dashed" : style === "dotted" ? "border-dotted" : "border-solid", block.width === "thick" ? "border-t-2" : "border-t")} style={{ borderColor: "var(--border)" }} />
              {!readOnly && (
                <div className="mt-1 hidden justify-center gap-1 opacity-0 transition-opacity max-md:opacity-100 group-hover/divider:opacity-100 group-focus-within/divider:opacity-100 sm:flex">
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
        return <Suspense fallback={<LazyBlockFallback />}><EquationBlock block={block} readOnly={readOnly} autoFocus={autoFocus} onUpdate={onUpdate} /></Suspense>
      case "toc":
        return <TocBlock block={block} headings={headings} readOnly={readOnly} onUpdate={readOnly ? undefined : onUpdate} />
      case "jsonVisual":
        return <JsonVisualBlock block={block} readOnly={readOnly} onUpdate={onUpdate} />
      case "database":
        return <DatabaseBlock block={block} workspaceId={workspaceId} readOnly={readOnly} onUpdate={onUpdate} />
      case "gantt":
        return <GanttBlock block={block} readOnly={readOnly} autoFocus={autoFocus} onUpdate={onUpdate} />
      case "chart":
        return <ChartBlock block={block} readOnly={readOnly} autoFocus={autoFocus} onUpdate={onUpdate} />
      case "calendar":
        return <CalendarBlock block={block} readOnly={readOnly} onUpdate={onUpdate} />
      case "pageLink":
        return <PageLinkBlock block={block} readOnly={readOnly} onUpdate={onUpdate} />
      case "breadcrumb":
        return <BreadcrumbBlock block={block} breadcrumb={breadcrumb} onUpdate={readOnly ? undefined : onUpdate} />
      case "columns":
        return <ColumnsBlock block={block} readOnly={readOnly} onUpdate={onUpdate} />
      case "layout":
        return (
          <Suspense fallback={<LazyBlockFallback />}>
            <LayoutBlock
              block={block}
              readOnly={readOnly}
              onUpdate={onUpdate}
              pageId={pageId}
              workspaceId={workspaceId}
              members={members}
              onFocusBlock={onFocusBlock}
            />
          </Suspense>
        )
      case "qrcode":
        return <Suspense fallback={<LazyBlockFallback />}><QRCodeBlock block={block} readOnly={readOnly} autoFocus={autoFocus} onUpdate={onUpdate} /></Suspense>
      case "barcode":
        return <Suspense fallback={<LazyBlockFallback />}><BarcodeBlock block={block} readOnly={readOnly} autoFocus={autoFocus} onUpdate={onUpdate} /></Suspense>
      case "checkbox":
      case "radio":
      case "switch": {
        const checked = Boolean(block.checked)
        const round = block.type === "radio"
        return (
          <div className="flex items-start gap-2.5">
            {block.type === "switch" ? (
              <span className="mt-[1px] shrink-0">
                <Switch checked={checked} disabled={readOnly} onCheckedChange={() => onToggle()} aria-label={block.text || tr("Switch")} />
              </span>
            ) : (
              <button
                type="button"
                role={round ? "radio" : "checkbox"}
                aria-checked={checked}
                aria-label={block.text || (round ? tr("Radio") : tr("Checkbox"))}
                disabled={readOnly}
                onClick={onToggle}
                className={cn(
                  "mt-[5px] flex size-[17px] shrink-0 items-center justify-center border transition-colors disabled:cursor-default",
                  round ? "rounded-full" : "rounded-[4px]",
                  checked ? "border-brand bg-brand text-white" : "border-muted-foreground/40 bg-background hover:border-brand/60",
                )}
              >
                {checked && (round ? <span className="size-[5px] rounded-full bg-white" /> : <Check className="size-3" strokeWidth={3.2} />)}
              </button>
            )}
            {renderEditable(cn("text-[15px] leading-[1.7] py-[3px]", block.type === "checkbox" && checked && "text-muted-foreground line-through"))}
          </div>
        )
      }
      case "radioGroup":
        return <RadioGroupBlock block={block} readOnly={readOnly} onUpdate={onUpdate} />
      case "form":
        return <FormBlock block={block} pageId={pageId} readOnly={readOnly} autoFocus={autoFocus} onUpdate={onUpdate} />
      case "poll":
        return <PollBlock block={block} pageId={pageId} readOnly={readOnly} allowVote={allowVote} autoFocus={autoFocus} onUpdate={onUpdate} />
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
      default: {
        const paraLeading = block.type === "paragraph" && block.language === "compact" ? "leading-[1.5]" : "leading-[1.7]"
        const lines = block.text.split("\n").length
        if (readOnly && longFolded && lines > 40) {
          return (
            <div>
              <div className={`max-h-64 overflow-hidden text-[15px] ${block.type === "paragraph" && block.language === "compact" ? "leading-[1.5]" : "leading-[1.7]"}`}>
                {renderEditable("py-[3px] pointer-events-none select-none")}
              </div>
              <button
                type="button"
                onClick={() => setLongFolded(false)}
                className="mt-1 rounded-md border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                {tr("Show all {n} lines", { n: lines })}
              </button>
            </div>
          )
        }
        return renderEditable(`text-[15px] ${paraLeading} py-[3px]`)
      }
    }
  }

  return (
    <div
      ref={rowRef}
      id={`block-${block.id}`}
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
      {!readOnly && <div className="absolute -left-10 top-0 hidden h-7 items-center gap-0 opacity-0 transition-opacity group-hover/block:opacity-100 has-[[data-state=open]]:opacity-100 md:flex">
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
              className="flex size-5 cursor-grab items-center justify-center rounded text-muted-foreground opacity-60 transition hover:bg-accent hover:text-foreground hover:opacity-100 group-hover/block:opacity-100 active:cursor-grabbing md:opacity-[0.12]"
              aria-label={tr("Drag block")}
            >
              <GripVertical className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{tr("Drag to move")}</TooltipContent>
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
          onCopyLink={copyBlockLink}
          collapsed={block.collapsed}
          onToggleCollapsed={onToggleCollapsed}
          trigger={
            <button
              type="button"
              className="flex size-5 items-center justify-center rounded text-muted-foreground/70 transition hover:bg-accent hover:text-foreground data-[state=open]:bg-accent"
              aria-label={tr("Block options")}
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
        {block.translations && Object.keys(block.translations).length > 0 && (
          <div className="mt-1.5 rounded-md border border-dashed border-brand/20 bg-brand-soft/20 px-2.5 py-1.5">
            {Object.entries(block.translations).slice(0,3).map(([code, val]) => (
              <div key={code} className="flex items-start gap-1.5 py-0.5 text-xs">
                <span className="rounded bg-brand px-1 py-0.5 text-[10px] font-mono text-white">{code}</span>
                <span className="flex-1 leading-5">{val as string}</span>
                {!readOnly && <button type="button" onClick={() => { onUpdate({ text: val as string, rich: "" }); toast.success(tr("Applied")) }} className="shrink-0 rounded bg-background px-1.5 py-0.5 text-[10px] hover:bg-accent">{tr("Apply")}</button>}
                <button type="button" onClick={() => void navigator.clipboard.writeText(val as string).then(()=>toast.success(tr("Copied")), ()=>toast.error(tr("Could not copy")))} className="shrink-0 rounded px-1 py-0.5 text-[10px] hover:bg-accent"><Copy className="size-3" /></button>
              </div>
            ))}
            {Object.keys(block.translations).length > 3 && <div className="text-[11px] text-muted-foreground">+{Object.keys(block.translations).length-3} more</div>}
          </div>
        )}
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
              aria-label={tr(commentCount === 1 ? "View {n} comment" : "View {n} comments", { n: commentCount })}
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

      {!readOnly && <div className="flex size-8 shrink-0 items-center justify-center md:hidden">
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
          onCopyLink={copyBlockLink}
          collapsed={block.collapsed}
          onToggleCollapsed={onToggleCollapsed}
          align="end"
          trigger={
            <button
              type="button"
              aria-label={tr("Block options")}
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
  onCopyLink,
  collapsed = false,
  onToggleCollapsed,
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
  onCopyLink?: () => void
  collapsed?: boolean
  onToggleCollapsed?: () => void
  align?: "start" | "end"
}) {
  const canColor = TEXT_STYLE_TYPES.has(block.type)
  const canAlign = ALIGN_STYLE_TYPES.has(block.type) || block.type === "image"
  const alignValue = block.align || (block.type === "image" ? "center" : "left")
  const [customLanguage, setCustomLanguage] = useState("")
  const [translating, setTranslating] = useState(false)
  const copyText = () => {
    void navigator.clipboard.writeText(block.text).then(
      () => toast.success(tr("Copied to clipboard")),
      () => toast.error(tr("Could not copy text")),
    )
  }
  async function translateBlock(label: string, key: string) {
    if (translating) return
    setTranslating(true)
    toast.info(tr("Translating..."))
    try {
      const out = await translateText(block.text || block.caption || "", label)
      if (!out) {
        toast.error(tr("Could not translate this block. Configure AI in Settings first."))
        return
      }
      const next = { ...(block.translations ?? {}), [key]: out }
      onUpdate({ translations: next })
      toast.success(`${label} ✓`)
    } finally {
      setTranslating(false)
    }
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
        {["heading1", "heading2", "heading3"].includes(block.type) && onToggleCollapsed && (
          <DropdownMenuItem onSelect={onToggleCollapsed}>
            <ChevronRight className={cn("size-4 transition-transform", !collapsed && "rotate-90")} />
            {collapsed ? tr("Expand section") : tr("Collapse section")}
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
        {block.type === "quote" && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette /> {tr("Quote color")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-40">
              {[["", "Default"], ["brand", "Brand"], ["green", "Green"], ["red", "Red"], ["sky", "Sky"]].map(([value, label]) => (
                <DropdownMenuItem key={label} onSelect={() => onUpdate({ color: value })}>
                  <span className={cn("size-3 rounded-full border", !value ? "border-foreground/50" : value === "brand" ? "bg-brand" : value === "green" ? "bg-emerald-500" : value === "red" ? "bg-red-500" : "bg-sky-500")} />
                  {tr(label)}
                  {(block.color || "") === value && <Check className="ml-auto size-3.5" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {block.type === "paragraph" && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Rows3 /> {tr("Line spacing")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-40">
              {[["comfortable", "Comfortable"], ["compact", "Compact"]].map(([value, label]) => (
                <DropdownMenuItem key={value} onSelect={() => onUpdate({ language: value === "comfortable" ? "" : value })}>
                  {tr(label)}
                  {(block.language || "comfortable") === value && <Check className="ml-auto size-3.5" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {block.type === "todo" && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Flag /> {tr("Priority")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-40">
              {[["", "None"], ["low", "Low"], ["med", "Medium"], ["high", "High"]].map(([value, label]) => (
                <DropdownMenuItem key={label} onSelect={() => onUpdate({ language: value })}>
                  {value && <span className={cn("size-2 rounded-full", value === "high" ? "bg-red-500" : value === "med" ? "bg-amber-500" : "bg-sky-500")} />}
                  {tr(label)}
                  {(block.language || "") === value && <Check className="ml-auto size-3.5" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {block.type === "bulleted" && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <List /> {tr("Bullet style")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-40">
              {[["", "●  Dot"], ["square", "■  Square"]].map(([value, label]) => (
                <DropdownMenuItem key={label} onSelect={() => onUpdate({ language: value })}>
                  <span className="text-[11px]">{label}</span>
                  {(block.language || "") === value && <Check className="ml-auto size-3.5" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {block.type === "numbered" && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ListOrdered /> {tr("Number style")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-40">
              {[["", "1. 2. 3."], ["alpha", "a. b. c."], ["roman", "i. ii. iii."]].map(([value, label]) => (
                <DropdownMenuItem key={label} onSelect={() => onUpdate({ language: value })}>
                  <span className="font-mono text-[11px]">{label}</span>
                  {(block.language || "") === value && <Check className="ml-auto size-3.5" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {block.type === "divider" && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Minus /> {tr("Thickness")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-40">
              {[["", "Thin"], ["thick", "Thick"]].map(([value, label]) => (
                <DropdownMenuItem key={label} onSelect={() => onUpdate({ width: value })}>
                  {tr(label)}
                  {(block.width || "") === value && <Check className="ml-auto size-3.5" />}
                </DropdownMenuItem>
              ))}
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
        <DropdownMenuSub>
          <DropdownMenuSubTrigger><Languages /> {tr("Translate")}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44">
            {TRANSLATE_LANGS.map((l) => (
              <DropdownMenuItem key={l.code} onSelect={() => void translateBlock(l.label, l.code)}>
                <Globe className="size-3" /> {l.label} <span className="ml-auto text-[10px] text-muted-foreground">{l.code}</span>
                {block.translations?.[l.code] && <Check className="ml-1 size-3 text-brand" />}
              </DropdownMenuItem>
            ))}
            <div className="mt-1 flex items-center gap-1 border-t border-border/60 p-1.5">
              <input
                value={customLanguage}
                onChange={(event) => setCustomLanguage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return
                  event.preventDefault()
                  const label = customLanguage.trim()
                  if (!label) return
                  setCustomLanguage("")
                  void translateBlock(label, label.slice(0, 40))
                }}
                placeholder={tr("Custom language…")}
                className="h-7 min-w-0 flex-1 rounded border bg-background px-2 text-[11px] outline-none placeholder:text-muted-foreground/60 focus:border-brand/40"
              />
              <button
                type="button"
                aria-label={tr("Apply")}
                disabled={!customLanguage.trim() || translating}
                onClick={() => {
                  const label = customLanguage.trim()
                  if (!label) return
                  setCustomLanguage("")
                  void translateBlock(label, label.slice(0, 40))
                }}
                className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
              >
                <ArrowRight className="size-3" />
              </button>
            </div>
            {block.translations && Object.keys(block.translations).length > 0 && (
              <DropdownMenuItem variant="destructive" onSelect={() => onUpdate({ translations: {} })}><Trash2 /> {tr("Clear translations")}</DropdownMenuItem>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem onSelect={onDuplicate}>
          <Copy /> {tr("Duplicate")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={copyText}>
          <ClipboardCopy /> {tr("Copy text")}
        </DropdownMenuItem>
        {onCopyLink && (
          <DropdownMenuItem onSelect={onCopyLink}>
            <Link2 /> {tr("Copy link to block")}
          </DropdownMenuItem>
        )}
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
