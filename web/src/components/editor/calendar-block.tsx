import { useMemo, useState } from "react"
import { CalendarDays, ChevronLeft, ChevronRight, List, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { tr } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import type { Block, TableData } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

const COLUMNS = ["Event", "Start", "End", "Color"]
const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]
const COLORS = [
  { value: "blue", dot: "bg-sky-500", chip: "border-sky-500/30 bg-sky-500/15 text-sky-800 dark:text-sky-200", swatch: "bg-sky-500" },
  { value: "violet", dot: "bg-violet-500", chip: "border-violet-500/30 bg-violet-500/15 text-violet-800 dark:text-violet-200", swatch: "bg-violet-500" },
  { value: "emerald", dot: "bg-emerald-500", chip: "border-emerald-500/30 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200", swatch: "bg-emerald-500" },
  { value: "amber", dot: "bg-amber-500", chip: "border-amber-500/30 bg-amber-500/15 text-amber-800 dark:text-amber-200", swatch: "bg-amber-500" },
  { value: "rose", dot: "bg-rose-500", chip: "border-rose-500/30 bg-rose-500/15 text-rose-800 dark:text-rose-200", swatch: "bg-rose-500" },
  { value: "slate", dot: "bg-slate-500", chip: "border-slate-500/30 bg-slate-500/15 text-slate-700 dark:text-slate-200", swatch: "bg-slate-500" },
]
const DEFAULT_COLOR = "blue"

export function defaultCalendarTable(): TableData {
  return {
    columns: [...COLUMNS],
    rows: [],
    header: true,
  }
}

function parseDay(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim())
  if (!match) return null
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]))
  return Number.isNaN(date.getTime()) ? null : date
}

function dayKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + days)
  return next
}

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

function addMonths(date: Date, months: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + months, 1)
}

function dateLabel(value: string, fallback = ""): string {
  const date = parseDay(value)
  if (!date) return fallback
  return date.toLocaleDateString(undefined, { month: "short", day: "numeric" })
}

function colorOf(value: string) {
  return COLORS.find((color) => color.value === value) ?? COLORS[0]
}

type EventDraft = { index: number; title: string; start: string; end: string; color: string }

