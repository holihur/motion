import { useCallback, useEffect, useMemo } from "react"
import type { Block, TableData } from "@/lib/types"
import { tableColumnOrder, tableFrozenColumnIndexes, tableVisibleColumnIndexes } from "@/lib/table-layout"
import { computeTableFormulas, formulaCellKey, isFormulaInput, remapFormulas } from "@/lib/table-formula"
import { tr } from "@/lib/i18n"
import { toast } from "sonner"

const DEFAULT_TABLE: TableData = {
  columns: ["Column 1", "Column 2", "Column 3"],
  rows: [["", "", ""], ["", "", ""]],
  header: true,
}

// Shared download plumbing so every table export revokes its object URL.
function downloadFile(name: string, mime: string, content: string) {
  const url = URL.createObjectURL(new Blob([content], { type: mime }))
  const link = document.createElement("a")
  link.href = url
  link.download = name
  link.click()
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

export function useTableBlock(block: Block, onUpdate: (patch: Partial<Block>) => void) {
  const stored = block.table ?? DEFAULT_TABLE
  // Always render recomputed values so a formula stays correct when another
  // client (or an API client) changes one of the cells it references.
  const table = useMemo(() => computeTableFormulas(stored), [stored])
  const widths = table.columns.map((_, i) => table.widths?.[i] ?? 160)
  const aligns = table.columns.map((_, i) => table.align?.[i] ?? "left")

  const updateTable = useCallback((next: TableData) => onUpdate({ table: computeTableFormulas(next) }), [onUpdate])

  // Persist repaired values (e.g. after a remote edit) so exports and the
  // server keep finished numbers instead of stale ones.
  useEffect(() => {
    if (table !== stored) onUpdate({ table })
  }, [table, stored, onUpdate])

  const setCell = useCallback((row: number, col: number, value: string) => {
    const rows = table.rows.map((r, i) => (i === row ? table.columns.map((_, c) => (c === col ? value : (r[c] ?? ""))) : r))
    const formulas = { ...(table.formulas ?? {}) }
    const key = formulaCellKey(row, col)
    if (isFormulaInput(value)) formulas[key] = value.trim()
    else delete formulas[key]
    updateTable({ ...table, rows, formulas: Object.keys(formulas).length ? formulas : undefined })
  }, [table, updateTable])

  const addRow = useCallback(() => {
    if (table.rows.length >= 200) return
    updateTable({ ...table, rows: [...table.rows, table.columns.map(() => "")] })
  }, [table, updateTable])

  const removeRow = useCallback((index: number) => {
    if (table.rows.length <= 1) return
    updateTable({
      ...table,
      rows: table.rows.filter((_, i) => i !== index),
      formulas: remapFormulas(table.formulas, (row, column) => (row === index ? null : { row: row > index ? row - 1 : row, column })),
    })
  }, [table, updateTable])

  const addColumn = useCallback(() => {
    if (table.columns.length >= 20) return
    const name = `Column ${table.columns.length + 1}`
    updateTable({
      ...table,
      columns: [...table.columns, name],
      rows: table.rows.map((r) => [...r, ""]),
      widths: [...widths, 160],
      align: [...aligns, "left"],
      columnOrder: table.columnOrder ? [...table.columnOrder, table.columns.length] : undefined,
    })
  }, [table, widths, aligns, updateTable])

  const removeColumn = useCallback((index: number) => {
    if (table.columns.length <= 1) return
    const removedName = table.columns[index]
    const shift = (values: number[] | undefined) => values?.filter((value) => value !== index).map((value) => value > index ? value - 1 : value)
    updateTable({
      ...table,
      columns: table.columns.filter((_, i) => i !== index),
      rows: table.rows.map((r) => r.filter((_, i) => i !== index)),
      widths: widths.filter((_, i) => i !== index),
      align: aligns.filter((_, i) => i !== index),
      columnStyles: table.columnStyles ? table.columnStyles.filter((_, i) => i !== index) : undefined,
      columnOrder: table.columnOrder ? shift(table.columnOrder) : undefined,
      hiddenColumns: table.hiddenColumns ? shift(table.hiddenColumns) : undefined,
      frozenColumns: table.frozenColumns ? shift(table.frozenColumns) : undefined,
      formulas: remapFormulas(table.formulas, (row, column) => (column === index ? null : { row, column: column > index ? column - 1 : column })),
      query: table.query ? { ...table.query, filters: table.query.filters.filter((filter) => filter.column !== removedName) } : undefined,
    })
  }, [table, widths, aligns, updateTable])

  const reorderColumn = useCallback((from: number, to: number) => {
    if (from === to) return
    const order = tableColumnOrder(table)
    const fromIndex = order.indexOf(from)
    const toIndex = order.indexOf(to)
    if (fromIndex < 0 || toIndex < 0) return
    order.splice(toIndex, 0, order.splice(fromIndex, 1)[0])
    const identity = order.every((value, index) => value === index)
    updateTable({ ...table, columnOrder: identity ? undefined : order })
  }, [table, updateTable])

  const toggleColumnHidden = useCallback((index: number) => {
    const hidden = new Set(table.hiddenColumns ?? [])
    if (hidden.has(index)) hidden.delete(index)
    else {
      if (tableVisibleColumnIndexes(table).length <= 1) return
      hidden.add(index)
    }
    updateTable({ ...table, hiddenColumns: hidden.size ? [...hidden].sort((a, b) => a - b) : undefined })
  }, [table, updateTable])

  const toggleFreezeFirst = useCallback(() => {
    const first = tableVisibleColumnIndexes(table)[0]
    if (first === undefined) return
    const frozen = tableFrozenColumnIndexes(table)
    if (frozen.has(first)) frozen.delete(first)
    else frozen.add(first)
    const next = [...frozen].sort((a, b) => a - b)
    updateTable({ ...table, freezeFirst: false, frozenColumns: next.length ? next : undefined })
  }, [table, updateTable])

  const toggleColumnFrozen = useCallback((index: number) => {
    const frozen = tableFrozenColumnIndexes(table)
    if (frozen.has(index)) frozen.delete(index)
    else frozen.add(index)
    const next = [...frozen].sort((a, b) => a - b)
    updateTable({ ...table, freezeFirst: false, frozenColumns: next.length ? next : undefined })
  }, [table, updateTable])

  const toggleHeaderSticky = useCallback(() => {
    updateTable({ ...table, stickyHeader: table.stickyHeader === false })
  }, [table, updateTable])

  const setColumn = useCallback((index: number, value: string) => {
    updateTable({ ...table, columns: table.columns.map((c, i) => (i === index ? value : c)) })
  }, [table, updateTable])

  const setAlignment = useCallback((index: number, value: "left" | "center" | "right") => {
    updateTable({ ...table, align: aligns.map((v, i) => (i === index ? value : v)) })
  }, [table, aligns, updateTable])

  const resizeColumn = useCallback((e: React.MouseEvent, index: number) => {
    e.preventDefault()
    e.stopPropagation()
    const startX = e.clientX
    const startWidth = widths[index]
    const onMove = (ev: MouseEvent) => {
      const next = Math.max(60, Math.min(600, startWidth + ev.clientX - startX))
      updateTable({ ...table, widths: widths.map((v, i) => (i === index ? next : v)) })
    }
    const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp) }
    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }, [table, widths, updateTable])

  const sortRows = useCallback((column: number, direction: "asc" | "desc") => {
    const compare = (left: string, right: string) => {
      const leftNumber = Number(left)
      const rightNumber = Number(right)
      if (left.trim() !== "" && right.trim() !== "" && !Number.isNaN(leftNumber) && !Number.isNaN(rightNumber)) return leftNumber - rightNumber
      return left.localeCompare(right, undefined, { numeric: true })
    }
    const order = table.rows.map((_, index) => index).sort((a, b) => {
      const result = compare(table.rows[a]?.[column] ?? "", table.rows[b]?.[column] ?? "")
      return direction === "asc" ? result : -result
    })
    const positionOf = new Map<number, number>()
    order.forEach((rowIndex, position) => positionOf.set(rowIndex, position))
    updateTable({
      ...table,
      rows: order.map((rowIndex) => table.rows[rowIndex]),
      formulas: remapFormulas(table.formulas, (row, col) => {
        const position = positionOf.get(row)
        return position === undefined ? null : { row: position, column: col }
      }),
    })
  }, [table, updateTable])

  const copyTable = useCallback(() => {
    const indexes = tableVisibleColumnIndexes(table)
    const columns = indexes.map((index) => table.columns[index])
    const tsv = [columns, ...table.rows].map((r) => indexes.map((index) => r[index] ?? "").join("\t")).join("\n")
    void navigator.clipboard.writeText(tsv).then(
      () => toast.success(tr("Table copied")),
      () => toast.error(tr("Could not copy table")),
    )
  }, [table])

  const downloadCSV = useCallback(() => {
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
    const indexes = tableVisibleColumnIndexes(table)
    const columns = indexes.map((index) => table.columns[index])
    const csv = "\ufeff" + [columns, ...table.rows].map((r) => indexes.map((index) => esc(r[index] ?? "")).join(",")).join("\n")
    downloadFile("table.csv", "text/csv;charset=utf-8", csv)
    toast.success(tr("Export ready"))
  }, [table])

  const downloadJSONL = useCallback(() => {
    const indexes = tableVisibleColumnIndexes(table)
    const columns = indexes.map((index) => table.columns[index])
    const lines = table.rows.map((row) => JSON.stringify(Object.fromEntries(columns.map((column, position) => [column, row[indexes[position]] ?? ""]))))
    downloadFile("table.jsonl", "application/x-ndjson;charset=utf-8", lines.join("\n"))
    toast.success(tr("Export ready"))
  }, [table])

  const downloadExcel = useCallback(() => {
    const esc = (value: string) => value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char] ?? char))
    const indexes = tableVisibleColumnIndexes(table)
    const columns = indexes.map((index) => table.columns[index])
    const header = columns.map((column) => `<Cell><Data ss:Type="String">${esc(column)}</Data></Cell>`).join("")
    const rows = table.rows.map((row) => `<Row>${indexes.map((index) => `<Cell><Data ss:Type="String">${esc(row[index] ?? "")}</Data></Cell>`).join("")}</Row>`).join("")
    const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Table"><Table><Row>${header}</Row>${rows}</Table></Worksheet></Workbook>`
    downloadFile("table.xls", "application/vnd.ms-excel;charset=utf-8", xml)
    toast.success(tr("Export ready"))
  }, [table])

  return {
    table, widths, aligns, updateTable, setCell, addRow, removeRow, addColumn, removeColumn, setColumn, setAlignment, resizeColumn, reorderColumn, toggleColumnHidden, toggleFreezeFirst, toggleColumnFrozen, toggleHeaderSticky, sortRows, copyTable, downloadCSV, downloadJSONL, downloadExcel,
  }
}
