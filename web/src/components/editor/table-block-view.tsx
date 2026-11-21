import { useEffect, useRef, useState } from "react"
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowUp,
  Bold,
  BookOpen,
  Check,
  Columns2,
  Copy,
  Download,
  EyeOff,
  Filter,
  GripVertical,
  Italic,
  ListFilter,
  Merge,
  MoreHorizontal,
  MoreVertical,
  Palette,
  Plus,
  Sigma,
  Snowflake,
  SquareCheckBig,
  Table2,
  TextCursorInput,
  ToggleRight,
  Ungroup,
  Upload,
  X,
} from "lucide-react"
import { toast } from "sonner"
import type { Block, TableCellStyle, TableQuery } from "@/lib/types"
import { useTableBlock } from "@/components/editor/use-table-block"
import { TableCell } from "@/components/editor/table-cell"
import { TableInputCell } from "@/components/editor/table-input-cell"
import { parseTableImport } from "@/lib/table-import"
import { columnLabel, formulaCellKey, isFormulaInput } from "@/lib/table-formula"
import { TABLE_COLUMN_TYPES, normalizeTableCell, tableColumnOptions, tableColumnType } from "@/lib/table-input"
import { tableColumnOrder, tableFrozenColumnIndexes, tableFrozenOffsets, tableVisibleColumnIndexes } from "@/lib/table-layout"
import { cellKey, coveredCells, mergeAt, mergeDown, mergeRight, unmergeAt } from "@/lib/table-merge"
import { FormulaHelpDialog } from "@/components/editor/formula-help-dialog"
import { cn } from "@/lib/utils"
import { isImeKeyEvent } from "@/lib/keyboard"
import { tr } from "@/lib/i18n"
import { BACKGROUND_COLORS, TEXT_COLORS, backgroundColorClass, textColorClass } from "@/lib/block-style"
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
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { ColorGrid } from "@/components/ui/color-grid"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"

