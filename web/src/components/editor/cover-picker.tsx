import { useState } from "react"
import { Check, ImagePlus, Link2, Trash2 } from "lucide-react"
import { COVERS, coverPosition, withCoverPosition, type CoverPosition } from "@/lib/covers"
import { cn } from "@/lib/utils"
import { tr } from "@/lib/i18n"
import { isImeKeyEvent } from "@/lib/keyboard"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"

export function CoverPicker({
  value,
  onSelect,
  children,
}: {
  value: string
  onSelect: (cover: string) => void
  children: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const [url, setUrl] = useState("")
  const isImage = value.startsWith("http://") || value.startsWith("https://")
  const position = coverPosition(value)

  function applyUrl() {
    const trimmed = url.trim()
    if (!trimmed) return
    onSelect(trimmed)
    setOpen(false)
    setUrl("")
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <div className="mb-2 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
          <ImagePlus className="size-3.5" /> Gallery
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {COVERS.map((cover) => (
            <button
              key={cover.id}
              type="button"
              title={cover.name}
              onClick={() => {
                onSelect(`gradient:${cover.id}`)
                setOpen(false)
              }}
              className={cn(
                "relative h-10 overflow-hidden rounded-md ring-offset-2 ring-offset-popover transition hover:scale-[1.03]",
                value === `gradient:${cover.id}` && "ring-2 ring-brand",
              )}
              style={{ backgroundImage: cover.css }}
            >
              {value === `gradient:${cover.id}` && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/15">
                  <Check className="size-3.5 text-white drop-shadow" />
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="mt-3 border-t pt-3">
          <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
            <Link2 className="size-3.5" /> Image URL
          </div>
          <div className="flex gap-1.5">
            <input
              value={url}
              onChange={(event) => setUrl(event.target.value)}
              onKeyDown={(event) => {
                if (isImeKeyEvent(event)) return
                if (event.key === "Enter") {
                  event.preventDefault()
                  applyUrl()
                }
              }}
              placeholder="https://images.unsplash.com/…"
              className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
            />
            <button
              type="button"
              onClick={applyUrl}
              className="h-8 shrink-0 rounded-md bg-primary px-2.5 text-[11px] font-medium text-primary-foreground transition hover:bg-primary/90"
            >
              Apply
            </button>
          </div>
        </div>

        {isImage && (
          <div className="mt-3 border-t pt-3">
            <div className="mb-1.5 flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {tr("Cover position")}
            </div>
            <div className="grid grid-cols-3 gap-1.5">
              {(["top", "center", "bottom"] as CoverPosition[]).map((pos) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => onSelect(withCoverPosition(value, pos))}
                  className={cn(
                    "rounded-md border px-2 py-1.5 text-[11px] capitalize transition",
                    position === pos ? "border-brand bg-brand-soft text-brand" : "text-muted-foreground hover:bg-accent",
                  )}
                >
                  {tr(pos === "top" ? "Top" : pos === "bottom" ? "Bottom" : "Center")}
                </button>
              ))}
            </div>
          </div>
        )}

        {value && (
          <button
            type="button"
            onClick={() => {
              onSelect("")
              setOpen(false)
            }}
            className="mt-3 flex w-full items-center justify-center gap-1.5 rounded-md border border-border/70 py-1.5 text-[11px] text-muted-foreground transition hover:border-destructive/30 hover:bg-destructive/5 hover:text-destructive"
          >
            <Trash2 className="size-3" /> Remove cover
          </button>
        )}
      </PopoverContent>
    </Popover>
  )
}
