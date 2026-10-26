import { useMemo, useState } from "react"
import { Search, X } from "lucide-react"
import { EMOJIS, searchEmojis } from "@/lib/emoji"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { cn } from "@/lib/utils"

export function EmojiPicker({
  value,
  onSelect,
  children,
}: {
  value: string
  onSelect: (emoji: string) => void
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const results = useMemo(() => searchEmojis(query).slice(0, 160), [query])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="start" className="w-[316px] p-2">
        <div className="flex items-center gap-2 rounded-md border bg-background px-2">
          <Search className="size-3.5 text-muted-foreground" />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search emoji"
            autoFocus
            className="h-8 w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground/70"
          />
          {query && (
            <button type="button" onClick={() => setQuery("")} className="text-muted-foreground hover:text-foreground">
              <X className="size-3.5" />
            </button>
          )}
        </div>
        <div className="mt-2 max-h-[248px] overflow-y-auto thin-scrollbar pr-1">
          {results.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">No emoji found</div>
          ) : (
            <div className="grid grid-cols-9 gap-0.5">
              {results.map((emoji, index) => (
                <button
                  key={`${emoji.char}-${index}`}
                  type="button"
                  title={emoji.name}
                  onClick={() => {
                    onSelect(emoji.char)
                    setOpen(false)
                  }}
                  className="flex size-8 items-center justify-center rounded-md text-lg transition hover:bg-accent"
                >
                  {emoji.char}
                </button>
              ))}
            </div>
          )}
        </div>
        {value && (
          <button
            type="button"
            onClick={() => {
              onSelect("")
              setOpen(false)
            }}
            className="mt-2 flex w-full items-center justify-center gap-1.5 rounded-md border border-border/70 py-1.5 text-[11px] text-muted-foreground transition hover:bg-accent hover:text-foreground"
          >
            <X className="size-3" /> Remove icon
          </button>
        )}
        <div className="sr-only">{EMOJIS.length} emojis</div>
      </PopoverContent>
    </Popover>
  )
}
