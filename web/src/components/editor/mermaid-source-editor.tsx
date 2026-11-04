import { useEffect, useRef } from "react"
import { basicSetup } from "codemirror"
import { indentWithTab } from "@codemirror/commands"
import { HighlightStyle, StreamLanguage, syntaxHighlighting } from "@codemirror/language"
import { Compartment, EditorState, Transaction } from "@codemirror/state"
import { EditorView, keymap, placeholder } from "@codemirror/view"
import { tags } from "@lezer/highlight"
import { cn } from "@/lib/utils"
import { tr } from "@/lib/i18n"
import { useThemeStore } from "@/stores/theme"

const KEYWORDS = "flowchart|graph|sequenceDiagram|classDiagram(?:-v2)?|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|gitGraph|mindmap|timeline|quadrantChart|xychart-beta|block-beta|architecture-beta|requirementDiagram|C4\\w+|subgraph|end|participant|actor|note|loop|alt|opt|par|and|else|critical|break|rect|activate|deactivate|autonumber|title|section|class|state|direction|click|style|linkStyle|classDef|cssClass|accTitle|accDescr|dateFormat|axisFormat|excludes|includes|todayMarker|weekday|commit|branch|checkout|merge|cherry-pick|showData"

const mermaidLanguage = StreamLanguage.define({
  startState: () => ({}),
  token(stream) {
    if (stream.eatSpace()) return null
    if (stream.match(/^%%.*/)) return "comment"
    if (stream.match(/^"(?:\\.|[^"\\])*"?/)) return "string"
    if (stream.match(/^'(?:\\.|[^'\\])*'?/)) return "string"
    if (stream.match(new RegExp(`^(?:${KEYWORDS})(?![\\w-])`))) return "keyword"
    if (stream.match(/^(?:LR|RL|TB|BT|TD)(?![\w-])/)) return "atom"
    if (stream.match(/^(?:-->>|-->|---|-.->|==>|--x|--o|~~~|\|)/)) return "operator"
    if (stream.match(/^\d+(?:\.\d+)?/)) return "number"
    if (stream.match(/^[A-Za-z_][\w.-]*/)) return "variableName"
    stream.next()
    return "punctuation"
  },
  tokenTable: {
    comment: tags.lineComment,
    string: tags.string,
    keyword: tags.keyword,
    atom: tags.atom,
    operator: tags.operator,
    number: tags.number,
    variableName: tags.variableName,
    punctuation: tags.punctuation,
  },
})

function highlightStyle(dark: boolean) {
  return HighlightStyle.define([
    { tag: tags.keyword, color: dark ? "#f0abfc" : "#a21caf", fontWeight: "600" },
    { tag: tags.string, color: dark ? "#6ee7b7" : "#047857" },
    { tag: tags.lineComment, color: dark ? "#9ca3af" : "#6b7280", fontStyle: "italic" },
    { tag: tags.number, color: dark ? "#fdba74" : "#c2410c" },
    { tag: tags.operator, color: dark ? "#fcd34d" : "#b45309" },
    { tag: tags.atom, color: dark ? "#7dd3fc" : "#0369a1" },
    { tag: tags.variableName, color: dark ? "#c4b5fd" : "#6d28d9" },
    { tag: tags.punctuation, color: dark ? "#9ca3af" : "#6b7280" },
  ])
}

function editorTheme(dark: boolean) {
  return EditorView.theme({
    "&": {
      height: "100%",
      backgroundColor: "transparent",
      color: "var(--foreground)",
      fontSize: "12px",
    },
    ".cm-scroller": {
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
      lineHeight: "1.55",
      overflow: "auto",
    },
    ".cm-content": {
      padding: "10px 0",
      caretColor: "var(--foreground)",
      minHeight: "100%",
    },
    ".cm-line": { padding: "0 12px" },
    ".cm-gutters": {
      backgroundColor: "transparent",
      color: "var(--muted-foreground)",
      border: "none",
    },
    ".cm-activeLine": { backgroundColor: "color-mix(in oklch, var(--brand) 7%, transparent)" },
    ".cm-activeLineGutter": { backgroundColor: "transparent", color: "var(--foreground)" },
    ".cm-selectionBackground, ::selection": {
      backgroundColor: "color-mix(in oklch, var(--brand) 28%, transparent) !important",
    },
    ".cm-cursor": { borderLeftColor: "var(--foreground)" },
    ".cm-placeholder": { color: "var(--muted-foreground)", opacity: "0.6" },
  }, { dark })
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
  const hostRef = useRef<HTMLDivElement>(null)
  const viewRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const onFocusRef = useRef(onFocus)
  const readOnlyCompartment = useRef(new Compartment())
  const themeCompartment = useRef(new Compartment())
  const isDark = useThemeStore((state) => state.isDark)

  onChangeRef.current = onChange
  onFocusRef.current = onFocus

  useEffect(() => {
    const host = hostRef.current
    if (!host) return
    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        mermaidLanguage,
        themeCompartment.current.of([editorTheme(isDark), syntaxHighlighting(highlightStyle(isDark))]),
        readOnlyCompartment.current.of([
          EditorState.readOnly.of(readOnly),
          EditorView.editable.of(!readOnly),
        ]),
        keymap.of([indentWithTab]),
        placeholder("flowchart LR\n  A[Start] --> B[Finish]"),
        EditorView.contentAttributes.of({ "aria-label": tr("Mermaid source") }),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) onChangeRef.current(update.state.doc.toString())
        }),
        EditorView.domEventHandlers({
          focus: () => { onFocusRef.current?.() },
        }),
      ],
    })
    const view = new EditorView({ state, parent: host })
    viewRef.current = view
    return () => {
      view.destroy()
      viewRef.current = null
    }
    // The editor is intentionally created once; value/theme/readOnly are synced
    // through effects below so text undo history survives React re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    const view = viewRef.current
    if (!view) return
    const current = view.state.doc.toString()
    if (current === value) return
    view.dispatch({
      changes: { from: 0, to: current.length, insert: value },
      annotations: Transaction.addToHistory.of(false),
    })
  }, [value])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readOnlyCompartment.current.reconfigure([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
    })
  }, [readOnly])

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeCompartment.current.reconfigure([
        editorTheme(isDark),
        syntaxHighlighting(highlightStyle(isDark)),
      ]),
    })
  }, [isDark])

  return <div ref={hostRef} data-mermaid-editor className={cn("relative w-full overflow-hidden", className)} />
}
