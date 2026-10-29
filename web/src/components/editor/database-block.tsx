import { useMemo, useState } from "react"
import { Kanban, Table2, Filter, ArrowUpDown, Plus, Trash2, Settings2 } from "lucide-react"
import { cn } from "@/lib/utils"
import { tr } from "@/lib/i18n"
import { uid } from "@/lib/utils"
import type { Block, DatabaseData, DatabaseColumn } from "@/lib/types"

export function DatabaseBlock({
  block,
  readOnly,
  onUpdate,
}: {
  block: Block
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
    viewMode: "table",
  }
  const [filter, setFilter] = useState("")
  const [sortCol, setSortCol] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc")
  const [viewMode, setViewMode] = useState<"table" | "board">(db.viewMode ?? "table")
  const [groupBy, setGroupBy] = useState(db.groupBy ?? db.columns.find((c) => c.type === "status" || c.type === "select")?.id ?? "")

  const filtered = useMemo(() => {
    let rows = db.rows
    if (filter.trim()) {
      const q = filter.toLowerCase()
      rows = rows.filter((r) => Object.values(r).some((v) => v.toLowerCase().includes(q)))
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
    // map back to original index
    const origIndex = db.rows.indexOf(rows[rowIndex] as any)
    const next = db.rows.map((r, i) => (i === origIndex ? { ...r, [colId]: value } : r))
    commit({ rows: next })
  }

  function addRow() {
    commit({ rows: [...db.rows, {}] })
  }

  function addColumn() {
    const id = uid()
    commit({ columns: [...db.columns, { id, name: `Field ${db.columns.length + 1}`, type: "text" }] })
  }

  function removeColumn(colId: string) {
    commit({ columns: db.columns.filter((c) => c.id !== colId), rows: db.rows.map((r) => { const { [colId]: _, ...rest } = r; return rest }) })
  }

  function updateColumn(colId: string, patch: Partial<DatabaseColumn>) {
    commit({ columns: db.columns.map((c) => (c.id === colId ? { ...c, ...patch } : c)) })
  }

  if (viewMode === "board") {
    const groupCol = db.columns.find((c) => c.id === groupBy) ?? db.columns[1]
    const groups = new Map<string, typeof filtered>()
    const opts = groupCol?.options?.length ? groupCol.options : Array.from(new Set(filtered.map((r) => r[groupCol.id] || "No status")))
    for (const o of opts) groups.set(o, [])
    if (!opts.length) groups.set("All", filtered)
    else for (const r of filtered) groups.set(r[groupCol.id] || opts[0], [...(groups.get(r[groupCol.id] || opts[0]) ?? []), r])
    return (
      <div className="my-2 overflow-hidden rounded-xl border border-border/80 bg-card">
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 px-2.5 py-1.5 text-[10px]">
          <span className="flex items-center gap-1 font-medium text-muted-foreground"><Kanban className="size-3" /> Database — Board</span>
          <div className="ml-auto flex items-center gap-1">
            <select value={groupBy} onChange={(e) => { setGroupBy(e.target.value); commit({ groupBy: e.target.value }) }} className="h-6 rounded border bg-background px-1 text-[11px]">
              {db.columns.filter((c) => c.type === "select" || c.type === "status").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
            <button type="button" onClick={() => { setViewMode("table"); commit({ viewMode: "table" }) }} className="rounded bg-accent px-2 py-1 text-[11px]">Table</button>
            <button type="button" onClick={() => { setViewMode("board"); commit({ viewMode: "board" }) }} className="rounded bg-brand px-2 py-1 text-[11px] text-white">Board</button>
          </div>
        </div>
        <div className="flex gap-2 overflow-x-auto p-2">
          {Array.from(groups.entries()).map(([key, items]) => (
            <div key={key} className="w-[260px] shrink-0 rounded-lg border bg-muted/20 p-2">
              <div className="mb-2 flex items-center justify-between text-xs font-medium"><span>{key}</span><span className="rounded bg-background px-1.5 py-0.5 text-[11px] text-muted-foreground">{items.length}</span></div>
              <div className="space-y-1.5">
                {items.map((row, idx) => (
                  <div key={idx} className="rounded-md border bg-card p-2 text-xs shadow-sm">
                    {db.columns.slice(0, 3).map((col) => (
                      <div key={col.id} className="truncate"><span className="text-[11px] text-muted-foreground">{col.name}: </span><span className="font-medium">{row[col.id] || "—"}</span></div>
                    ))}
                  </div>
                ))}
                {!readOnly && <button type="button" onClick={addRow} className="flex w-full items-center justify-center gap-1 rounded border border-dashed py-1.5 text-xs text-muted-foreground hover:bg-accent"><Plus className="size-3" /> Add</button>}
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
        <span className="flex items-center gap-1 font-medium text-muted-foreground"><Table2 className="size-3" /> Database</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{filtered.length} rows</span>
        <div className="ml-auto flex items-center gap-1">
          <div className="flex items-center gap-1 rounded border bg-background px-1.5 py-0.5">
            <Filter className="size-3 text-muted-foreground" />
            <input value={filter} onChange={(e) => setFilter(e.target.value)} placeholder={tr("Filter...")} className="h-5 w-24 bg-transparent text-[11px] outline-none" />
          </div>
          <button type="button" onClick={() => { setViewMode("board"); commit({ viewMode: "board" }) }} className="rounded px-2 py-1 hover:bg-accent">Board</button>
          {!readOnly && <button type="button" onClick={addRow} className="rounded px-2 py-1 hover:bg-accent"><Plus className="size-3" /></button>}
          {!readOnly && <button type="button" onClick={addColumn} className="rounded px-2 py-1 hover:bg-accent"><Settings2 className="size-3" /></button>}
        </div>
      </div>
      <div className="overflow-auto">
        <table className="w-full border-collapse text-sm">
          <thead className="sticky top-0 bg-muted/40 text-xs">
            <tr>
              {db.columns.map((col) => (
                <th key={col.id} className="border-b border-r border-border/60 p-0 text-left last:border-r-0" style={{ minWidth: col.width ?? 160 }}>
                  <div className="flex items-center gap-1 px-2 py-1">
                    {!readOnly ? (
                      <input value={col.name} onChange={(e) => updateColumn(col.id, { name: e.target.value })} className="min-w-0 flex-1 bg-transparent text-xs font-semibold outline-none" />
                    ) : (
                      <span className="truncate text-xs font-semibold">{col.name}</span>
                    )}
                    <span className="rounded bg-brand-soft px-1 py-0.5 text-[10px] text-brand">{col.type}</span>
                    <button type="button" onClick={() => { setSortCol(col.id); setSortDir((d) => (sortCol === col.id && d === "asc" ? "desc" : "asc")) }} className="rounded p-0.5 hover:bg-accent"><ArrowUpDown className="size-3" /></button>
                    {!readOnly && db.columns.length > 1 && <button type="button" onClick={() => removeColumn(col.id)} className="rounded p-0.5 hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-3" /></button>}
                  </div>
                  {!readOnly && (
                    <select value={col.type} onChange={(e) => updateColumn(col.id, { type: e.target.value as DatabaseColumn["type"] })} className="mx-2 mb-1 h-6 w-[calc(100%-16px)] rounded border bg-background text-[11px]">
                      <option value="text">text</option><option value="select">select</option><option value="status">status</option><option value="person">person</option><option value="date">date</option><option value="number">number</option>
                    </select>
                  )}
                </th>
              ))}
              <th className="w-8 border-b border-border/60" />
            </tr>
          </thead>
          <tbody>
            {filtered.map((row, rIdx) => (
              <tr key={rIdx} className="hover:bg-brand-soft/10">
                {db.columns.map((col) => (
                  <td key={col.id} className="border-b border-r border-border/60 p-0 last:border-r-0">
                    {col.type === "select" || col.type === "status" ? (
                      <select value={row[col.id] ?? ""} disabled={readOnly} onChange={(e) => setCell(rIdx, col.id, e.target.value)} className={cn("h-8 w-full bg-transparent px-2 text-xs outline-none", col.type==="status" && "font-medium")}>
                        <option value="">—</option>{(col.options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
                      </select>
                    ) : col.type === "date" ? (
                      <input type="date" value={row[col.id] ?? ""} readOnly={readOnly} onChange={(e) => setCell(rIdx, col.id, e.target.value)} className="h-8 w-full bg-transparent px-2 text-xs outline-none" />
                    ) : col.type === "number" ? (
                      <input type="number" value={row[col.id] ?? ""} readOnly={readOnly} onChange={(e) => setCell(rIdx, col.id, e.target.value)} className="h-8 w-full bg-transparent px-2 text-xs outline-none" />
                    ) : (
                      <input value={row[col.id] ?? ""} readOnly={readOnly} onChange={(e) => setCell(rIdx, col.id, e.target.value)} placeholder=" " className="h-8 w-full bg-transparent px-2 text-xs outline-none" />
                    )}
                  </td>
                ))}
                <td className="border-b border-border/60 text-center">
                  {!readOnly && <button type="button" onClick={() => { const orig = db.rows.indexOf(row as any); commit({ rows: db.rows.filter((_, i) => i !== orig) }) }} className="rounded p-1 hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-3" /></button>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {!readOnly && <div className="border-t border-border/60 p-1.5"><button type="button" onClick={addRow} className="flex items-center gap-1 rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent"><Plus className="size-3" /> Add row</button></div>}
    </div>
  )
}
