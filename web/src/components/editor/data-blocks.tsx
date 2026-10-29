import { useEffect, useMemo, useRef, useState } from "react"
import { ChartColumn, ChartGantt, Check, Pencil, Plus, Trash2, X } from "lucide-react"
import type { Block, TableData } from "@/lib/types"
import { tr } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const PALETTE = ["#0ea5e9", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#ec4899", "#14b8a6", "#6366f1"]
const GANTT_COLUMNS = ["Task", "Start", "End", "Progress"]

function clamp(value: number, min = 0, max = 100) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min))
}

export function defaultGanttTable(): TableData {
  return {
    columns: [...GANTT_COLUMNS],
    rows: [
      ["Research", "2026-01-05", "2026-01-09", "100"],
      ["Design", "2026-01-12", "2026-01-16", "60"],
      ["Build", "2026-01-19", "2026-02-06", "20"],
      ["Launch", "2026-02-09", "2026-02-10", "0"],
    ],
    header: true,
  }
}

export function defaultChartTable(): TableData {
  return {
    columns: ["Month", "Revenue", "Costs"],
    rows: [
      ["Jan", "12", "8"],
      ["Feb", "18", "9"],
      ["Mar", "15", "10"],
      ["Apr", "24", "12"],
    ],
    header: true,
  }
}

function parseDay(value: string): Date | null {
  const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value.trim())
  if (!match) return null
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])))
  return Number.isNaN(date.getTime()) ? null : date
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 86_400_000)
}

