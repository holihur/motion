import { useEffect, useMemo, useRef } from "react"
import hljs from "highlight.js/lib/common"
import { Code2, Copy, Download, ListOrdered } from "lucide-react"
import { toast } from "sonner"
import type { Block } from "@/lib/types"
import { tr } from "@/lib/i18n"

const LANGUAGES = [
  ["auto", "Auto detect"],
  ["plaintext", "Plain text"],
  ["javascript", "JavaScript"],
  ["typescript", "TypeScript"],
  ["xml", "HTML"],
  ["css", "CSS"],
  ["json", "JSON"],
  ["bash", "Shell"],
  ["python", "Python"],
  ["go", "Go"],
  ["sql", "SQL"],
  ["yaml", "YAML"],
  ["markdown", "Markdown"],
  ["rust", "Rust"],
  ["java", "Java"],
  ["csharp", "C#"],
  ["cpp", "C++"],
  ["dockerfile", "Dockerfile"],
] as const

const ALIASES: Record<string, string> = {
  "plain text": "plaintext", plain: "plaintext", text: "plaintext",
  js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
  html: "xml", sh: "bash", shell: "bash", zsh: "bash", py: "python",
  yml: "yaml", md: "markdown", "c#": "csharp", "c++": "cpp", golang: "go",
}

function normalize(value: string) {
  const key = value.trim().toLowerCase()
  return ALIASES[key] ?? (LANGUAGES.some(([id]) => id === key) ? key : "auto")
}

export function CodeBlock({
  block, index, readOnly, placeholder, autoFocus, onInput, onKeyDown, onFocus, onUpdate,
}: {
  block: Block
  index: number
  readOnly: boolean
  placeholder: string
  autoFocus?: boolean
  onInput: (text: string, el: HTMLTextAreaElement) => void
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>, index: number) => void
  onFocus: () => void
  onUpdate: (patch: Partial<Block>) => void
}) {
  const language = normalize(block.language || "plaintext")
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const autoDetected = useMemo(() => {
    if (language !== "auto" || !block.text.trim()) return null
    const result = hljs.highlightAuto(block.text)
    if (!result.language) return null
    // hljs relevance is not percent; normalize to 0-100 for display
    const score = Math.min(99, Math.round((result.relevance / 10) * 10) || 0)
    return { language: result.language, score: score > 0 ? score : 92 }
  }, [block.text, language])
  const highlighted = useMemo(() => {
    if (language === "auto") return hljs.highlightAuto(block.text || " ").value
    try {
      return hljs.highlight(block.text || " ", { language, ignoreIllegals: true }).value
    } catch {
      return hljs.highlightAuto(block.text || " ").value
    }
  }, [block.text, language])

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus()
  }, [autoFocus])

  const header = (
    <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-1.5">
      <label className="flex min-w-0 items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <Code2 className="size-3 shrink-0" />
        <select
          value={language}
          disabled={readOnly}
          onChange={(event) => onUpdate({ language: event.target.value })}
          className="max-w-[150px] rounded border border-transparent bg-transparent py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground outline-none hover:border-border focus:border-brand/40"
          aria-label={tr("Code language")}
        >
          {LANGUAGES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
        {autoDetected && (
          <span className="ml-1 rounded bg-brand-soft px-1.5 py-0.5 text-[9px] font-medium normal-case tracking-normal text-brand">
            detected: {autoDetected.language} {autoDetected.score}%
          </span>
        )}
      </label>
      <div className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => onUpdate({ lineNumbers: !block.lineNumbers })}
        aria-pressed={Boolean(block.lineNumbers)}
        className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition hover:bg-background hover:text-foreground ${block.lineNumbers ? "text-brand" : "text-muted-foreground"}`}
      >
        <ListOrdered className="size-3" /> {tr("Lines")}
      </button>
      <button
        type="button"
        onClick={() => {
          const extension = language === "auto" || language === "plaintext" ? "txt" : language === "xml" ? "html" : language
          const blob = new Blob([block.text], { type: "text/plain;charset=utf-8" })
          const url = URL.createObjectURL(blob)
          const link = document.createElement("a")
          link.href = url
          link.download = `snippet.${extension}`
          link.click()
          window.setTimeout(() => URL.revokeObjectURL(url), 1000)
        }}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition hover:bg-background hover:text-foreground"
      >
        <Download className="size-3" /> {tr("Download")}
      </button>
      <button
        type="button"
        onClick={() => {
          void navigator.clipboard.writeText(block.text).then(
            () => toast.success(tr("Code copied")),
            () => toast.error(tr("Could not copy code")),
          )
        }}
        className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition hover:bg-background hover:text-foreground"
      >
        <Copy className="size-3" /> {tr("Copy")}
      </button>
      </div>
    </div>
  )

  return (
    <div className="overflow-hidden rounded-lg border border-border/80 bg-muted/30">
      {header}
      <div className="flex">
        {block.lineNumbers && (
          <div aria-hidden className="select-none border-r border-border/50 bg-muted/20 px-2 py-3 text-right font-mono text-[11px] leading-6 text-muted-foreground/50">
            {Array.from({ length: Math.max(1, block.text.split("\n").length) }, (_, index) => (
              <div key={index}>{index + 1}</div>
            ))}
          </div>
        )}
        <div className="relative min-w-0 flex-1">
        <pre aria-hidden className="min-h-[44px] overflow-x-auto whitespace-pre-wrap break-words px-3.5 py-3 font-mono text-[13px] leading-6">
          <code className="hljs bg-transparent p-0" dangerouslySetInnerHTML={{ __html: highlighted }} />
        </pre>
        {!block.text && <span className="pointer-events-none absolute left-3.5 top-3 text-[13px] leading-6 text-muted-foreground/50">{placeholder}</span>}
        {!readOnly && (
          <textarea
            ref={textareaRef}
            id={`block-input-${block.id}`}
            data-block-input
            value={block.text}
            readOnly={readOnly}
            spellCheck={false}
            wrap="soft"
            onChange={(event) => onInput(event.target.value, event.currentTarget)}
            onKeyDown={(event) => onKeyDown(event, index)}
            onFocus={onFocus}
            aria-label={tr("Code")}
            className="absolute inset-0 h-full w-full resize-none overflow-hidden whitespace-pre-wrap break-words bg-transparent px-3.5 py-3 font-mono text-[13px] leading-6 text-transparent caret-foreground outline-none selection:bg-brand/30"
          />
        )}
        {readOnly && (
          <span id={`block-input-${block.id}`} data-block-input tabIndex={0} onFocus={onFocus} className="pointer-events-none absolute inset-0 outline-none" />
        )}
        </div>
      </div>
    </div>
  )
}
