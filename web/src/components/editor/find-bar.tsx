import { useEffect, useMemo, useRef, useState } from "react"
import { ArrowDown, ArrowUp, Replace, ReplaceAll, X } from "lucide-react"
import type { Block } from "@/lib/types"
import { findMatches, replaceMatches } from "@/lib/find-replace"
import { tr } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

/** In-page find & replace (Cmd/Ctrl+F) over block text. */
export function FindBar({
  blocks,
  readOnly = false,
  onClose,
  onChange,
  onJump,
}: {
  blocks: Block[]
  readOnly?: boolean
  onClose: () => void
  onChange: (next: Block[]) => void
  onJump: (blockId: string) => void
}) {
  const [query, setQuery] = useState("")
  const [replacement, setReplacement] = useState("")
  const [index, setIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  const matches = useMemo(() => findMatches(blocks, query), [blocks, query])
  const current = matches.length > 0 ? Math.min(index, matches.length - 1) : -1

  useEffect(() => {
    inputRef.current?.focus()
    inputRef.current?.select()
  }, [])

  useEffect(() => {
    if (current < 0) return
    const match = matches[current]
    const block = blocks[match.blockIndex]
    if (block) onJump(block.id)
    // Only jump when the active match changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, query])

  function step(direction: 1 | -1) {
    if (matches.length === 0) return
    setIndex((value) => (value + direction + matches.length) % matches.length)
  }

  function replaceOne() {
    if (readOnly || current < 0) return
    const next = replaceMatches(blocks, query, replacement, [matches[current]])
    onChange(next)
    if (matches.length <= 1) setIndex(0)
  }

  function replaceAll() {
    if (readOnly || matches.length === 0) return
    onChange(replaceMatches(blocks, query, replacement, matches))
    setIndex(0)
  }

  return (
    <div className="fixed right-4 top-14 z-40 w-[min(420px,calc(100vw-2rem))] rounded-xl border border-border/80 bg-popover/95 p-2 shadow-xl backdrop-blur animate-in fade-in-0 zoom-in-95">
      <div className="flex items-center gap-1.5">
        <input
          ref={inputRef}
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setIndex(0)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              if (event.shiftKey) step(-1)
              else step(1)
            } else if (event.key === "Escape") {
              event.preventDefault()
              onClose()
            }
          }}
          placeholder={tr("Find in page")}
          aria-label={tr("Find in page")}
          className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs outline-none focus:border-brand/50"
        />
        <span className={cn("shrink-0 text-[11px] tabular-nums", matches.length ? "text-muted-foreground" : "text-muted-foreground/60")}>
          {matches.length ? `${current + 1}/${matches.length}` : "0/0"}
        </span>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={tr("Previous match")} onClick={() => step(-1)} disabled={matches.length === 0}>
          <ArrowUp className="size-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={tr("Next match")} onClick={() => step(1)} disabled={matches.length === 0}>
          <ArrowDown className="size-3.5" />
        </Button>
        <Button type="button" variant="ghost" size="icon-sm" aria-label={tr("Close find")} onClick={onClose}>
          <X className="size-3.5" />
        </Button>
      </div>

      {!readOnly && (
        <div className="mt-1.5 flex items-center gap-1.5">
          <input
            value={replacement}
            onChange={(event) => setReplacement(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                if (event.metaKey || event.ctrlKey) replaceAll()
                else replaceOne()
              } else if (event.key === "Escape") {
                event.preventDefault()
                onClose()
              }
            }}
            placeholder={tr("Replace with")}
            aria-label={tr("Replace with")}
            className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs outline-none focus:border-brand/50"
          />
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-[11px]" onClick={replaceOne} disabled={current < 0}>
            <Replace className="size-3.5" /> {tr("Replace")}
          </Button>
          <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-[11px]" onClick={replaceAll} disabled={matches.length === 0}>
            <ReplaceAll className="size-3.5" /> {tr("All")}
          </Button>
        </div>
      )}
    </div>
  )
}
