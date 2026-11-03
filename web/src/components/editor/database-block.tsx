import { useEffect, useMemo, useState } from "react"
import { Kanban, Table2, Filter, ArrowUpDown, Plus, Trash2, Settings2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { tr } from "@/lib/i18n"
import { uid } from "@/lib/utils"
import { api } from "@/lib/api"
import type { Block, DatabaseColumn, DatabaseData, WorkspaceDatabase } from "@/lib/types"

type RollupFunction = NonNullable<DatabaseColumn["rollup"]>["function"]

const ROLLUP_LABELS: { value: RollupFunction; label: string }[] = [
  { value: "count", label: "Count" },
  { value: "sum", label: "Sum" },
  { value: "avg", label: "Average" },
  { value: "min", label: "Minimum" },
  { value: "max", label: "Maximum" },
  { value: "lookup", label: "Lookup" },
]

function rowLabel(database: WorkspaceDatabase | undefined, row: Record<string, string>, rowId: string) {
  if (!database) return rowId
  const column = database.columns.find((item) => item.type === "text" || item.type === "select" || item.type === "status") ?? database.columns[0]
  return (column ? row[column.id] : "") || Object.values(row).find(Boolean) || rowId
}

export function DatabaseBlock({
  block,
  workspaceId = "",
  readOnly,
  onUpdate,
}: {
  block: Block
  workspaceId?: string
  readOnly: boolean
  onUpdate: (patch: Partial<Block>) => void
}) {
  const db: DatabaseData = block.database ?? {
    columns: [
      { id: "c1", name: "Name", type: "text", width: 200 },
      { id: "c2", name: "Status", type: "status", options: ["Todo", "Doing", "Done"] },
      { id: "c3", name: "Due", type: "date" },
    ],
    rows: [{ c1: "First task", c2: "Todo", c3: "" }],
    rowIds: [uid()],
    viewMode: "table",
  }
  const [filter, setFilter] = useState("")
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [viewMode, setViewMode] = useState<"table" | "board">(db.viewMode ?? "table")
  const [groupBy, setGroupBy] = useState(db.groupBy ?? db.columns.find((c) => c.type === "status" || c.type === "select")?.id ?? "")
  const [databases, setDatabases] = useState<WorkspaceDatabase[]>([])

  const rowIds = useMemo(() => db.rows.map((_, index) => db.rowIds?.[index] || `row-${index}`), [db.rowIds, db.rows])

  useEffect(() => {
    if (!workspaceId) return
    void api.databases.list(workspaceId).then(setDatabases).catch(() => undefined)
  }, [workspaceId])

  useEffect(() => {
    if (readOnly) return
    if (db.rowIds?.length === db.rows.length && db.rows.every((_, index) => db.rowIds?.[index])) return
    commit({ rowIds: db.rows.map((_, index) => db.rowIds?.[index] || uid()) })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [db.rowIds, db.rows.length, readOnly])

  const filtered = useMemo(() => {
    let rows = db.rows
    if (filter.trim()) {
      const query = filter.toLowerCase()
      rows = rows.filter((row) => Object.values(row).some((value) => (value ?? "").toLowerCase().includes(query)))
    }
    if (sortCol) {
      rows = [...rows].sort((a, b) => {
        const av = a[sortCol] ?? ""
        const bv = b[sortCol] ?? ""
        const cmp = av.localeCompare(bv, undefined, { numeric: true })
        return sortDir === "asc" ? cmp : -cmp
      })
    }
    return rows
  }, [db.rows, filter, sortCol, sortDir])

  function commit(patch: Partial<DatabaseData>) {
    onUpdate({ database: { ...db, ...patch } })
  }

  function setCell(rowIndex: number, colId: string, value: string) {
    const rows = filtered
    const origIndex = db.rows.indexOf(rows[rowIndex])
    const next = db.rows.map((row, index) => (index === origIndex ? { ...row, [colId]: value } : row))
    commit({ rows: next })
  }

  function addRow() {
    commit({ rows: [...db.rows, {}], rowIds: [...rowIds, uid()] })
  }

  function removeRow(row: Record<string, string>) {
    const index = db.rows.indexOf(row)
    if (index < 0) return
    commit({
      rows: db.rows.filter((_, i) => i !== index),
      rowIds: rowIds.filter((_, i) => i !== index),
    })
  }

  function addColumn() {
    const id = uid()
    commit({ columns: [...db.columns, { id, name: `${tr("Field")} ${db.columns.length + 1}`, type: "text" }] })
  }

  function removeColumn(colId: string) {
    commit({ columns: db.columns.filter((column) => column.id !== colId), rows: db.rows.map((row) => { const { [colId]: _, ...rest } = row; return rest }) })
  }

  function updateColumn(colId: string, patch: Partial<DatabaseColumn>) {
    commit({ columns: db.columns.map((column) => (column.id === colId ? { ...column, ...patch } : column)) })
  }

  function targetDatabase(column?: DatabaseColumn) {
    const blockId = column?.relation?.databaseBlockId
    return blockId ? databases.find((database) => database.blockId === blockId) : undefined
  }

  function relationLabel(column: DatabaseColumn, value: string) {
    const database = targetDatabase(column)
    if (!database || !value) return value
    const index = database.rowIds.indexOf(value)
    return index >= 0 ? rowLabel(database, database.rows[index], value) : value
  }

  function rollupValue(column: DatabaseColumn, row: Record<string, string>): string {
    const config = column.rollup
    if (!config) return ""
    const relationColumn = db.columns.find((item) => item.id === config.relationColumnId)
    const database = targetDatabase(relationColumn)
    if (!database) return ""
    const ids = String(row[relationColumn?.id ?? ""] ?? "").split(",").filter(Boolean)
    const related = ids.map((id) => {
      const index = database.rowIds.indexOf(id)
      return index >= 0 ? database.rows[index] : undefined
    }).filter(Boolean) as Record<string, string>[]
    if (config.function === "count") return String(related.length)
    const values = related.map((item) => item[config.targetColumnId] ?? "").filter(Boolean)
    if (config.function === "lookup") return values[0] ?? ""
    const numbers = values.map(Number).filter((value) => Number.isFinite(value))
    if (numbers.length === 0) return ""
    if (config.function === "sum") return String(numbers.reduce((sum, value) => sum + value, 0))
    if (config.function === "avg") return String(numbers.reduce((sum, value) => sum + value, 0) / numbers.length)
    if (config.function === "min") return String(Math.min(...numbers))
    return String(Math.max(...numbers))
  }

  function cellValue(column: DatabaseColumn, row: Record<string, string>) {
    if (column.type === "rollup") return rollupValue(column, row)
    if (column.type === "relation") return relationLabel(column, row[column.id] ?? "")
    return row[column.id] ?? ""
  }

  if (viewMode === "board") {
    const groupCol = db.columns.find((c) => c.id === groupBy) ?? db.columns[0]
    const groupId = groupCol?.id ?? ""
    const groups = new Map<string, typeof filtered>()
    const explicit = groupCol?.options?.length ? groupCol.options : []
    const actual = Array.from(new Set(filtered.map((row) => row[groupId] ?? "").filter(Boolean)))
    const groupKeys = Array.from(new Set([...explicit, ...actual]))
    for (const key of groupKeys) groups.set(key, [])
    if (groupKeys.length === 0) groups.set(tr("No status"), [])
    for (const row of filtered) {
      const key = row[groupId] || groupKeys[0] || tr("No status")
      groups.set(key, [...(groups.get(key) ?? []), row])
    }
    return (
      <div className="my-2 overflow-hidden rounded-xl border border-border/80 bg-card">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 px-2.5 py-1.5 text-[10px]">
          <span className="flex items-center gap-1 font-medium text-muted-foreground"><Kanban className="size-3" /> {tr("Database")} — {tr("Board")}</span>
          <div className="ml-auto flex items-center gap-1">
            <select value={groupBy} onChange={(event) => { setGroupBy(event.target.value); commit({ groupBy: event.target.value }) }} className="h-6 rounded border bg-background px-1 text-[11px]">
              {db.columns.filter((column) => column.type === "select" || column.type === "status").map((column) => <option key={column.id} value={column.id}>{column.name}</option>)}
            </select>
            <button type="button" onClick={() => { setViewMode("table"); commit({ viewMode: "table" }) }} className="rounded bg-accent px-2 py-1 text-[11px]">{tr("Table")}</button>
            <button type="button" onClick={() => { setViewMode("board"); commit({ viewMode: "board" }) }} className="rounded bg-brand px-2 py-1 text-[11px] text-white">{tr("Board")}</button>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto p-2">
          {Array.from(groups.entries()).map(([key, items]) => (
            <div key={key} className="w-[260px] shrink-0 rounded-lg border bg-muted/20 p-2">
              <div className="mb-2 flex items-center justify-between text-xs font-medium"><span>{key}</span><span className="rounded bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">{items.length}</span></div>
              <div className="space-y-1.5">
                {items.map((row) => (
                  <div key={rowIds[db.rows.indexOf(row)]} className="rounded-md border bg-card p-2 text-xs shadow-sm">
                    {db.columns.slice(0, 3).map((column) => (
                      <div key={column.id} className="truncate"><span className="text-[11px] text-muted-foreground">{column.name}: </span><span className="font-medium">{cellValue(column, row) || "—"}</span></div>
                    ))}
                  </div>
                ))}
                {!readOnly && <button type="button" onClick={addRow} className="flex w-full items-center justify-center gap-1 rounded border border-dashed py-1.5 text-xs text-muted-foreground hover:bg-accent"><Plus className="size-3" /> {tr("Add")}</button>}
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-border/80 bg-card">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 px-2.5 py-1.5 text-[10px]">
        <span className="flex items-center gap-1 font-medium text-muted-foreground"><Table2 className="size-3" /> {tr("Database")}</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">{tr("{n} rows", { n: filtered.length })}</span>
        <button
          type="button"
          title={tr("Download CSV")}
          onClick={() => {
            const esc = (value: string) => (/[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value)
            const csv = "\ufeff" + [db.columns.map((column) => column.name), ...filtered.map((row) => db.columns.map((column) => cellValue(column, row)))].map((row) => row.map(esc).join(",")).join("\n")
            const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }))
            const link = document.createElement("a")
            link.href = url
            link.download = "database.csv"
            link.click()
            window.setTimeout(() => URL.revokeObjectURL(url), 1000)
          }}
          className="rounded px-2 py-1 hover:bg-accent"
        >
          CSV
        </button>
        <div className="ml-auto flex items-center gap-1">
          <div className="flex items-center gap-1 rounded border bg-background px-1.5 py-0.5">
            <Filter className="size-3 text-muted-foreground" />
            <input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder={tr("Filter...")} className="h-5 w-24 bg-transparent text-[11px] outline-none" />
          </div>
          <button type="button" onClick={() => { setViewMode("board"); commit({ viewMode: "board" }) }} className="rounded px-2 py-1 hover:bg-accent">{tr("Board")}</button>
          {!readOnly && <button type="button" onClick={addRow} className="rounded px-2 py-1 hover:bg-accent"><Plus className="size-3" /></button>}
          {!readOnly && <button type="button" onClick={addColumn} className="rounded px-2 py-1 hover:bg-accent"><Settings2 className="size-3" /></button>}
        </div>
      </div>
      <div className="overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-muted/40 text-xs">
            <tr>
              {db.columns.map((column) => {
                const relation = targetDatabase(column)
                const rollupRelation = db.columns.find((item) => item.id === column.rollup?.relationColumnId)
                const rollupTarget = targetDatabase(rollupRelation)
                return (
                  <th key={column.id} className="border-b border-r border-border/60 p-0 text-left last:border-r-0" style={{ minWidth: column.width ?? 160 }}>
                    <div className="flex items-center gap-1 px-2 py-1">
                      {!readOnly ? (
                        <input value={column.name} onChange={(event) => updateColumn(column.id, { name: event.target.value })} className="min-w-0 flex-1 bg-transparent text-xs font-semibold outline-none" />
                      ) : (
                        <span className="truncate text-xs font-semibold">{column.name}</span>
                      )}
                      <span className="rounded bg-brand-soft px-1 py-0.5 text-[10px] text-brand">{column.type}</span>
                      <button type="button" onClick={() => { setSortCol(column.id); setSortDir((direction) => (sortCol === column.id && direction === "asc" ? "desc" : "asc")) }} className="rounded p-0.5 hover:bg-accent"><ArrowUpDown className="size-3" /></button>
                      {!readOnly && db.columns.length > 1 && <button type="button" onClick={() => removeColumn(column.id)} className="rounded p-0.5 hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-3" /></button>}
                    </div>
                    {!readOnly && (
                      <select value={column.type} onChange={(event) => updateColumn(column.id, { type: event.target.value as DatabaseColumn["type"] })} className="mx-2 mb-1 h-6 w-[calc(100%-16px)] rounded border bg-background text-[11px]">
                        <option value="text">text</option><option value="select">select</option><option value="status">status</option><option value="person">person</option><option value="date">date</option><option value="number">number</option><option value="relation">relation</option><option value="rollup">rollup</option>
                      </select>
                    )}
                    {!readOnly && column.type === "relation" && (
                      <select
                        value={column.relation?.databaseBlockId ?? ""}
                        onChange={(event) => {
                          const database = databases.find((item) => item.blockId === event.target.value)
                          updateColumn(column.id, { relation: database ? { pageId: database.pageId, databaseBlockId: database.blockId } : undefined })
                        }}
                        className="mx-2 mb-1 h-6 w-[calc(100%-16px)] rounded border bg-background text-[11px]"
                      >
                        <option value="">{tr("Select database")}</option>
                        {databases.map((database) => <option key={database.blockId} value={database.blockId}>{database.pageTitle || tr("Untitled")} · {database.columns[0]?.name ?? ""}</option>)}
                      </select>
                    )}
                    {!readOnly && column.type === "rollup" && (
                      <div className="mx-2 mb-1 space-y-1">
                        <select
                          value={column.rollup?.relationColumnId ?? ""}
                          onChange={(event) => updateColumn(column.id, { rollup: { ...(column.rollup ?? { targetColumnId: "", function: "count" }), relationColumnId: event.target.value } })}
                          className="h-6 w-full rounded border bg-background text-[11px]"
                        >
                          <option value="">{tr("Relation column")}</option>
                          {db.columns.filter((item) => item.type === "relation").map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </select>
                        <select
                          value={column.rollup?.targetColumnId ?? ""}
                          onChange={(event) => updateColumn(column.id, { rollup: { ...(column.rollup ?? { relationColumnId: "", function: "count" }), targetColumnId: event.target.value } })}
                          className="h-6 w-full rounded border bg-background text-[11px]"
                        >
                          <option value="">{tr("Target field")}</option>
                          {(rollupTarget?.columns ?? []).map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                        </select>
                        <select
                          value={column.rollup?.function ?? "count"}
                          onChange={(event) => updateColumn(column.id, { rollup: { ...(column.rollup ?? { relationColumnId: "", targetColumnId: "" }), function: event.target.value as RollupFunction } })}
                          className="h-6 w-full rounded border bg-background text-[11px]"
                        >
                          {ROLLUP_LABELS.map((item) => <option key={item.value} value={item.value}>{tr(item.label)}</option>)}
                        </select>
                      </div>
                    )}
                    {relation && <span className="mx-2 mb-1 block truncate text-[10px] text-muted-foreground">{relation.pageTitle}</span>}
                  </th>
                )
              })}
              <th className="w-8 border-b border-border/60" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, rowIndex) => (
              <tr key={rowIds[db.rows.indexOf(row)] ?? rowIndex} className="hover:bg-brand-soft/10">
                {db.columns.map((column) => (
                  <td key={column.id} className="border-b border-r border-border/60 p-0 last:border-r-0">
                    {column.type === "rollup" ? (
                      <div className="px-2 py-1 text-xs text-muted-foreground">{rollupValue(column, row) || "—"}</div>
                    ) : column.type === "relation" ? (
                      readOnly ? (
                        <div className="px-2 py-1 text-xs">{relationLabel(column, row[column.id] ?? "") || "—"}</div>
                      ) : (
                        <select value={row[column.id] ?? ""} onChange={(event) => setCell(rowIndex, column.id, event.target.value)} className="h-8 w-full bg-transparent px-2 text-xs outline-none">
                          <option value="">—</option>
                          {(targetDatabase(column)?.rows ?? []).map((targetRow, index) => {
                            const database = targetDatabase(column)!
                            const id = database.rowIds[index]
                            return <option key={id} value={id}>{rowLabel(database, targetRow, id)}</option>
                          })}
                        </select>
                      )
                    ) : column.type === "select" || column.type === "status" ? (
                      <select value={row[column.id] ?? ""} disabled={readOnly} onChange={(event) => setCell(rowIndex, column.id, event.target.value)} className={cn("h-8 w-full bg-transparent px-2 text-xs outline-none", column.type === "status" && "font-medium")}>
                        <option value="">—</option>{(column.options ?? []).map((option) => <option key={option} value={option}>{option}</option>)}
                      </select>
                    ) : column.type === "date" ? (
                      <input type="date" value={row[column.id] ?? ""} readOnly={readOnly} onChange={(event) => setCell(rowIndex, column.id, event.target.value)} className="h-8 w-full bg-transparent px-2 text-xs outline-none" />
                    ) : column.type === "number" ? (
                      <input type="number" value={row[column.id] ?? ""} readOnly={readOnly} onChange={(event) => setCell(rowIndex, column.id, event.target.value)} className="h-8 w-full bg-transparent px-2 text-xs outline-none" />
                    ) : (
                      <input value={row[column.id] ?? ""} readOnly={readOnly} onChange={(event) => setCell(rowIndex, column.id, event.target.value)} placeholder=" " className="h-8 w-full bg-transparent px-2 text-xs outline-none" />
                    )}
                  </td>
                ))}
                <td className="border-b border-border/60 text-center">
                  {!readOnly && <button type="button" onClick={() => removeRow(row)} className="rounded p-1 hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-3" /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && <div className="border-t border-border/60 p-1.5"><button type="button" onClick={addRow} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent"><Plus className="size-3" /> {tr("Add row")}</button></div>}
    </div>
  )
}
