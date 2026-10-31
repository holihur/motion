import { useCallback } from "react"
import type { Block, TableData } from "@/lib/types"
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
    })
  }, [table, widths, aligns, updateTable])

  const removeColumn = useCallback((index: number) => {
    if (table.columns.length <= 1) return
    updateTable({
      ...table,
      columns: table.columns.filter((_, i) => i !== index),
      rows: table.rows.map((r) => r.filter((_, i) => i !== index)),
      widths: widths.filter((_, i) => i !== index),
      align: aligns.filter((_, i) => i !== index),
    })
  }, [table, widths, aligns, updateTable])

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
    const tsv = [table.columns, ...table.rows].map((r) => table.columns.map((_, i) => r[i] ?? "").join("\t")).join("\n")
    void navigator.clipboard.writeText(tsv).then(
      () => toast.success(tr("Table copied")),
      () => toast.error(tr("Could not copy table")),
    )
  }, [table])

  const downloadCSV = useCallback(() => {
    const esc = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v)
    const csv = "\ufeff" + [table.columns, ...table.rows].map((r) => table.columns.map((_, i) => esc(r[i] ?? "")).join(",")).join("\n")
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
    const link = document.createElement("a")
    link.href = url
    link.download = "table.csv"
    link.click()
    window.setTimeout(() => URL.revokeObjectURL(url), 1000)
    toast.success(tr("Export ready"))
  }, [table])

  return {
    table, widths, aligns, updateTable, setCell, addRow, removeRow, addColumn, removeColumn, setColumn, setAlignment, resizeColumn, copyTable, downloadCSV,
  }
}