function tableCellStyleClasses(style?: TableCellStyle | null) {
  if (!style) return ""
  return cn(
    style.bg && backgroundColorClass(style.bg),
    style.color && textColorClass(style.color),
    style.bold && "font-semibold",
    style.italic && "italic",
  )
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


export function TableBlockView({
  block,
  readOnly,
  onUpdate,
  onFocusBlock,
}: {
  block: Block
  readOnly: boolean
  onUpdate: (patch: Partial<Block>) => void
  onFocusBlock?: (blockId: string) => void
}) {
  const tableImportRef = useRef<HTMLInputElement>(null)
  const [dragColumn, setDragColumn] = useState<number | null>(null)
  const [formulaHelpOpen, setFormulaHelpOpen] = useState(false)
  const [statusColumn, setStatusColumn] = useState<number | null>(null)
  const [statusDraft, setStatusDraft] = useState("")
  const { table, widths, heights, aligns, updateTable, setCell, addRow, removeRow, addColumn, removeColumn, setColumn, setColumnType, setColumnOptions, setAlignment, resizeColumn, resizeRow, resetRowHeight, reorderColumn, toggleColumnHidden, toggleFreezeFirst, toggleColumnFrozen, toggleHeaderSticky, sortRows, copyTable, downloadCSV, downloadJSONL, downloadExcel } = useTableBlock(block, onUpdate)
  const [tableSort, setTableSort] = useState<{ column: number; dir: "asc" | "desc" } | null>(null)
  const [activeTableCell, setActiveTableCell] = useState<{ row: number; column: number } | null>(null)

  useEffect(() => {
    setTableSort(null)
  }, [block.id])

  function renderTable() {
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
        // Merges are ignored while filtering/sorting/hiding columns: a hidden
        // covered cell would leave a hole in the rendered grid.
        const mergesActive = activeFilters.length === 0 && !tableSort && (table.hiddenColumns ?? []).length === 0
        const merges = mergesActive ? table.merges ?? [] : []
        const covered = coveredCells(merges)
        const mergeStarts = new Map(merges.map((merge) => [cellKey(merge.row, merge.col), merge]))
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
          let row = rowIndex
          let column = columnIndex
          let guard = 0
          while (
            mergesActive &&
            row >= 0 && row < table.rows.length &&
            column >= 0 && column < table.columns.length &&
            covered.has(cellKey(row, column)) &&
            guard++ < 128
          ) {
            column += 1
            if (column >= table.columns.length) {
              column = 0
              row += 1
            }
          }
          window.setTimeout(() => {
            document.getElementById(`table-cell-${block.id}-${row}-${column}`)?.focus()
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
        const mergeActiveCell = (direction: "right" | "down") => {
          if (!activeTableCell || activeTableCell.row < 0) return
          if (tableColumnType(table, activeTableCell.column) !== "text") {
            toast.warning(tr("Only text cells can be merged"))
            return
          }
          const next = direction === "right"
            ? mergeRight(table, activeTableCell.row, activeTableCell.column)
            : mergeDown(table, activeTableCell.row, activeTableCell.column)
          if (!next) {
            toast.warning(tr("These cells cannot be merged"))
            return
          }
          updateTable(next)
        }
        const unmergeActiveCell = () => {
          if (!activeTableCell || activeTableCell.row < 0) return
          const next = unmergeAt(table, activeTableCell.row, activeTableCell.column)
          if (!next) {
            toast.info(tr("No merged cells here"))
            return
          }
          updateTable(next)
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
          <div className="my-2 overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]" onFocus={() => onFocusBlock?.(block.id)}>
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
                {!readOnly && (
                  <div className="flex shrink-0 items-center gap-0.5">
                    <button type="button" aria-label={tr("Merge right")} title={tr("Merge right")} disabled={!activeTableCell || activeTableCell.row < 0} onClick={() => mergeActiveCell("right")} className="rounded p-1.5 transition hover:bg-accent hover:text-foreground disabled:opacity-40">
                      <Merge className="size-3 -rotate-90" />
                    </button>
                    <button type="button" aria-label={tr("Merge down")} title={tr("Merge down")} disabled={!activeTableCell || activeTableCell.row < 0} onClick={() => mergeActiveCell("down")} className="rounded p-1.5 transition hover:bg-accent hover:text-foreground disabled:opacity-40">
                      <Merge className="size-3 rotate-90" />
                    </button>
                    <button type="button" aria-label={tr("Unmerge")} title={tr("Unmerge")} disabled={!activeTableCell || activeTableCell.row < 0 || !mergeAt(table.merges, activeTableCell.row, activeTableCell.column)} onClick={unmergeActiveCell} className="rounded p-1.5 transition hover:bg-accent hover:text-foreground disabled:opacity-40">
                      <Ungroup className="size-3" />
                    </button>
                  </div>
                )}
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
                          heights: undefined,
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
                    <tr key={rowIndex} className="group/row transition-colors hover:bg-brand-soft/15" style={heights[rowIndex] ? { height: heights[rowIndex] } : undefined}>
                      {table.rowNumbers && <td className={cn("border-b border-r border-border/60 text-center text-[11px] tabular-nums text-muted-foreground", frozenOffsets.size > 0 && "sticky left-0 z-10 bg-card", tableCellStyleClasses(table.rowStyles?.[rowIndex]))}>{visibleIndex + 1}</td>}
                      {columnIndexes.map((columnIndex) => {
                        const cellMerge = mergeStarts.get(cellKey(rowIndex, columnIndex))
                        if (covered.has(cellKey(rowIndex, columnIndex))) return null
                        const type = tableColumnType(table, columnIndex)
                        const frozenCell = frozenOffsets.has(columnIndex) && !cellMerge
                        return (
                        <td key={columnIndex} colSpan={cellMerge?.colSpan} rowSpan={cellMerge?.rowSpan} className={cn("relative border-b border-r border-border/60 p-0 last:border-r-0", frozenCell && "sticky z-10 bg-card", tableCellStyleClasses({ ...(table.rowStyles?.[rowIndex] ?? {}), ...(table.columnStyles?.[columnIndex] ?? {}) }))} style={frozenCell ? { left: frozenOffsets.get(columnIndex) } : undefined}>
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
                          {!readOnly && (
                            <span
                              role="separator"
                              aria-label={tr("Resize row")}
                              title={tr("Drag to resize row; double-click to reset")}
                              onMouseDown={(event) => resizeRow(event, rowIndex)}
                              onDoubleClick={(event) => { event.preventDefault(); resetRowHeight(rowIndex) }}
                              className="absolute inset-x-0 -bottom-[3px] z-20 h-1.5 cursor-row-resize bg-transparent transition-colors hover:bg-brand/40 max-md:bg-brand/10"
                            />
                          )}
                        </td>
                        )
                      })}
                      <td className="relative border-b border-border/60 p-0 text-center">
                        {!readOnly && <TableStylePopover label={tr("Row style")} style={table.rowStyles?.[rowIndex]} onChange={(style) => setRowStyle(rowIndex, style)} className="inline-flex group-hover/row:text-muted-foreground" />}
                        {!readOnly && (
                          <span
                            role="separator"
                            aria-label={tr("Resize row")}
                            title={tr("Drag to resize row; double-click to reset")}
                            onMouseDown={(event) => resizeRow(event, rowIndex)}
                            onDoubleClick={(event) => { event.preventDefault(); resetRowHeight(rowIndex) }}
                            className="absolute inset-x-0 -bottom-[3px] z-20 h-1.5 cursor-row-resize bg-transparent transition-colors hover:bg-brand/40 max-md:bg-brand/10"
                          />
                        )}
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

  return renderTable()
}
