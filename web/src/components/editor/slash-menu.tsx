import { useEffect, useMemo, useRef } from "react"
import { Search } from "lucide-react"
import type { SlashCommand } from "@/components/editor/commands"
import { cn } from "@/lib/utils"
import { tr } from "@/lib/i18n"
import { isImeKeyEvent } from "@/lib/keyboard"

const CATEGORY_ORDER = ["Basic", "Media", "Advanced", "Import"] as const
const CATEGORY_MAP: Record<string, string> = {
  paragraph: "Basic", heading1: "Basic", heading2: "Basic", heading3: "Basic", bulleted: "Basic", numbered: "Basic", todo: "Basic", quote: "Basic", callout: "Basic", code: "Basic", divider: "Basic", toc: "Basic",
  image: "Media", video: "Media", embed: "Media", bookmark: "Media", file: "Media", map: "Media", equation: "Media",
  table: "Advanced", database: "Advanced", jsonVisual: "Advanced", diagram: "Advanced", gantt: "Advanced", chart: "Advanced", columns: "Advanced", toggle: "Advanced", toggleHeading1: "Advanced", toggleHeading2: "Advanced", toggleHeading3: "Advanced", pageLink: "Advanced", breadcrumb: "Advanced", form: "Advanced", poll: "Advanced", qrcode: "Advanced", barcode: "Advanced", password: "Advanced", content: "Advanced",
}
const SHORTCUTS: Record<string, string> = {
  heading1: "# + Space", heading2: "## + Space", heading3: "### + Space", bulleted: "- + Space", numbered: "1. + Space", todo: "[] + Space", quote: "> + Space", code: "``` + Space", divider: "---", table: "/table",
}

export function groupSlashCommands(commands: SlashCommand[]): [string, SlashCommand[]][] {
  const map = new Map<string, SlashCommand[]>()
  for (const category of CATEGORY_ORDER) map.set(category, [])
  for (const command of commands) {
    const category = CATEGORY_MAP[command.type] ?? "Advanced"
    map.get(category)!.push(command)
  }
  return Array.from(map.entries()).filter(([, list]) => list.length > 0)
}

export function flattenSlashCommands(commands: SlashCommand[]): SlashCommand[] {
  return groupSlashCommands(commands).flatMap(([, list]) => list)
}

export interface SlashState {
  blockId: string
  index: number
  mode: "convert" | "insert"
  query: string
  x: number
  y: number
  selected: number
}

