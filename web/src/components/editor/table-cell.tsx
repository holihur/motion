import { useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { inlineMarkdownToHTML } from "@/lib/inline-markdown"
import { isFormulaError } from "@/lib/table-formula"

export function TableCell({
  id,
  value,
  formula,
  readOnly,
  header = false,
  align = "left",
  placeholder,
  className,
  onChange,
  onKeyDown,
  onPaste,
  onFocus,
}: {
  id?: string
  value: string
  formula?: string
  readOnly: boolean
  header?: boolean
  align?: string
  placeholder?: string
  className?: string
  onChange: (value: string) => void
  onKeyDown: (event: React.KeyboardEvent<HTMLInputElement>) => void
  onPaste?: (event: React.ClipboardEvent<HTMLInputElement>) => void
  onFocus?: () => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [editing, setEditing] = useState(false)
  // `value` is the computed text, `formula` is what the user typed. While the
  // cell is not focused the computed value wins, so a formula never leaks raw.
  const showRich = (Boolean(value) || Boolean(formula)) && (!editing || readOnly)
  const failed = isFormulaError(value)
  const richClass = cn(
    "w-full min-w-0 px-2 py-1 [&_a]:text-brand [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.92em] [&_s]:line-through",
    header ? "truncate whitespace-nowrap text-xs font-semibold" : "whitespace-pre-wrap break-words text-[13px]",
    failed && "font-mono text-[11px] text-destructive",
  )

  if (readOnly) {
    return <div className={cn("min-h-9", header && "min-h-8", className)} style={{ textAlign: align as React.CSSProperties["textAlign"] }}><div className={richClass} title={header || formula ? (formula ?? value) : undefined} dangerouslySetInnerHTML={{ __html: value ? (failed ? value : inlineMarkdownToHTML(value)) : "" }} /></div>
  }

  return (
    <div className={cn("relative flex items-center", header ? "min-h-8" : "min-h-9", className)}>
      {showRich && (
        <div className={richClass} style={{ textAlign: align as React.CSSProperties["textAlign"] }} title={header || formula ? (formula ?? value) : undefined} dangerouslySetInnerHTML={{ __html: value ? (failed ? value : inlineMarkdownToHTML(value)) : "" }} />
      )}
      {formula && !header && (
        <span aria-hidden className="pointer-events-none absolute right-1 top-0.5 z-10 text-[9px] font-semibold leading-none text-brand/70" title={formula}>Σ</span>
      )}
      <input
        ref={inputRef}
        id={id}
        data-table-cell
        value={formula ?? value}
        readOnly={readOnly}
        aria-invalid={failed || undefined}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onFocus={() => {
          setEditing(true)
          onFocus?.()
        }}
        onBlur={() => setEditing(false)}
        className={cn(
          "h-9 w-full bg-transparent px-2 outline-none transition focus:bg-brand-soft/20",
          header ? "h-8 text-xs font-semibold" : "text-[13px]",
          showRich && "absolute inset-0 cursor-text text-transparent caret-transparent selection:bg-brand-soft/40",
        )}
        style={{ textAlign: align as React.CSSProperties["textAlign"] }}
        placeholder={placeholder}
      />
    </div>
  )
}