export function CalendarBlock({
  block,
  readOnly,
  onUpdate,
}: {
  block: Block
  readOnly: boolean
  onUpdate: (patch: Partial<Block>) => void
}) {
  const table = block.table ?? defaultCalendarTable()
  const rows = useMemo(() => table.rows.map((row) => [row[0] ?? "", row[1] ?? "", row[2] || row[1] || "", row[3] || DEFAULT_COLOR]), [table.rows])
  const [cursor, setCursor] = useState(() => startOfMonth(new Date()))
  const [view, setView] = useState<"month" | "list">(block.language === "list" ? "list" : "month")
  const [draft, setDraft] = useState<EventDraft | null>(null)

  const events = useMemo(() => rows
    .map((row, index) => ({ index, title: row[0].trim(), start: row[1], end: row[2] || row[1], color: row[3] || DEFAULT_COLOR }))
    .filter((event) => event.title && parseDay(event.start))
    .sort((a, b) => a.start.localeCompare(b.start)), [rows])

  const today = new Date()
  const todayKey = dayKey(today)
  const first = startOfMonth(cursor)
  const offset = (first.getDay() + 6) % 7
  const days = Array.from({ length: 42 }, (_, index) => addDays(first, index - offset))
  const monthTitle = cursor.toLocaleDateString(undefined, { month: "long", year: "numeric" })
  const weekdays = useMemo(
    () => WEEKDAYS.map((_, index) => new Date(2024, 0, 1 + index).toLocaleDateString(undefined, { weekday: "short" })),
    [],
  )

  function saveRows(next: string[][]) {
    const normalized = next.map((row) => {
      const values = [row[0] ?? "", row[1] ?? "", row[2] ?? "", row[3] || DEFAULT_COLOR]
      return values
    })
    onUpdate({ table: { columns: [...COLUMNS], rows: normalized, header: true } })
  }

  function openNew(date = todayKey) {
    if (readOnly) return
    setDraft({ index: -1, title: "", start: date, end: date, color: DEFAULT_COLOR })
  }

  function openEdit(index: number) {
    if (readOnly) return
    const row = rows[index]
    if (!row) return
    setDraft({ index, title: row[0], start: row[1], end: row[2] || row[1], color: row[3] || DEFAULT_COLOR })
  }

  function commitDraft() {
    if (!draft || readOnly) return
    const title = draft.title.trim()
    if (!title) {
      toast.error(tr("Event title is required"))
      return
    }
    const start = draft.start || todayKey
    const end = draft.end || start
    if (end < start) {
      toast.error(tr("End date cannot be before start date"))
      return
    }
    const next = [...rows]
    const row = [title, start, end, draft.color || DEFAULT_COLOR]
    if (draft.index >= 0) next[draft.index] = row
    else next.push(row)
    saveRows(next)
    setDraft(null)
  }

  function removeDraft() {
    if (!draft || draft.index < 0) return
    saveRows(rows.filter((_, index) => index !== draft.index))
    setDraft(null)
  }

  function changeView(next: "month" | "list") {
    setView(next)
    if (!readOnly) onUpdate({ language: next })
  }

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-border/80 bg-card">
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 px-2.5 py-1.5 text-[10px]">
        <span className="flex items-center gap-1 font-medium text-muted-foreground"><CalendarDays className="size-3" /> {tr("Calendar")}</span>
        <span className="rounded bg-muted px-1.5 py-0.5 text-[11px] tabular-nums text-muted-foreground">{tr("{n} event(s)", { n: events.length })}</span>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => setCursor(addMonths(cursor, -1))} aria-label={tr("Previous month")} className="flex size-6 items-center justify-center rounded hover:bg-accent"><ChevronLeft className="size-3.5" /></button>
          <button type="button" onClick={() => setCursor(startOfMonth(new Date()))} className="rounded px-2 py-1 text-[11px] hover:bg-accent">{tr("Today")}</button>
          <button type="button" onClick={() => setCursor(addMonths(cursor, 1))} aria-label={tr("Next month")} className="flex size-6 items-center justify-center rounded hover:bg-accent"><ChevronRight className="size-3.5" /></button>
          <div className="ml-1 flex rounded-md border bg-background p-0.5">
            <button type="button" onClick={() => changeView("month")} aria-pressed={view === "month"} className={cn("rounded px-1.5 py-0.5 text-[11px]", view === "month" && "bg-accent font-medium")}>{tr("Month")}</button>
            <button type="button" onClick={() => changeView("list")} aria-pressed={view === "list"} className={cn("rounded px-1.5 py-0.5 text-[11px]", view === "list" && "bg-accent font-medium")}>{tr("List")}</button>
          </div>
          {!readOnly && <Button type="button" size="sm" variant="ghost" className="h-6 gap-1 px-1.5 text-[11px]" onClick={() => openNew()}><Plus className="size-3" /> {tr("Event")}</Button>}
        </div>
      </div>

      <div className="px-2.5 py-2 text-xs font-semibold">{monthTitle}</div>

      {view === "month" ? (
        <div className="px-2 pb-2">
          <div className="grid grid-cols-7 border-b border-border/60 pb-1 text-center text-[10px] font-medium text-muted-foreground">
            {weekdays.map((day) => <span key={day}>{day}</span>)}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const key = dayKey(day)
              const inMonth = day.getMonth() === cursor.getMonth()
              const dayEvents = events.filter((event) => event.start <= key && key <= event.end)
              return (
                <div
                  key={key}
                  role={readOnly ? undefined : "button"}
                  tabIndex={readOnly ? undefined : 0}
                  onClick={() => !readOnly && openNew(key)}
                  onKeyDown={(event) => {
                    if (!readOnly && (event.key === "Enter" || event.key === " ")) {
                      event.preventDefault()
                      openNew(key)
                    }
                  }}
                  className={cn(
                    "min-h-20 border-b border-r border-border/40 p-1 text-left align-top last:border-r-0",
                    !inMonth && "bg-muted/20 text-muted-foreground",
                    !readOnly && "cursor-pointer hover:bg-brand-soft/10",
                    key === todayKey && "bg-brand-soft/20",
                  )}
                >
                  <div className={cn("mb-1 flex size-5 items-center justify-center rounded-full text-[10px]", key === todayKey && "bg-brand font-semibold text-white")}>{day.getDate()}</div>
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map((event) => {
                      const color = colorOf(event.color)
                      return (
                        <button
                          key={`${event.index}-${key}`}
                          type="button"
                          onClick={(clickEvent) => {
                            clickEvent.stopPropagation()
                            openEdit(event.index)
                          }}
                          className={cn("flex w-full items-center gap-1 truncate rounded border px-1 py-0.5 text-left text-[10px]", color.chip)}
                          title={event.title}
                        >
                          <span className={cn("size-1.5 shrink-0 rounded-full", color.dot)} />
                          <span className="truncate">{event.title}</span>
                        </button>
                      )
                    })}
                    {dayEvents.length > 3 && <div className="px-1 text-[9px] text-muted-foreground">+{dayEvents.length - 3}</div>}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="px-2.5 pb-2">
          {events.length === 0 ? (
            <div className="rounded-lg border border-dashed px-3 py-8 text-center text-xs text-muted-foreground">{tr("No events yet. Add one to get started.")}</div>
          ) : (
            <div className="space-y-1">
              {events.map((event) => {
                const color = colorOf(event.color)
                return (
                  <button
                    key={event.index}
                    type="button"
                    onClick={() => openEdit(event.index)}
                    className="flex w-full items-center gap-2 rounded-lg border px-2 py-1.5 text-left text-xs transition hover:bg-accent/40"
                  >
                    <span className={cn("size-2 shrink-0 rounded-full", color.dot)} />
                    <span className="min-w-0 flex-1 truncate font-medium">{event.title}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground">{dateLabel(event.start)} – {dateLabel(event.end)}</span>
                  </button>
                )
              })}
            </div>
          )}
        </div>
      )}

      <Dialog open={!!draft} onOpenChange={(open) => !open && setDraft(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{(draft?.index ?? -1) >= 0 ? tr("Edit event") : tr("New event")}</DialogTitle></DialogHeader>
          {draft && (
            <div className="space-y-3">
              <div className="space-y-1.5"><Label htmlFor="calendar-event-title">{tr("Title")}</Label><Input id="calendar-event-title" autoFocus value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} placeholder={tr("Event title")} /></div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1.5"><Label htmlFor="calendar-event-start">{tr("Start")}</Label><Input id="calendar-event-start" type="date" value={draft.start} onChange={(event) => setDraft({ ...draft, start: event.target.value })} /></div>
                <div className="space-y-1.5"><Label htmlFor="calendar-event-end">{tr("End")}</Label><Input id="calendar-event-end" type="date" value={draft.end} onChange={(event) => setDraft({ ...draft, end: event.target.value })} /></div>
              </div>
              <div className="space-y-1.5">
                <Label>{tr("Color")}</Label>
                <div className="flex gap-2">
                  {COLORS.map((color) => (
                    <button key={color.value} type="button" aria-label={color.value} aria-pressed={draft.color === color.value} onClick={() => setDraft({ ...draft, color: color.value })} className={cn("size-6 rounded-full ring-offset-2 ring-offset-background transition", color.swatch, draft.color === color.value && "ring-2 ring-foreground/40")} />
                  ))}
                </div>
              </div>
            </div>
          )}
          <DialogFooter className="gap-1.5">
            {(draft?.index ?? -1) >= 0 && <Button type="button" variant="ghost" className="mr-auto gap-1 text-destructive hover:text-destructive" onClick={removeDraft}><Trash2 className="size-3.5" /> {tr("Delete")}</Button>}
            <Button type="button" variant="ghost" onClick={() => setDraft(null)}>{tr("Cancel")}</Button>
            <Button type="button" onClick={commitDraft}>{tr("Save")}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
