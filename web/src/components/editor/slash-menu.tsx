import { useEffect, useRef } from "react"
import { Search } from "lucide-react"
import type { SlashCommand } from "@/components/editor/commands"
import { cn } from "@/lib/utils"
import { tr } from "@/lib/i18n"
import { isImeKeyEvent } from "@/lib/keyboard"

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
        className="fixed z-50 overflow-hidden rounded-xl border bg-popover shadow-2xl animate-in fade-in-0 zoom-in-95"
        style={{ left, top, width }}
      >
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
                if (event.key === "ArrowDown") {
                  event.preventDefault()
                  if (commands.length > 0) onHover((state.selected + 1) % commands.length)
                } else if (event.key === "ArrowUp") {
                  event.preventDefault()
                  if (commands.length > 0) onHover((state.selected - 1 + commands.length) % commands.length)
                } else if (event.key === "Enter") {
                  event.preventDefault()
                  const command = commands[state.selected]
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
        <div ref={listRef} className="max-h-[min(300px,50svh)] overflow-y-auto p-1.5 thin-scrollbar">
          {commands.length === 0 ? (
            <div className="px-2 py-6 text-center text-xs text-muted-foreground">
              {tr("No matching blocks")}
            </div>
          ) : (
            commands.map((command, index) => {
              const Icon = command.icon
              return (
                <button
                  key={command.type}
                  type="button"
                  data-index={index}
                  onMouseEnter={() => onHover(index)}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onSelect(command)}
                  className={cn(
                    "flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors",
                    index === state.selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/60",
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
                </button>
              )
            })
          )}
        </div>
      </div>
    </>
  )
}
