import { useEffect, useMemo, useRef, useState } from "react"
import { Sigma } from "lucide-react"
import { toast } from "sonner"
import katex from "katex"
import "katex/dist/katex.min.css"
import type { Block } from "@/lib/types"
import { tr } from "@/lib/i18n"
import { cn } from "@/lib/utils"

export function EquationBlock({
  block, readOnly, autoFocus, onUpdate,
}: {
  block: Block; readOnly: boolean; autoFocus?: boolean; onUpdate: (patch: Partial<Block>) => void
}) {
  const [editing, setEditing] = useState(!block.text)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const html = useMemo(() => {
    try {
      return katex.renderToString(block.text || "E = mc^2", { displayMode: true, throwOnError: false, strict: false })
    } catch {
      return ""
    }
  }, [block.text])
  useEffect(() => { if (autoFocus) textareaRef.current?.focus() }, [autoFocus])
  return (
    <div
      id={`block-input-${block.id}`}
      data-block-input
      tabIndex={0}
      className="my-2 overflow-hidden rounded-xl border border-border/80 bg-card"
    >
      <div className="flex items-center gap-1.5 border-b border-border/60 px-2.5 py-1.5 text-[10px] text-muted-foreground">
        <Sigma className="size-3" /> {tr("Equation")}
        {!readOnly && (
          <span className="flex items-center gap-0.5">
            {[["sm", "S"], ["", "M"], ["lg", "L"]].map(([v, label]) => (
              <button
                key={label}
                type="button"
                title={tr("Equation size")}
                onClick={() => onUpdate({ language: v })}
                className={cn("rounded px-1.5 py-0.5 text-[10px] font-medium hover:bg-accent", (block.language || "") === v ? "bg-accent text-foreground" : "")}
              >
                {label}
              </button>
            ))}
          </span>
        )}
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(block.text).then(() => toast.success(tr("Copied to clipboard")), () => toast.error(tr("Could not copy")))}
          className="ml-auto rounded px-1.5 py-0.5 text-[10px] transition hover:bg-accent hover:text-foreground"
        >
          {tr("Copy")}
        </button>
        <button
          type="button"
          onClick={() => setEditing((value) => !value)}
          className="rounded px-2 py-0.5 text-[10px] transition hover:bg-accent hover:text-foreground"
        >
          {editing ? tr("Preview") : tr("Edit source")}
        </button>
      </div>
      {editing && (
        <textarea
          ref={textareaRef}
          value={block.text}
          readOnly={readOnly}
          onChange={(event) => onUpdate({ text: event.target.value })}
          rows={3}
          spellCheck={false}
          placeholder={"\\frac{a}{b} = c^2"}
          className="block w-full resize-y bg-transparent p-3 font-mono text-xs leading-5 outline-none placeholder:text-muted-foreground/50"
        />
      )}
      <div
        className={cn("overflow-x-auto px-4 py-4 text-center", editing && "border-t border-border/60 bg-muted/15", block.language === "sm" ? "text-base" : block.language === "lg" ? "text-2xl" : "text-xl")}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}

