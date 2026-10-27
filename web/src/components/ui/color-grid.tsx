import { Check } from "lucide-react"
import { tr } from "@/lib/i18n"
import type { BlockColor } from "@/lib/block-style"
import { cn } from "@/lib/utils"

export function ColorGrid({
  options,
  value,
  onChange,
  label,
}: {
  options: BlockColor[]
  value?: string
  onChange: (value: string) => void
  label: string
}) {
  const current = value || "default"
  return (
    <div>
      <div className="flex items-center justify-between px-1 pb-1.5">
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</span>
        <span className="text-[10px] text-muted-foreground/70">
          {tr(options.find((option) => option.value === current)?.label ?? "Default")}
        </span>
      </div>
      <div className="grid grid-cols-5 gap-1 sm:grid-cols-10 sm:gap-0.5">
        {options.map((option) => {
          const selected = current === option.value
          return (
            <button
              key={option.value}
              type="button"
              title={tr(option.label)}
              aria-label={`${label}: ${tr(option.label)}`}
              aria-pressed={selected}
              onClick={() => onChange(option.value)}
              className={cn(
                "flex h-12 flex-col items-center justify-center gap-1 rounded-lg border border-transparent transition sm:h-8 sm:gap-0",
                selected ? "border-brand bg-brand-soft/60" : "hover:bg-accent",
              )}
            >
              <span className={cn("relative flex size-5 items-center justify-center rounded-full border border-black/10 sm:size-4", option.swatch)}>
                {selected && <Check className="size-3 text-white drop-shadow-[0_1px_1px_rgba(0,0,0,0.55)]" strokeWidth={3} />}
              </span>
              <span className="text-[9px] leading-none text-muted-foreground sm:hidden">{tr(option.label)}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
