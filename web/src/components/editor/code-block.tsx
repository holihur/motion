import { useEffect, useMemo, useRef, useState } from "react"
import hljs from "highlight.js/lib/common"
import apache from "highlight.js/lib/languages/apache"
import clojure from "highlight.js/lib/languages/clojure"
import dart from "highlight.js/lib/languages/dart"
import delphi from "highlight.js/lib/languages/delphi"
import dockerfile from "highlight.js/lib/languages/dockerfile"
import elixir from "highlight.js/lib/languages/elixir"
import erlang from "highlight.js/lib/languages/erlang"
import fortran from "highlight.js/lib/languages/fortran"
import fsharp from "highlight.js/lib/languages/fsharp"
import groovy from "highlight.js/lib/languages/groovy"
import haskell from "highlight.js/lib/languages/haskell"
import julia from "highlight.js/lib/languages/julia"
import matlab from "highlight.js/lib/languages/matlab"
import nginx from "highlight.js/lib/languages/nginx"
import ocaml from "highlight.js/lib/languages/ocaml"
import powershell from "highlight.js/lib/languages/powershell"
import protobuf from "highlight.js/lib/languages/protobuf"
import scala from "highlight.js/lib/languages/scala"
import x86asm from "highlight.js/lib/languages/x86asm"

for (const [name, language] of Object.entries({ apache, clojure, dart, delphi, dockerfile, elixir, erlang, fortran, fsharp, groovy, haskell, julia, matlab, nginx, ocaml, powershell, protobuf, scala, x86asm })) {
  hljs.registerLanguage(name, language)
}
import { Code2, Copy, Download, ListOrdered, WrapText } from "lucide-react"
import { toast } from "sonner"
import type { Block } from "@/lib/types"
import { tr } from "@/lib/i18n"

const LANGUAGES = [
  ["auto", "Auto detect"],
  ["plaintext", "Plain text"],
  ["javascript", "JavaScript"],
  ["typescript", "TypeScript"],
  ["python", "Python"],
  ["java", "Java"],
  ["c", "C"],
  ["cpp", "C++"],
  ["csharp", "C#"],
  ["go", "Go"],
  ["rust", "Rust"],
  ["ruby", "Ruby"],
  ["php", "PHP"],
  ["swift", "Swift"],
  ["kotlin", "Kotlin"],
  ["scala", "Scala"],
  ["dart", "Dart"],
  ["r", "R"],
  ["matlab", "MATLAB"],
  ["julia", "Julia"],
  ["perl", "Perl"],
  ["lua", "Lua"],
  ["bash", "Shell"],
  ["powershell", "PowerShell"],
  ["sql", "SQL"],
  ["xml", "HTML / XML"],
  ["css", "CSS"],
  ["scss", "SCSS"],
  ["less", "Less"],
  ["json", "JSON"],
  ["yaml", "YAML"],
  ["markdown", "Markdown"],
  ["dockerfile", "Dockerfile"],
  ["nginx", "Nginx"],
  ["apache", "Apache"],
  ["graphql", "GraphQL"],
  ["protobuf", "Protobuf"],
  ["diff", "Diff"],
  ["makefile", "Makefile"],
  ["ini", "INI / TOML"],
  ["objectivec", "Objective-C"],
  ["vbnet", "VB.NET"],
  ["groovy", "Groovy"],
  ["haskell", "Haskell"],
  ["elixir", "Elixir"],
  ["erlang", "Erlang"],
  ["clojure", "Clojure"],
  ["ocaml", "OCaml"],
  ["fsharp", "F#"],
  ["fortran", "Fortran"],
  ["x86asm", "Assembly"],
] as const

const ALIASES: Record<string, string> = {
  "plain text": "plaintext", plain: "plaintext", text: "plaintext",
  js: "javascript", jsx: "javascript", ts: "typescript", tsx: "typescript",
  html: "xml", sh: "bash", shell: "bash", zsh: "bash", py: "python",
  yml: "yaml", md: "markdown", "c#": "csharp", "c++": "cpp", golang: "go",
  rs: "rust", kt: "kotlin", rb: "ruby", pl: "perl", ps1: "powershell",
  "objective-c": "objectivec", vb: "vbnet", fs: "fsharp", hs: "haskell",
  ex: "elixir", erl: "erlang", clj: "clojure", ml: "ocaml", asm: "x86asm",
  docker: "dockerfile", "html/xml": "xml", toml: "ini",
}

function normalize(value: string) {
  return resolveLanguage(value) ?? "plaintext"
}

