import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  $createParagraphNode,
  $createTextNode,
  $getRoot,
  $getSelection,
  $isRangeSelection,
  COMMAND_PRIORITY_LOW,
  FORMAT_TEXT_COMMAND,
  SELECTION_CHANGE_COMMAND,
  type LexicalEditor,
  type TextFormatType,
} from "lexical"
import {
  Bold,
  Check,
  Code2,
  Italic,
  Link2,
  Strikethrough,
  Underline,
  X,
} from "lucide-react"
import { LexicalComposer } from "@lexical/react/LexicalComposer"
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin"
import { ContentEditable } from "@lexical/react/LexicalContentEditable"
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin"
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin"
import { LinkPlugin } from "@lexical/react/LexicalLinkPlugin"
import { MarkdownShortcutPlugin } from "@lexical/react/LexicalMarkdownShortcutPlugin"
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import {
  BOLD_ITALIC_STAR,
  BOLD_STAR,
  INLINE_CODE,
  ITALIC_STAR,
  LINK,
  STRIKETHROUGH,
} from "@lexical/markdown"
import { LinkNode, TOGGLE_LINK_COMMAND } from "@lexical/link"
import { mergeRegister } from "@lexical/utils"
import { MentionNode, MentionPlugin } from "@/components/editor/mention-node"
import type { Member } from "@/lib/types"
import { caretOffset } from "@/lib/caret"
import { isImeKeyEvent } from "@/lib/keyboard"
import { cn } from "@/lib/utils"
import { tr } from "@/lib/i18n"

const INLINE_TRANSFORMERS = [BOLD_ITALIC_STAR, BOLD_STAR, ITALIC_STAR, INLINE_CODE, STRIKETHROUGH, LINK]

const THEME = {
  paragraph: "m-0",
  text: {
    bold: "font-bold",
    italic: "italic",
    underline: "underline",
    strikethrough: "line-through",
    code: "inline-code",
  },
  link: "lexical-link",
}

function textToEditorState(text: string): (editor: LexicalEditor) => void {
  return (editor) => {
    editor.update(() => {
      const root = $getRoot()
      root.clear()
      const paragraph = $createParagraphNode()
      if (text) paragraph.append($createTextNode(text))
      root.append(paragraph)
    })
  }
}

export interface LexicalBlockProps {
  id: string
  text: string
  rich?: string
  placeholder: string
  className: string
  readOnly?: boolean
  resetKey?: number
  autoFocus?: boolean
  autoFocusWhere?: "start" | "end"
  autoFocusOffset?: number
  onFocus?: () => void
  onInput: (text: string, rich: string, el: HTMLElement) => void
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void
  onPaste: (text: string) => void
  members?: Member[]
}

export function LexicalBlock({
  id,
  text,
  rich,
  placeholder,
  className,
  readOnly = false,
  resetKey = 0,
  autoFocus = false,
  autoFocusWhere,
  autoFocusOffset,
  onFocus,
  onInput,
  onKeyDown,
  onPaste,
  members = [],
}: LexicalBlockProps) {
  const lastRichRef = useRef(rich ?? "")
  // Keep the guard through the current task: some browsers fire keydown
  // immediately after compositionend when Enter confirms a candidate.
  const composingRef = useRef(false)
  const composerKey = `${id}:${readOnly ? "ro" : "rw"}:${resetKey}`

  const initialConfig = {
    namespace: `motion-block-${id}`,
    theme: THEME,
    nodes: [LinkNode, MentionNode],
    editable: !readOnly,
    editorState: rich || textToEditorState(text),
    onError(error: Error) {
      // Lexical can recover from malformed remote state; never crash the page.
      console.warn("Lexical block recovered from an error", error)
    },
  }

  return (
    <LexicalComposer key={composerKey} initialConfig={initialConfig}>
      <div className="relative w-full">
        <RichTextPlugin
          contentEditable={
            <ContentEditable
              id={`block-input-${id}`}
              data-block-input
              data-lexical-input
              role="textbox"
              aria-label={placeholder || tr("Write something…")}
              aria-multiline="true"
              aria-readonly={readOnly}
              spellCheck
              className={cn("block-input lexical-input w-full outline-none", className)}
              onFocus={onFocus}
              onCompositionStart={() => {
                composingRef.current = true
              }}
              onCompositionEnd={() => {
                window.setTimeout(() => {
                  composingRef.current = false
                }, 0)
              }}
              onKeyDownCapture={(event) => {
                if (composingRef.current || isImeKeyEvent(event)) return
                onKeyDown(event as unknown as React.KeyboardEvent<HTMLElement>)
                if (event.defaultPrevented) {
                  event.nativeEvent.stopImmediatePropagation()
                }
              }}
              onPaste={(event) => {
                const pasted = event.clipboardData.getData("text/plain")
                if (!pasted) return
                event.preventDefault()
                event.nativeEvent.stopImmediatePropagation()
                onPaste(pasted)
              }}
            />
          }
          placeholder={
            <div className="lexical-placeholder pointer-events-none absolute left-0 top-0 whitespace-pre text-muted-foreground/50">
              {placeholder}
            </div>
          }
          ErrorBoundary={LexicalErrorBoundary}
        />
        <HistoryPlugin />
        <LinkPlugin />
        <MarkdownShortcutPlugin transformers={INLINE_TRANSFORMERS} />
        <BlockStateBridge
          id={id}
          rich={rich}
          text={text}
          lastRichRef={lastRichRef}
          onInput={onInput}
        />
        <MentionPlugin members={members} />
        <FocusBridge
          id={id}
          autoFocus={autoFocus}
          autoFocusWhere={autoFocusWhere}
          autoFocusOffset={autoFocusOffset}
        />
        {!readOnly && <FloatingToolbar />}
        <EditableBridge editable={!readOnly} />
      </div>
    </LexicalComposer>
  )
}

