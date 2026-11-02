import { useCallback } from "react"
import type { Block, TableData } from "@/lib/types"
import { tableColumnOrder, tableVisibleColumnIndexes } from "@/lib/table-layout"
import { tr } from "@/lib/i18n"
import { toast } from "sonner"

export function useTableBlock(block: Block, onUpdate: (patch: Partial<Block>) => void) {
  const table: TableData = block.table ?? {
    columns: ["Column 1", "Column 2", "Column 3"],
    rows: [["", "", ""], ["", "", ""]],
    header: true,
  }
  const widths = table.columns.map((_, i) => table.widths?.[i] ?? 160)
  const aligns = table.columns.map((_, i) => table.align?.[i] ?? "left")

  const updateTable = useCallback((next: TableData) => onUpdate({ table: next }), [onUpdate])

  const setCell = useCallback((row: number, col: number, value: string) => {
    const rows = table.rows.map((r, i) => (i === row ? table.columns.map((_, c) => (c === col ? value : (r[c] ?? ""))) : r))
    updateTable({ ...table, rows })
  }, [table, updateTable])

  const addRow = useCallback(() => {
    if (table.rows.length >= 200) return
    updateTable({ ...table, rows: [...table.rows, table.columns.map(() => "")] })
  }, [table, updateTable])

  const removeRow = useCallback((index: number) => {
    if (table.rows.length <= 1) return
    updateTable({ ...table, rows: table.rows.filter((_, i) => i !== index) })
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
    updateTable({ ...table, freezeFirst: !table.freezeFirst })
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
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    const link = document.createElement("a")
    link.href = url
    link.download = "table.csv"
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast.success(tr("Export ready"))
  }, [table])

  const downloadJSONL = useCallback(() => {
    const indexes = tableVisibleColumnIndexes(table)
    const columns = indexes.map((index) => table.columns[index])
    const lines = table.rows.map((row) => JSON.stringify(Object.fromEntries(columns.map((column, position) => [column, row[indexes[position]] ?? ""]))))
    const url = URL.createObjectURL(new Blob([lines.join("\n")], { type: "application/x-ndjson;charset=utf-8" }))
    const link = document.createElement("a")
    link.href = url
    link.download = "table.jsonl"
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast.success(tr("Export ready"))
  }, [table])

  const downloadExcel = useCallback(() => {
    const esc = (value: string) => value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[char] ?? char))
    const indexes = tableVisibleColumnIndexes(table)
    const columns = indexes.map((index) => table.columns[index])
    const header = columns.map((column) => `<Cell><Data ss:Type="String">${esc(column)}</Data></Cell>`).join("")
    const rows = table.rows.map((row) => `<Row>${indexes.map((index) => `<Cell><Data ss:Type="String">${esc(row[index] ?? "")}</Data></Cell>`).join("")}</Row>`).join("")
    const xml = `<?xml version="1.0"?><Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet"><Worksheet ss:Name="Table"><Table><Row>${header}</Row>${rows}</Table></Worksheet></Workbook>`
    const url = URL.createObjectURL(new Blob([xml], { type: "application/vnd.ms-excel;charset=utf-8" }))
    const link = document.createElement("a")
    link.href = url
    link.download = "table.xls"
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast.success(tr("Export ready"))
  }, [table])

  return {
    table, widths, aligns, updateTable, setCell, addRow, removeRow, addColumn, removeColumn, setColumn, setAlignment, resizeColumn, reorderColumn, toggleColumnHidden, toggleFreezeFirst, copyTable, downloadCSV, downloadJSONL, downloadExcel,
  }
}