export function SlashMenu({
  state,
  commands,
  onSelect,
  onHover,
  onClose,
  onQueryChange,
}: {
  state: SlashState
  commands: SlashCommand[]
  onSelect: (command: SlashCommand) => void
  onHover: (index: number) => void
  onClose: () => void
  onQueryChange: (value: string) => void
}) {
  const ref = useRef<HTMLDivElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (state.mode === "insert") searchRef.current?.focus()
  }, [state.mode])

  const grouped = useMemo(() => groupSlashCommands(commands), [commands])
  const flatIndexMap = useMemo(() => grouped.flatMap(([, list]) => list), [grouped])

  useEffect(() => {
    const node = listRef.current?.querySelector<HTMLElement>(`[data-index="${state.selected}"]`)
    node?.scrollIntoView({ block: "nearest" })
  }, [state.selected])

  useEffect(() => {
    function onPointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose()
    }
    window.addEventListener("pointerdown", onPointerDown, true)
    return () => window.removeEventListener("pointerdown", onPointerDown, true)
  }, [onClose])

  const compact = window.innerWidth < 640
  const width = compact ? window.innerWidth - 24 : 304
  const estimatedHeight = Math.min(compact ? window.innerHeight * 0.66 : 380, Math.max(112, commands.length * 52 + 60))
  const left = compact ? 12 : Math.min(Math.max(8, state.x), window.innerWidth - width - 12)
  const openUp = !compact && state.y + estimatedHeight + 12 > window.innerHeight && state.y > estimatedHeight + 24
  const top = compact
    ? Math.max(60, window.innerHeight - estimatedHeight - 16)
    : openUp
      ? Math.max(8, state.y - estimatedHeight - 8)
      : Math.min(state.y + 6, window.innerHeight - 60)

  return (
    <>
      <div className="fixed inset-0 z-40" data-slash-backdrop />
      <div
        ref={ref}
        className="fixed z-50 overflow-hidden rounded-2xl border bg-popover shadow-2xl animate-in fade-in-0 zoom-in-95 touch-manipulation"
        style={{ left, top, width, paddingBottom: compact ? "max(8px, env(safe-area-inset-bottom))" : undefined }}
      >
        {compact && <div className="mx-auto mt-2 h-1 w-9 rounded-full bg-muted-foreground/20" />}
        <div className="flex items-center justify-between px-3 pb-1 pt-2.5">
          <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            {state.mode === "insert" ? tr("Insert block") : tr("Turn into")}
          </span>
          <span className="text-[10px] text-muted-foreground/60">↵ {tr("to choose")}</span>
        </div>
        <div className="px-2 pb-1.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <input
              ref={searchRef}
              value={state.query}
              onChange={(event) => onQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (isImeKeyEvent(event)) return
                if (/^[1-9]$/.test(event.key) && flatIndexMap.length >= Number(event.key)) {
                  event.preventDefault()
                  const cmd = flatIndexMap[Number(event.key) - 1]
                  if (cmd) onSelect(cmd)
                  return
                }
                if (event.key === "ArrowDown") {
                  event.preventDefault()
                  if (commands.length > 0) onHover((state.selected + 1) % commands.length)
                } else if (event.key === "ArrowUp") {
                  event.preventDefault()
                  if (commands.length > 0) onHover((state.selected - 1 + commands.length) % commands.length)
                } else if (event.key === "Enter") {
                  event.preventDefault()
                  const command = flatIndexMap[state.selected] ?? commands[state.selected]
                  if (command) onSelect(command)
                } else if (event.key === "Escape") {
                  event.preventDefault()
                  onClose()
                }
              }}
              placeholder={tr("Search blocks…")}
              aria-label={tr("Search blocks")}
              className="h-8 w-full rounded-md border bg-background/80 pl-8 pr-2 text-xs outline-none placeholder:text-muted-foreground/60 focus-visible:ring-2 focus-visible:ring-ring/25"
            />
          </div>
        </div>
        <div ref={listRef} role="listbox" aria-label={tr("Search blocks")} className="max-h-[min(300px,50svh)] overflow-y-auto p-1.5 thin-scrollbar">
          {commands.length === 0 ? (
            <div className="px-2 py-6 text-center text-xs text-muted-foreground">
              {tr("No matching blocks")}
            </div>
          ) : (
            grouped.map(([category, list]) => (
              <div key={category} className="mb-2 last:mb-0">
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{tr(category)}</div>
                {list.map((command) => {
                  const Icon = command.icon
                  const globalIndex = flatIndexMap.indexOf(command)
                  const shortcut = SHORTCUTS[command.type]
                  return (
                    <button
                      key={command.type}
                      type="button"
                      role="option"
                      aria-selected={globalIndex === state.selected}
                      data-index={globalIndex}
                      onMouseEnter={() => onHover(globalIndex)}
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => onSelect(command)}
                      className={cn(
                        "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
                        globalIndex === state.selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
                      )}
                    >
                      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border/70 bg-background/60 text-muted-foreground shadow-sm">
                        <Icon className="size-4" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium">{tr(command.title)}</span>
                        <span className="block truncate text-[11px] text-muted-foreground">
                          {tr(command.description)}
                        </span>
                      </span>
                      <span className="flex items-center gap-1 shrink-0">
                        {globalIndex < 9 && <span className="rounded bg-muted px-1 py-0.5 text-[10px] font-mono text-muted-foreground">{globalIndex + 1}</span>}
                        {shortcut && <span className="hidden text-[10px] text-muted-foreground/60 sm:block">{shortcut}</span>}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </>
  )
}
