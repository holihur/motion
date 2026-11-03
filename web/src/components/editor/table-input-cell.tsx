import { Switch } from "@/components/ui/switch"
import { cn } from "@/lib/utils"
import type { TableColumnType } from "@/lib/types"
import { isCheckedTableCell } from "@/lib/table-input"
import { tr } from "@/lib/i18n"

export function TableInputCell({
  id,
  type,
  value,
  options,
  readOnly,
  align = "left",
  label,
  onChange,
  onFocus,
}: {
  id?: string
  type: Extract<TableColumnType, "checkbox" | "switch" | "select">
  value: string
  options: string[]
  readOnly: boolean
  align?: string
  label: string
  onChange: (value: string) => void
  onFocus?: () => void
}) {
  const checked = isCheckedTableCell(value)
  const alignClass = align === "center" ? "justify-center" : align === "right" ? "justify-end" : "justify-start"

  if (type === "checkbox") {
    return (
      <div className={cn("flex min-h-9 items-center px-2", alignClass)}>
        <input
          id={id}
          data-table-input
          type="checkbox"
          checked={checked}
          disabled={readOnly}
          onChange={(event) => onChange(event.target.checked ? "true" : "")}
          onFocus={onFocus}
          aria-label={label}
          className="size-4 cursor-pointer accent-[var(--brand)] disabled:cursor-default"
        />
      </div>
    )
  }

  if (type === "switch") {
    return (
      <div className={cn("flex min-h-9 items-center px-3", alignClass)}>
        <Switch
          id={id}
          checked={checked}
          disabled={readOnly}
          onCheckedChange={(next) => onChange(next ? "true" : "")}
          onFocus={onFocus}
          aria-label={label}
        />
      </div>
    )
  }

  const current = value.trim()
  const merged = current && !options.includes(current) ? [current, ...options] : options
  if (readOnly) {
    return (
      <div className="flex min-h-9 items-center px-2" style={{ justifyContent: align === "center" ? "center" : align === "right" ? "flex-end" : "flex-start" }}>
        <span className={cn("max-w-full truncate rounded-full px-2 py-0.5 text-[11px]", current ? "bg-muted" : "text-muted-foreground")}>{current || "—"}</span>
      </div>
    )
  }
  return (
    <div className="flex min-h-9 items-center px-1">
      <select
        id={id}
        data-table-input
        value={merged.includes(current) ? current : ""}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        aria-label={label}
        className="h-7 w-full min-w-0 rounded-md border bg-background px-1.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
      >
        <option value="">—</option>
        {merged.map((option) => <option key={option} value={option}>{option}</option>)}
      </select>
    </div>
  )
}
