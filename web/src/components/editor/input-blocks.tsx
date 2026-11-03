import { ListChecks, Plus, X } from "lucide-react"
import type { Block } from "@/lib/types"
import { tr } from "@/lib/i18n"

const FALLBACK_OPTIONS = ["Option 1", "Option 2"]

export function RadioGroupBlock({
  block,
  readOnly,
  onUpdate,
}: {
  block: Block
  readOnly: boolean
  onUpdate: (patch: Partial<Block>) => void
}) {
  const options = block.input?.options?.length ? block.input.options : FALLBACK_OPTIONS
  const value = block.input?.value ?? ""
  const save = (next: { options?: string[]; value?: string }) => {
    onUpdate({ input: { ...(block.input ?? { options: FALLBACK_OPTIONS, value: "" }), ...next } })
  }

  return (
    <div className="my-2 rounded-xl border border-border/80 bg-card p-3">
      <div className="flex items-center gap-2">
        <ListChecks className="size-3.5 text-brand" />
        <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{tr("Radio group")}</span>
        {!readOnly && options.length < 30 && (
          <button
            type="button"
            onClick={() => save({ options: [...options, `${tr("Option")} ${options.length + 1}`] })}
            className="ml-auto flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            <Plus className="size-3" /> {tr("Add option")}
          </button>
        )}
      </div>
      <div className="mt-2 space-y-1">
        {options.map((option, index) => (
          <div key={index} className="flex items-center gap-2">
            <input
              type="radio"
              name={`radio-group-${block.id}`}
              checked={value === option}
              disabled={readOnly}
              onChange={() => save({ value: option })}
              aria-label={option}
              className="size-4 shrink-0 accent-[var(--brand)]"
            />
            {readOnly ? (
              <span className="text-sm">{option}</span>
            ) : (
              <>
                <input
                  value={option}
                  onChange={(event) => {
                    const next = [...options]
                    const previous = next[index]
                    next[index] = event.target.value
                    save({ options: next, ...(value === previous ? { value: event.target.value } : {}) })
                  }}
                  onKeyDown={(event) => event.stopPropagation()}
                  aria-label={tr("Option")}
                  className="h-7 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
                />
                <button
                  type="button"
                  onClick={() => {
                    const next = options.filter((_, i) => i !== index)
                    save({ options: next, ...(value === option ? { value: "" } : {}) })
                  }}
                  aria-label={tr("Remove option")}
                  className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                >
                  <X className="size-3" />
                </button>
              </>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}
