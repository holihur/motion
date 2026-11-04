import { useRef } from "react"
import { cn } from "@/lib/utils"
import { tr } from "@/lib/i18n"

const KEYWORDS = new Set([
  "flowchart", "graph", "sequenceDiagram", "classDiagram", "classDiagram-v2", "stateDiagram", "stateDiagram-v2",
  "erDiagram", "journey", "gantt", "pie", "gitGraph", "mindmap", "timeline", "quadrantChart",
  "xychart-beta", "block-beta", "architecture-beta", "requirementDiagram", "C4Context", "C4Container",
  "C4Component", "C4Dynamic", "C4Deployment",
  "subgraph", "end", "participant", "actor", "note", "loop", "alt", "opt", "par", "and", "else", "critical",
  "break", "rect", "activate", "deactivate", "autonumber", "title", "section", "class", "state", "direction",
  "click", "style", "linkStyle", "classDef", "cssClass", "accTitle", "accDescr", "dateFormat", "axisFormat",
  "excludes", "includes", "todayMarker", "weekday", "commit", "branch", "checkout", "merge", "cherry-pick",
  "showData", "hide", "fork", "join",
])

const DIRECTIONS = new Set(["LR", "RL", "TB", "BT", "TD"])

const TOKEN = /(%%.*)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*')|(-->>|-->|---|-.->|==>|--x|--o|~~~|\|)|(\b(?:flowchart|graph|sequenceDiagram|classDiagram(?:-v2)?|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|gitGraph|mindmap|timeline|quadrantChart|xychart-beta|block-beta|architecture-beta|requirementDiagram|C4\w+|subgraph|end|participant|actor|note|loop|alt|opt|par|and|else|critical|break|rect|activate|deactivate|autonumber|title|section|class|state|direction|click|style|linkStyle|classDef|cssClass|accTitle|accDescr|dateFormat|axisFormat|excludes|includes|todayMarker|weekday|commit|branch|checkout|merge|cherry-pick|showData)\b)|(\b(?:LR|RL|TB|BT|TD)\b)|(\b\d+(?:\.\d+)?\b)|([A-Za-z_][\w.-]*)|(\s+)|(.)/g

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
}

function tokenClass(token: string): string {
  if (token.startsWith("%%")) return "mermaid-token-comment text-muted-foreground/70 italic"
  if (token.startsWith('"') || token.startsWith("'")) return "mermaid-token-string text-emerald-600 dark:text-emerald-400"
  if (KEYWORDS.has(token)) return "mermaid-token-keyword font-semibold text-fuchsia-600 dark:text-fuchsia-400"
  if (DIRECTIONS.has(token)) return "mermaid-token-direction text-sky-600 dark:text-sky-400"
  if (/^(?:-->>|-->|---|-.->|==>|--x|--o|~~~|\|)$/.test(token)) return "mermaid-token-edge text-amber-600 dark:text-amber-400"
  if (/^\d/.test(token)) return "mermaid-token-number text-orange-600 dark:text-orange-400"
  if (/^[A-Za-z_]/.test(token)) return "mermaid-token-name text-brand"
  return "mermaid-token-punctuation text-muted-foreground/80"
}

export function highlightMermaid(source: string): string {
  return source.replace(TOKEN, (token) => `<span class="${tokenClass(token)}">${escapeHtml(token)}</span>`)
}

export function MermaidSourceEditor({
  value,
  onChange,
  onFocus,
  readOnly = false,
  className,
}: {
  value: string
  onChange: (value: string) => void
  onFocus?: () => void
  readOnly?: boolean
  className?: string
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const highlightRef = useRef<HTMLPreElement>(null)

  function syncScroll() {
    const textarea = textareaRef.current
    const highlight = highlightRef.current
    if (!textarea || !highlight) return
    highlight.scrollTop = textarea.scrollTop
    highlight.scrollLeft = textarea.scrollLeft
  }

  return (
    <div className={cn("relative w-full overflow-hidden bg-transparent font-mono text-[12px] leading-5", className)}>
      <pre
        ref={highlightRef}
        aria-hidden="true"
        data-mermaid-highlight
        className="pointer-events-none absolute inset-0 m-0 overflow-hidden whitespace-pre p-3 font-mono text-[12px] leading-5"
        dangerouslySetInnerHTML={{ __html: highlightMermaid(value) + "\n" }}
      />
      <textarea
        ref={textareaRef}
        value={value}
        readOnly={readOnly}
        aria-label={tr("Mermaid source")}
        onChange={(event) => onChange(event.target.value)}
        onFocus={onFocus}
        onScroll={syncScroll}
        spellCheck={false}
        wrap="off"
        placeholder={"flowchart LR\n  A[Start] --> B[Finish]"}
        className="absolute inset-0 size-full resize-none overflow-auto whitespace-pre bg-transparent p-3 font-mono text-[12px] leading-5 text-transparent caret-foreground outline-none selection:bg-brand/30 placeholder:text-muted-foreground/50"
      />
    </div>
  )
}
