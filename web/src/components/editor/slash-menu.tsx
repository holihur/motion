import { useEffect, useMemo, useRef } from "react"
import { Search } from "lucide-react"
import type { SlashCommand } from "@/components/editor/commands"
import { cn } from "@/lib/utils"
import { tr } from "@/lib/i18n"
import { isImeKeyEvent } from "@/lib/keyboard"

const CATEGORY_ORDER = ["基础", "媒体", "高级", "导入"] as const
const CATEGORY_MAP: Record<string, string> = {
  paragraph: "基础", heading1: "基础", heading2: "基础", heading3: "基础", bulleted: "基础", numbered: "基础", todo: "基础", quote: "基础", callout: "基础", code: "基础", divider: "基础", toc: "基础",
  image: "媒体", video: "媒体", embed: "媒体", bookmark: "媒体", file: "媒体", map: "媒体", equation: "媒体",
  table: "高级", database: "高级", jsonVisual: "高级", diagram: "高级", gantt: "高级", chart: "高级", columns: "高级", toggle: "高级", toggleHeading1: "高级", toggleHeading2: "高级", toggleHeading3: "高级", pageLink: "高级", breadcrumb: "高级", form: "高级", poll: "高级", qrcode: "高级", barcode: "高级", password: "高级", content: "高级",
}
const SHORTCUTS: Record<string, string> = {
  heading1: "# + 空格", heading2: "## + 空格", heading3: "### + 空格", bulleted: "- + 空格", numbered: "1. + 空格", todo: "[] + 空格", quote: "> + 空格", code: "``` + 空格", divider: "---", table: "/table",
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

  const grouped = useMemo(() => {
    const map = new Map<string, SlashCommand[]>()
    for (const cat of CATEGORY_ORDER) map.set(cat, [])
    for (const cmd of commands) {
      const cat = CATEGORY_MAP[cmd.type] ?? "高级"
      map.get(cat)!.push(cmd)
    }
    return Array.from(map.entries()).filter(([, list]) => list.length > 0)
  }, [commands])
  const flatIndexMap = useMemo(() => {
    const arr: SlashCommand[] = []
    for (const [, list] of grouped) arr.push(...list)
    return arr
  }, [grouped])

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
                <div className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{category}</div>
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