const LANGUAGE_LABELS = new Map<string, string>(LANGUAGES.map(([id, label]) => [label.toLowerCase(), id]))
const LANGUAGE_IDS = new Set<string>(LANGUAGES.map(([id]) => id))

function resolveLanguage(value: string): string | null {
  const key = value.trim().toLowerCase()
  if (!key) return null
  return ALIASES[key] ?? LANGUAGE_LABELS.get(key) ?? (LANGUAGE_IDS.has(key) ? key : null)
}

function languageLabel(id: string) {
  return LANGUAGES.find(([value]) => value === id)?.[1] ?? id
}

// Auto detection is only trusted when highlight.js finds a reasonably strong match.
const AUTO_DETECT_MIN_RELEVANCE = 5
const AUTO_DETECT_MIN_LENGTH = 12

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
  const [languageDraft, setLanguageDraft] = useState(languageLabel(language))
  useEffect(() => {
    setLanguageDraft((draft) => (resolveLanguage(draft) === language ? draft : languageLabel(language)))
  }, [language])
  const commitLanguage = (value: string) => {
    const next = normalize(value)
    onUpdate({ language: next })
    setLanguageDraft(languageLabel(next))
  }
  const autoHighlight = useMemo(() => {
    if (language !== "auto") return null
    const text = block.text || ""
    if (text.trim().length < AUTO_DETECT_MIN_LENGTH) return null
    const result = hljs.highlightAuto(text)
    return (result.relevance ?? 0) >= AUTO_DETECT_MIN_RELEVANCE ? result : null
  }, [block.text, language])
  const autoDetected = language === "auto" && autoHighlight?.language
    ? { language: autoHighlight.language }
    : null
  const highlighted = useMemo(() => {
    if (autoHighlight) return autoHighlight.value
    try {
      return hljs.highlight(block.text || " ", { language: language === "auto" ? "plaintext" : language, ignoreIllegals: true }).value
    } catch {
      return hljs.highlight(block.text || " ", { language: "plaintext", ignoreIllegals: true }).value
    }
  }, [autoHighlight, block.text, language])

  useEffect(() => {
    if (autoFocus) textareaRef.current?.focus()
  }, [autoFocus])

  const header = (
    <div className="flex items-center justify-between gap-2 border-b border-border/60 px-3 py-1.5">
      <label className="flex min-w-0 items-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        <Code2 className="size-3 shrink-0" />
        <input
          value={languageDraft}
          disabled={readOnly}
          list={`code-language-options-${block.id}`}
          onChange={(event) => {
            const value = event.target.value
            setLanguageDraft(value)
            const resolved = resolveLanguage(value)
            if (resolved) onUpdate({ language: resolved })
          }}
          onBlur={() => commitLanguage(languageDraft)}
          onKeyDown={(event) => {
            event.stopPropagation()
            if (event.key === "Enter") {
              event.preventDefault()
              commitLanguage(languageDraft)
              event.currentTarget.blur()
            } else if (event.key === "Escape") {
              setLanguageDraft(languageLabel(language))
              event.currentTarget.blur()
            }
          }}
          className="w-[7.5rem] min-w-0 rounded border border-transparent bg-transparent py-0.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground outline-none hover:border-border focus:border-brand/40"
          aria-label={tr("Code language")}
          placeholder={tr("Auto detect")}
        />
        <datalist id={`code-language-options-${block.id}`}>
          {LANGUAGES.map(([id, label]) => <option key={id} value={label} />)}
        </datalist>
        {autoDetected && (
          <span className="ml-1 rounded bg-brand-soft px-1.5 py-0.5 text-[9px] font-medium normal-case tracking-normal text-brand">
            {tr("detected: {language}", { language: autoDetected.language })}
          </span>
        )}
      </label>
      <div className="flex items-center gap-0.5">
      <button
        type="button"
        onClick={() => onUpdate({ align: block.align === "wrap" ? "" : "wrap" })}
        aria-pressed={block.align === "wrap"}
        title={tr("Toggle word wrap")}
        className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] transition hover:bg-background hover:text-foreground ${block.align === "wrap" ? "text-brand" : "text-muted-foreground"}`}
      >
        <WrapText className="size-3" /> {tr("Wrap")}
      </button>
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
        <pre aria-hidden className={`min-h-[44px] px-3.5 py-3 font-mono text-[13px] leading-6 ${block.align === "wrap" ? "whitespace-pre-wrap break-words" : "overflow-x-auto whitespace-pre"}`}>
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
