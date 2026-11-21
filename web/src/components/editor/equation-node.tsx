import { useEffect, useState, type ReactElement } from "react"
import {
  $getNodeByKey,
  DecoratorNode,
  type EditorConfig,
  type LexicalNode,
  type NodeKey,
  type SerializedLexicalNode,
  type Spread,
} from "lexical"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import katex from "katex"
import "katex/dist/katex.min.css"
import { tr } from "@/lib/i18n"

export type SerializedEquationNode = Spread<
  { latex: string; type: "inlineEquation"; version: 1 },
  SerializedLexicalNode
>

function InlineEquationView({ nodeKey, latex }: { nodeKey: NodeKey; latex: string }) {
  const [editor] = useLexicalComposerContext()
  const [editing, setEditing] = useState(latex.trim() === "")
  const [value, setValue] = useState(latex)

  useEffect(() => {
    setValue(latex)
    setEditing(latex.trim() === "")
  }, [latex])

  function commit() {
    const next = value.trim()
    editor.update(() => {
      const node = $getNodeByKey(nodeKey)
      if (!(node instanceof EquationNode)) return
      if (!next) {
        node.remove()
        return
      }
      const writable = node.getWritable()
      writable.__latex = next
    })
    setEditing(next === "")
  }

  if (editing) {
    return (
      <span className="inline-flex items-center gap-1 rounded border border-dashed border-brand/40 bg-brand-soft/20 px-1 py-0.5 align-middle">
        <input
          autoFocus
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onBlur={commit}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              commit()
            } else if (event.key === "Escape") {
              event.preventDefault()
              commit()
            }
          }}
          placeholder="E = mc^2"
          aria-label={tr("Inline equation")}
          className="w-32 bg-transparent px-0.5 font-mono text-[12px] outline-none"
        />
      </span>
    )
  }

  const html = katex.renderToString(latex, { displayMode: false, throwOnError: false, strict: false })
  return (
    <span
      className="inline-equation"
      title={tr("Double-click to edit")}
      onDoubleClick={() => setEditing(true)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  )
}

/** Inline (text-flow) LaTeX equation rendered with KaTeX. */
export class EquationNode extends DecoratorNode<ReactElement> {
  __latex: string

  static getType(): string {
    return "inlineEquation"
  }

  static clone(node: EquationNode): EquationNode {
    return new EquationNode(node.__latex, node.__key)
  }

  constructor(latex: string, key?: NodeKey) {
    super(key)
    this.__latex = latex
  }

  createDOM(_config: EditorConfig): HTMLElement {
    const span = document.createElement("span")
    span.className = "inline-equation-host"
    return span
  }

  updateDOM(): false {
    return false
  }

  isInline(): true {
    return true
  }

  getTextContent(): string {
    return `$${this.__latex}$`
  }

  exportJSON(): SerializedEquationNode {
    return { type: "inlineEquation", version: 1, latex: this.__latex }
  }

  static importJSON(json: SerializedEquationNode): EquationNode {
    return new EquationNode(json.latex)
  }

  decorate(): ReactElement {
    return <InlineEquationView nodeKey={this.getKey()} latex={this.__latex} />
  }
}

export function $createEquationNode(latex: string): EquationNode {
  return new EquationNode(latex)
}

export function $isEquationNode(node: LexicalNode | null | undefined): node is EquationNode {
  return node instanceof EquationNode
}
