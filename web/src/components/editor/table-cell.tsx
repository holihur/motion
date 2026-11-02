import { useRef, useState } from "react"
import { cn } from "@/lib/utils"
import { inlineMarkdownToHTML } from "@/lib/inline-markdown"

export function TableCell({
  id,
  value,
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
  const showRich = Boolean(value) && (!editing || readOnly)
  const richClass = cn(
    "w-full whitespace-pre-wrap break-words px-2 py-1 [&_a]:text-brand [&_a]:underline [&_code]:rounded [&_code]:bg-muted [&_code]:px-1 [&_code]:py-0.5 [&_code]:font-mono [&_code]:text-[0.92em] [&_s]:line-through",
    header ? "text-xs font-semibold" : "text-[13px]",
  )

  if (readOnly) {
    return <div className={cn("min-h-9", header && "min-h-8", className)} style={{ textAlign: align as React.CSSProperties["textAlign"] }}><div className={richClass} dangerouslySetInnerHTML={{ __html: value ? inlineMarkdownToHTML(value) : "" }} /></div>
  }

  return (
    <div className={cn("relative flex items-center", header ? "min-h-8" : "min-h-9", className)}>
      {showRich && (
        <div className={richClass} style={{ textAlign: align as React.CSSProperties["textAlign"] }} dangerouslySetInnerHTML={{ __html: inlineMarkdownToHTML(value) }} />
      )}
      <input
        ref={inputRef}
        id={id}
        data-table-cell
        value={value}
        readOnly={readOnly}
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