function BlockStateBridge({
  id,
  rich,
  text,
  lastRichRef,
  onInput,
}: {
  id: string
  rich?: string
  text: string
  lastRichRef: React.MutableRefObject<string>
  onInput: (text: string, rich: string, el: HTMLElement) => void
}) {
  const [editor] = useLexicalComposerContext()
  const suppressChangeRef = useRef(false)

  useEffect(() => {
    const current = JSON.stringify(editor.getEditorState().toJSON())
    if (rich && rich === current) {
      lastRichRef.current = rich
      return
    }
    if (!rich && editor.getEditorState().read(() => $getRoot().getTextContent()) === text) {
      return
    }
    if (rich && rich === lastRichRef.current) return
    const currentText = editor.getEditorState().read(() => $getRoot().getTextContent())
    if (
      editor.getRootElement() === document.activeElement &&
      text.length < currentText.length &&
      currentText.startsWith(text)
    ) {
      // A stale prop update from a fast keystroke. Keep the newer editor state.
      return
    }

    const root = editor.getRootElement()
    const focused = root === document.activeElement
    const offset = focused && root ? caretOffset(root) : null
    const applySelection = () => {
      if (offset == null) return
      let remaining = Math.max(0, offset)
      for (const node of $getRoot().getAllTextNodes()) {
        const size = node.getTextContentSize()
        if (remaining <= size) {
          node.select(remaining, remaining)
          return
        }
        remaining -= size
      }
      $getRoot().selectEnd()
    }

    suppressChangeRef.current = true
    window.setTimeout(() => {
      suppressChangeRef.current = false
    }, 0)
    // The change came from a collaborator, a restore, or an AI edit.
    if (rich) {
      try {
        const parsed = editor.parseEditorState(rich)
        lastRichRef.current = rich
        editor.setEditorState(parsed)
        if (focused) {
          editor.update(applySelection)
        }
        return
      } catch {
        // Fall back to plain text if the stored document is malformed.
      }
    }
    editor.update(() => {
      const rootNode = $getRoot()
      rootNode.clear()
      const paragraph = $createParagraphNode()
      if (text) paragraph.append($createTextNode(text))
      rootNode.append(paragraph)
      applySelection()
    })
  }, [editor, rich, text, lastRichRef])

  return (
    <OnChangePlugin
      ignoreSelectionChange
      onChange={(state) => {
        if (suppressChangeRef.current) return
        const next = JSON.stringify(state.toJSON())
        if (next === lastRichRef.current) return
        lastRichRef.current = next
        const plain = state.read(() => $getRoot().getTextContent())
        const root = editor.getRootElement()
        if (root) onInput(plain, next, root)
      }}
    />
  )
}


/** Keeps focus commands working even though Lexical owns the selection. */
function FocusBridge({
  id,
  autoFocus,
  autoFocusWhere,
  autoFocusOffset,
}: {
  id: string
  autoFocus?: boolean
  autoFocusWhere?: "start" | "end"
  autoFocusOffset?: number
}) {
  const [editor] = useLexicalComposerContext()
  function focusAt(where: "start" | "end", offset?: number) {
    if (offset == null && editor.getRootElement() === document.activeElement) return
    if (
      offset == null &&
      editor.getEditorState().read(() => $getRoot().getTextContent().length === 0)
    ) {
      // An empty block has no meaningful start/end selection. Setting one
      // here can be committed after the user's first keystroke and move the
      // caret back to the beginning.
      editor.focus()
      return
    }
    editor.focus()
    editor.update(() => {
      const root = $getRoot()
      if (offset != null) {
        let remaining = Math.max(0, offset)
        for (const node of root.getAllTextNodes()) {
          const size = node.getTextContentSize()
          if (remaining <= size) {
            node.select(remaining, remaining)
            return
          }
          remaining -= size
        }
      }
      if (where === "start") root.selectStart()
      else root.selectEnd()
    })
  }

  useLayoutEffect(() => {
    if (!autoFocus) return
    focusAt(autoFocusWhere ?? "end", autoFocusOffset)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoFocus])
  useEffect(() => {
    function onFocus(event: Event) {
      const detail = (event as CustomEvent<{ id: string; where?: "start" | "end"; offset?: number }>).detail
      if (!detail || detail.id !== id) return
      focusAt(detail.where ?? "end", detail.offset)
    }

    window.addEventListener("motion:focus-block", onFocus)
    return () => window.removeEventListener("motion:focus-block", onFocus)
  }, [editor, id])
  return null
}