function dayDiff(a: Date, b: Date) {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

function formatDay(date: Date, withYear = false) {
  return date.toLocaleDateString("en-US", {
    month: "short", day: "numeric", ...(withYear ? { year: "numeric" as const } : {}), timeZone: "UTC",
  })
}

function todayInput() {
  return new Date().toISOString().slice(0, 10)
}

interface GanttTask {
  name: string
  start: Date | null
  end: Date | null
  progress: number
}

export function GanttBlock({
  block, readOnly, autoFocus, onUpdate,
}: {
  block: Block
  readOnly: boolean
  autoFocus?: boolean
  onUpdate: (patch: Partial<Block>) => void
}) {
  const table = block.table ?? defaultGanttTable()
  const rows = table.rows.map((row) => [row[0] ?? "", row[1] ?? "", row[2] ?? "", row[3] ?? ""])
  const [editing, setEditing] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const tasks: GanttTask[] = rows.map((row, index) => {
    const start = parseDay(row[1])
    const end = parseDay(row[2]) ?? start
    return { name: row[0] || `${tr("Task")} ${index + 1}`, start, end, progress: clamp(Number(row[3])) }
  })
  const dated = tasks.filter((task) => task.start && task.end)
  const min = dated.length ? new Date(Math.min(...dated.map((task) => task.start!.getTime()))) : null
  const max = dated.length ? new Date(Math.max(...dated.map((task) => task.end!.getTime()))) : null
  const totalDays = min && max ? Math.max(1, dayDiff(min, max) + 1) : 1
  const ticks = Array.from({ length: 6 }, (_, index) => ({
    position: (index / 5) * 100,
    date: min ? addDays(min, Math.round((totalDays * index) / 5)) : null,
  }))

  useEffect(() => {
    if (autoFocus) titleRef.current?.focus()
  }, [autoFocus])

  function save(nextRows: string[][]) {
    onUpdate({ table: { columns: [...GANTT_COLUMNS], rows: nextRows, header: true } })
  }

  function setCell(rowIndex: number, columnIndex: number, value: string) {
    save(rows.map((row, index) => (index === rowIndex ? row.map((cell, cellIndex) => (cellIndex === columnIndex ? value : cell)) : row)))
  }

  function addTask() {
    const start = todayInput()
    const end = addDays(new Date(), 3).toISOString().slice(0, 10)
    save([...rows, [tr("New task"), start, end, "0"]])
  }

  return (
    <div id={`block-input-${block.id}`} data-block-input tabIndex={0} className="my-2 overflow-hidden rounded-xl border border-border/80 bg-card">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <ChartGantt className="size-3.5 text-brand" />
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{tr("Gantt")}</span>
        <button
          type="button"
          onClick={() => setEditing((value) => !value)}
          className="ml-auto flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          {editing ? <Check className="size-3" /> : <Pencil className="size-3" />}
          {editing ? tr("Done") : tr("Edit data")}
        </button>
      </div>

      {editing ? (
        <div className="space-y-3 p-3">
          <input
            ref={titleRef}
            value={block.text}
            readOnly={readOnly}
            onChange={(event) => onUpdate({ text: event.target.value })}
            placeholder={tr("Project timeline")}
            className="h-8 w-full rounded-md border bg-background px-2.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
          />
          <div className="overflow-x-auto thin-scrollbar">
            <table className="w-full min-w-[560px] border-collapse text-xs">
              <thead>
                <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                  {GANTT_COLUMNS.map((column) => <th key={column} className="border-b px-1.5 py-1.5 font-medium">{tr(column)}</th>)}
                  <th className="w-8 border-b" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row, rowIndex) => (
                  <tr key={rowIndex} className="group/gantt-row">
                    <td className="border-b p-1"><input value={row[0]} onChange={(event) => setCell(rowIndex, 0, event.target.value)} className="h-7 w-full rounded border bg-background px-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/25" /></td>
                    <td className="border-b p-1"><input type="date" value={row[1]} onChange={(event) => setCell(rowIndex, 1, event.target.value)} className="h-7 w-full rounded border bg-background px-1 outline-none" /></td>
                    <td className="border-b p-1"><input type="date" value={row[2]} onChange={(event) => setCell(rowIndex, 2, event.target.value)} className="h-7 w-full rounded border bg-background px-1 outline-none" /></td>
                    <td className="border-b p-1"><input type="number" min={0} max={100} value={row[3]} onChange={(event) => setCell(rowIndex, 3, event.target.value)} className="h-7 w-16 rounded border bg-background px-1.5 outline-none" /></td>
                    <td className="border-b p-1 text-center">
                      {rows.length > 1 && <button type="button" onClick={() => save(rows.filter((_, index) => index !== rowIndex))} aria-label={tr("Delete task")} className="rounded p-1 text-muted-foreground opacity-0 transition group-hover/gantt-row:opacity-100 hover:bg-destructive/10 hover:text-destructive"><X className="size-3" /></button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" onClick={addTask} className="flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-accent hover:text-foreground"><Plus className="size-3" /> {tr("Add task")}</button>
          <p className="text-[10px] text-muted-foreground">{tr("Dates use YYYY-MM-DD. Progress is 0–100.")}</p>
        </div>
      ) : (
        <div className="p-3">
          {block.text && <div className="mb-3 text-sm font-medium">{block.text}</div>}
          {!min || !max ? (
            <div className="rounded-lg border border-dashed px-4 py-8 text-center text-xs text-muted-foreground">{tr("Add dated tasks to draw the timeline.")}</div>
          ) : (
            <div className="overflow-x-auto thin-scrollbar">
              <div className="min-w-[560px]">
                <div className="ml-[150px] grid grid-cols-6 border-b pb-1 text-[9px] text-muted-foreground">
                  {ticks.map((tick, index) => <span key={index} className={cn("truncate", index === 5 && "-translate-x-full text-right")}>{tick.date ? formatDay(tick.date, tick.date.getUTCMonth() === 0) : ""}</span>)}
                </div>
                <div className="relative">
                  <div className="pointer-events-none absolute bottom-0 left-[150px] right-0 top-0">
                    {ticks.map((tick, index) => <span key={index} className="absolute bottom-0 top-0 w-px bg-border/60" style={{ left: `${tick.position}%` }} />)}
                  </div>
                  {tasks.map((task, index) => {
                    const valid = task.start && task.end
                    const start = valid ? (task.start!.getTime() <= task.end!.getTime() ? task.start! : task.end!) : null
                    const end = valid ? (task.start!.getTime() <= task.end!.getTime() ? task.end! : task.start!) : null
                    const left = start && min ? (dayDiff(min, start) / totalDays) * 100 : 0
                    const width = start && end ? Math.max(1.2, ((dayDiff(start, end) + 1) / totalDays) * 100) : 100
                    const milestone = start && end && dayDiff(start, end) === 0
                    return (
                      <div key={index} className="group/gantt flex h-9 items-center border-b border-border/30 last:border-0">
                        <div className="w-[150px] shrink-0 truncate pr-3 text-xs" title={task.name}>{task.name}</div>
                        <div className="relative h-full flex-1">
                          {valid ? milestone ? (
                            <span title={`${formatDay(start!, true)}`} className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rotate-45 rounded-[2px]" style={{ left: `${left}%`, backgroundColor: PALETTE[index % PALETTE.length] }} />
                          ) : (
                            <div title={`${formatDay(start!, true)} – ${formatDay(end!, true)} · ${task.progress}%`} className="absolute top-1/2 h-5 -translate-y-1/2 overflow-hidden rounded-md bg-muted/80" style={{ left: `${left}%`, width: `${width}%`, minWidth: 6 }}>
                              <div className="h-full rounded-md opacity-90 transition-all" style={{ width: `${task.progress}%`, backgroundColor: PALETTE[index % PALETTE.length] }} />
                              {width > 14 && <span className="absolute inset-0 flex items-center pl-1.5 text-[9px] font-medium text-white/95 mix-blend-luminosity">{task.progress}%</span>}
                              {!readOnly && (
                                <span onMouseDown={(e) => {
                                  e.preventDefault()
                                  const bar = (e.currentTarget.parentElement as HTMLElement)
                                  const rect = bar.getBoundingClientRect()
                                  const onMove = (ev: MouseEvent) => {
                                    const pct = Math.max(0, Math.min(100, ((ev.clientX - rect.left) / rect.width) * 100))
                                    setCell(index, 3, String(Math.round(pct)))
                                  }
                                  const onUp = () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp) }
                                  window.addEventListener("mousemove", onMove); window.addEventListener("mouseup", onUp)
                                }} className="absolute right-0 top-0 h-full w-2 cursor-col-resize bg-white/30 opacity-0 group-hover/gantt:opacity-100" />
                              )}
                            </div>
                          ) : (
                            <span className="text-[10px] text-amber-600 dark:text-amber-400">{tr("Invalid dates")}</span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

interface ChartSeries {
  name: string
  values: number[]
}

function niceMax(value: number) {
  if (value <= 0) return 1
  const power = 10 ** Math.floor(Math.log10(value))
  const normalized = value / power
  const step = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10
  return step * power
}

function ChartGraph({ type, labels, series }: { type: "bar" | "line" | "pie"; labels: string[]; series: ChartSeries[] }) {
  const width = 640
  const height = 290
  const margin = { left: 44, right: 16, top: 20, bottom: 52 }
  const plotW = width - margin.left - margin.right
  const plotH = height - margin.top - margin.bottom
  const max = niceMax(Math.max(1, ...series.flatMap((item) => item.values)))

  if (labels.length === 0 || series.length === 0) {
    return <div className="rounded-lg border border-dashed px-4 py-10 text-center text-xs text-muted-foreground">{tr("Add data to draw a chart.")}</div>
  }

  if (type === "pie") {
    const values = series[0].values.map((value) => Math.max(0, value))
    const total = values.reduce((sum, value) => sum + value, 0)
    const cx = width / 2
    const cy = height / 2
    const radius = 88
    let angle = -Math.PI / 2
    if (total <= 0) {
      return <div className="rounded-lg border border-dashed px-4 py-10 text-center text-xs text-muted-foreground">{tr("Add positive values to draw a pie chart.")}</div>
    }
    return (
      <div>
        <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={tr("Pie chart")} className="w-full">
          {values.map((value, index) => {
            const slice = (value / total) * Math.PI * 2
            const end = angle + slice
            const large = slice > Math.PI ? 1 : 0
            const x1 = cx + radius * Math.cos(angle)
            const y1 = cy + radius * Math.sin(angle)
            const x2 = cx + radius * Math.cos(end)
            const y2 = cy + radius * Math.sin(end)
            const path = `M ${cx} ${cy} L ${x1} ${y1} A ${radius} ${radius} 0 ${large} 1 ${x2} ${y2} Z`
            angle = end
            return <path key={index} d={path} fill={PALETTE[index % PALETTE.length]} stroke="var(--background)" strokeWidth={2}><title>{`${labels[index]}: ${value}`}</title></path>
          })}
          <circle cx={cx} cy={cy} r={34} fill="var(--background)" />
          <text x={cx} y={cy + 4} textAnchor="middle" className="fill-foreground text-[12px] font-medium">{total}</text>
        </svg>
        <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px]">
          {labels.map((label, index) => <span key={index} className="flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ backgroundColor: PALETTE[index % PALETTE.length] }} />{label || tr("Untitled")} <span className="text-muted-foreground">{Math.round((values[index] / total) * 100)}%</span></span>)}
        </div>
      </div>
    )
  }

  const grid = [0, 0.25, 0.5, 0.75, 1]
  const group = plotW / labels.length
  return (
    <div>
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={type === "line" ? tr("Line chart") : tr("Bar chart")} className="w-full">
        {grid.map((ratio) => {
          const y = margin.top + plotH * (1 - ratio)
          return <g key={ratio}><line x1={margin.left} x2={width - margin.right} y1={y} y2={y} stroke="currentColor" className="text-border" strokeDasharray={ratio === 0 ? undefined : "3 4"} /><text x={margin.left - 7} y={y + 3} textAnchor="end" className="fill-muted-foreground text-[9px]">{Math.round(max * ratio)}</text></g>
        })}
        {type === "bar" ? series.map((item, seriesIndex) => {
          const barW = (group * 0.7) / series.length
          return item.values.map((value, index) => {
            const barH = Math.max(0, (Math.max(0, value) / max) * plotH)
            const x = margin.left + group * index + group * 0.15 + barW * seriesIndex
            return <rect key={`${seriesIndex}-${index}`} x={x} y={margin.top + plotH - barH} width={Math.max(1, barW - 2)} height={barH} rx={2} fill={PALETTE[seriesIndex % PALETTE.length]}><title>{`${item.name} · ${labels[index]}: ${value}`}</title></rect>
          })
        }) : series.map((item, seriesIndex) => {
          const points = item.values.map((value, index) => {
            const x = margin.left + group * index + group / 2
            const y = margin.top + plotH - (Math.max(0, value) / max) * plotH
            return { x, y }
          })
          return <g key={seriesIndex}><polyline points={points.map((point) => `${point.x},${point.y}`).join(" ")} fill="none" stroke={PALETTE[seriesIndex % PALETTE.length]} strokeWidth={2.2} strokeLinejoin="round" strokeLinecap="round" />{points.map((point, index) => <circle key={index} cx={point.x} cy={point.y} r={3} fill={PALETTE[seriesIndex % PALETTE.length]}><title>{`${item.name} · ${labels[index]}: ${item.values[index]}`}</title></circle>)}</g>
        })}
        {labels.map((label, index) => <text key={index} x={margin.left + group * index + group / 2} y={height - 24} textAnchor="middle" className="fill-muted-foreground text-[9px]">{label.length > 10 ? `${label.slice(0, 9)}…` : label}</text>)}
      </svg>
      <div className="flex flex-wrap justify-center gap-x-4 gap-y-1 text-[11px]">
        {series.map((item, index) => <span key={index} className="flex items-center gap-1.5"><span className="size-2 rounded-sm" style={{ backgroundColor: PALETTE[index % PALETTE.length] }} />{item.name}</span>)}
      </div>
    </div>
  )
}

export function ChartBlock({
  block, readOnly, autoFocus, onUpdate,
}: {
  block: Block
  readOnly: boolean
  autoFocus?: boolean
  onUpdate: (patch: Partial<Block>) => void
}) {
  const table = block.table ?? defaultChartTable()
  const rows = table.rows.map((row) => [...row])
  const columns = table.columns.length >= 2 ? table.columns : defaultChartTable().columns
  const [editing, setEditing] = useState(false)
  const titleRef = useRef<HTMLInputElement>(null)
  const type = block.language === "line" || block.language === "pie" ? block.language : "bar"
  const labels = rows.map((row) => row[0] ?? "")
  const series = useMemo<ChartSeries[]>(() => columns.slice(1).map((name, index) => ({
    name: name || `${tr("Series")} ${index + 1}`,
    values: rows.map((row) => Number(row[index + 1]) || 0),
  })), [columns, rows])

  useEffect(() => {
    if (autoFocus) titleRef.current?.focus()
  }, [autoFocus])

  function save(nextRows: string[][], nextColumns = columns, nextType = type) {
    onUpdate({ table: { ...table, columns: nextColumns, rows: nextRows, header: true }, language: nextType })
  }
  function setCell(rowIndex: number, columnIndex: number, value: string) {
    save(rows.map((row, index) => (index === rowIndex ? row.map((cell, cellIndex) => (cellIndex === columnIndex ? value : cell)) : row)))
  }
  function addRow() {
    save([...rows, [tr("New label"), ...columns.slice(1).map(() => "0")]])
  }
  function addSeries() {
    const next = [...columns, `${tr("Series")} ${columns.length}`]
    save(rows.map((row) => [...row, "0"]), next)
  }
  function removeSeries(index: number) {
    if (columns.length <= 2) return
    save(rows.map((row) => row.filter((_, cellIndex) => cellIndex !== index + 1)), columns.filter((_, columnIndex) => columnIndex !== index + 1))
  }

  return (
    <div id={`block-input-${block.id}`} data-block-input tabIndex={0} className="my-2 overflow-hidden rounded-xl border border-border/80 bg-card">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <ChartColumn className="size-3.5 text-brand" />
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{tr("Chart")}</span>
        <select value={type} onChange={(event) => save(rows, columns, event.target.value as typeof type)} disabled={readOnly} className="h-6 rounded border bg-background px-1.5 text-[10px] outline-none">
          <option value="bar">{tr("Bar")}</option>
          <option value="line">{tr("Line")}</option>
          <option value="pie">{tr("Pie")}</option>
        </select>
        <button type="button" onClick={() => setEditing((value) => !value)} className="ml-auto flex items-center gap-1 rounded px-2 py-0.5 text-[10px] text-muted-foreground transition hover:bg-accent hover:text-foreground">
          {editing ? <Check className="size-3" /> : <Pencil className="size-3" />}
          {editing ? tr("Done") : tr("Edit data")}
        </button>
      </div>
      <div className="p-3">
        {block.text && !editing && <div className="mb-2 text-sm font-medium">{block.text}</div>}
        {editing ? (
          <div className="space-y-3">
            <input ref={titleRef} value={block.text} readOnly={readOnly} onChange={(event) => onUpdate({ text: event.target.value })} placeholder={tr("Chart title")} className="h-8 w-full rounded-md border bg-background px-2.5 text-xs font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/25" />
            <div className="overflow-x-auto thin-scrollbar">
              <table className="w-full min-w-[520px] border-collapse text-xs">
                <thead>
                  <tr className="text-left text-[10px] uppercase tracking-wider text-muted-foreground">
                    <th className="border-b px-1.5 py-1.5 font-medium">{tr("Label")}</th>
                    {series.map((item, index) => <th key={index} className="border-b px-1.5 py-1.5 font-medium"><span className="flex items-center gap-1">{item.name}{columns.length > 2 && <button type="button" onClick={() => removeSeries(index)} aria-label={tr("Remove series")} className="text-muted-foreground/60 hover:text-destructive"><X className="size-3" /></button>}</span></th>)}
                    <th className="w-8 border-b" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="group/chart-row">
                      <td className="border-b p-1"><input value={row[0] ?? ""} onChange={(event) => setCell(rowIndex, 0, event.target.value)} className="h-7 w-full rounded border bg-background px-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/25" /></td>
                      {series.map((_, seriesIndex) => <td key={seriesIndex} className="border-b p-1"><input type="number" value={row[seriesIndex + 1] ?? ""} onChange={(event) => setCell(rowIndex, seriesIndex + 1, event.target.value)} className="h-7 w-20 rounded border bg-background px-1.5 outline-none focus-visible:ring-2 focus-visible:ring-ring/25" /></td>)}
                      <td className="border-b p-1 text-center"><button type="button" onClick={() => save(rows.filter((_, index) => index !== rowIndex))} aria-label={tr("Delete row")} className="rounded p-1 text-muted-foreground opacity-0 transition group-hover/chart-row:opacity-100 hover:bg-destructive/10 hover:text-destructive"><X className="size-3" /></button></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" onClick={addRow} className="flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-accent hover:text-foreground"><Plus className="size-3" /> {tr("Add row")}</button>
              <button type="button" onClick={addSeries} className="flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-accent hover:text-foreground"><Plus className="size-3" /> {tr("Add series")}</button>
            </div>
            {type === "pie" && <p className="text-[10px] text-muted-foreground">{tr("Pie charts use the first series.")}</p>}
          </div>
        ) : (
          <div onClick={() => {
            if (readOnly) return
            const label = window.prompt(tr("Enter label to edit (exact)"))
            if (!label) return
            const idx = labels.findIndex((l) => l === label)
            if (idx < 0) { toast.error(tr("Label not found")); return }
            const val = window.prompt(tr("Enter new value for {label}", { label }), String(series[0]?.values[idx] ?? ""))
            if (val === null) return
            const num = Number(val)
            if (Number.isNaN(num)) { toast.error(tr("Enter a valid number")); return }
            setCell(idx, 1, String(num))
          }} className={readOnly ? "" : "cursor-pointer"}>
            <ChartGraph type={type} labels={labels} series={series} />
            {!readOnly && <div className="mt-1 text-center text-[10px] text-muted-foreground">{tr("Click chart to edit a value")}</div>}
          </div>
        )}
      </div>
    </div>
  )
}