function EditableBridge({ editable }: { editable: boolean }) {
  const [editor] = useLexicalComposerContext()
  useEffect(() => {
    editor.setEditable(editable)
  }, [editor, editable])
  return null
}

function FloatingToolbar() {
  const [editor] = useLexicalComposerContext()
  const [rect, setRect] = useState<{ left: number; top: number } | null>(null)
  const [formats, setFormats] = useState<Set<TextFormatType>>(new Set())
  const [linkOpen, setLinkOpen] = useState(false)
  const [linkURL, setLinkURL] = useState("https://")

  useEffect(() => {
    function readSelection() {
      editor.getEditorState().read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection) || selection.isCollapsed()) {
          setRect(null)
          return
        }
        const root = editor.getRootElement()
        const dom = window.getSelection()
        if (!root || !dom || dom.rangeCount === 0) {
          setRect(null)
          return
        }
        const range = dom.getRangeAt(0)
        if (!root.contains(range.commonAncestorContainer)) {
          setRect(null)
          return
        }
        const box = range.getBoundingClientRect()
        if (!box.width && !box.height) {
          setRect(null)
          return
        }
        setFormats(
          new Set(
            (["bold", "italic", "underline", "strikethrough", "code"] as TextFormatType[]).filter(
              (format) => selection.hasFormat(format),
            ),
          ),
        )
        setRect({
          left: Math.min(Math.max(12, box.left + box.width / 2), window.innerWidth - 120),
          top: Math.max(52, box.top - 44),
        })
      })
    }
    const unregister = mergeRegister(
      editor.registerUpdateListener(readSelection),
      editor.registerCommand(
        SELECTION_CHANGE_COMMAND,
        () => {
          readSelection()
          return false
        },
        COMMAND_PRIORITY_LOW,
      ),
    )
    const hide = () => setRect(null)
    window.addEventListener("scroll", hide, true)
    window.addEventListener("resize", hide)
    return () => {
      unregister()
      window.removeEventListener("scroll", hide, true)
      window.removeEventListener("resize", hide)
    }
  }, [editor])

  if (!rect) return null

  const commands: { key: TextFormatType; icon: typeof Bold; label: string }[] = [
    { key: "bold", icon: Bold, label: "Bold" },
    { key: "italic", icon: Italic, label: "Italic" },
    { key: "underline", icon: Underline, label: "Underline" },
    { key: "strikethrough", icon: Strikethrough, label: "Strikethrough" },
    { key: "code", icon: Code2, label: "Inline code" },
  ]

  return createPortal(
    <div
      className="fixed z-40 flex -translate-x-1/2 items-center gap-0.5 rounded-lg border bg-popover p-1 shadow-xl animate-in fade-in-0 zoom-in-95"
      style={{ left: rect.left, top: rect.top }}
      onMouseDown={(event) => event.preventDefault()}
    >
      {commands.map(({ key, icon: Icon, label }) => (
        <button
          key={key}
          type="button"
          aria-label={tr(label)}
          aria-pressed={formats.has(key)}
          onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, key)}
          className={cn(
            "flex size-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground",
            formats.has(key) && "bg-brand-soft text-brand",
          )}
        >
          <Icon className="size-3.5" />
        </button>
      ))}
      <span className="mx-0.5 h-5 w-px bg-border" />
      {linkOpen ? (
        <form
          className="flex items-center gap-1"
          onSubmit={(e) => {
            e.preventDefault()
            if (linkURL.trim()) editor.dispatchCommand(TOGGLE_LINK_COMMAND, linkURL.trim())
            setLinkOpen(false)
          }}
        >
          <input
            autoFocus
            value={linkURL}
            onChange={(e) => setLinkURL(e.target.value)}
            placeholder={tr("Link URL")}
            inputMode="url"
            className="h-7 w-44 rounded-md border bg-background px-2 text-xs outline-none focus:border-brand"
          />
          <button type="submit" aria-label={tr("Apply")} className="flex size-7 items-center justify-center rounded-md bg-brand text-xs font-medium text-white">
            <Check className="size-3.5" />
          </button>
          <button type="button" aria-label={tr("Cancel")} onClick={() => setLinkOpen(false)} className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent">
            <X className="size-3.5" />
          </button>
        </form>
      ) : (
        <button
          type="button"
          aria-label={tr("Link")}
          onClick={() => {
            setLinkURL("https://")
            setLinkOpen(true)
          }}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground"
        >
          <Link2 className="size-3.5" />
        </button>
      )}
    </div>,
    document.body,
  )
}
