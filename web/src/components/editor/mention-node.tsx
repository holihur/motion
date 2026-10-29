import { useEffect, useMemo, useRef, useState } from "react"
import { createPortal } from "react-dom"
import {
  $getSelection,
  $isRangeSelection,
  $isTextNode,
  $createTextNode,
  COMMAND_PRIORITY_HIGH,
  KEY_DOWN_COMMAND,
  TextNode,
  type EditorConfig,
  type LexicalEditor,
  type SerializedTextNode,
} from "lexical"
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext"
import type { Member } from "@/lib/types"
import { tr } from "@/lib/i18n"
import { isImeKeyEvent } from "@/lib/keyboard"
import { initials } from "@/lib/utils"

const MENTION_COLORS = ["#0ea5e9", "#8b5cf6", "#f59e0b", "#10b981", "#ef4444", "#ec4899", "#14b8a6", "#6366f1"]

function colorFor(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) | 0
  return MENTION_COLORS[Math.abs(hash) % MENTION_COLORS.length]
}

export class MentionNode extends TextNode {
  __userId: string
  __name: string
  __color: string

  static getType(): string {
    return "mention"
  }

  static clone(node: MentionNode): MentionNode {
    return new MentionNode(node.__text, node.__userId, node.__name, node.__color, node.__key)
  }

  constructor(text: string, userId: string, name: string, color: string, key?: string) {
    super(text, key)
    this.__userId = userId
    this.__name = name
    this.__color = color
  }

  createDOM(config: EditorConfig): HTMLElement {
    const dom = super.createDOM(config)
    dom.classList.add("lexical-mention")
    dom.dataset.userId = this.__userId
    dom.style.setProperty("--mention-color", this.__color)
    return dom
  }

  exportJSON(): SerializedTextNode & { userId: string; name: string; color: string } {
    return {
      ...super.exportJSON(),
      type: "mention",
      userId: this.__userId,
      name: this.__name,
      color: this.__color,
    }
  }

  static importJSON(json: ReturnType<MentionNode["exportJSON"]>): MentionNode {
    return new MentionNode(json.text, json.userId, json.name, json.color)
  }

  isTextEntity(): true {
    return true
  }
}

export function $createMentionNode(name: string, userId: string, color = colorFor(userId)): MentionNode {
  return new MentionNode(`@${name}`, userId, name, color)
}

interface MentionPopup {
  query: string
  options: Member[]
  selected: number
  left: number
  top: number
}

function mentionMatch(before: string) {
  const match = /(?:^|[\s(])@([\p{L}\p{N}_.-]*)$/u.exec(before)
  if (!match) return null
  const at = before.lastIndexOf("@")
  return { start: at, query: match[1] }
}

export function MentionPlugin({ members }: { members: Member[] }) {
  const [editor] = useLexicalComposerContext()
  const [popup, setPopup] = useState<MentionPopup | null>(null)
  const options = useMemo(
    () => members.filter((member) => member.userId && member.name),
    [members],
  )
  const debounceRef = useRef<number | null>(null)

  useEffect(() => {
    return editor.registerUpdateListener(({ editorState }) => {
      editorState.read(() => {
        const selection = $getSelection()
        if (!$isRangeSelection(selection) || !selection.isCollapsed()) {
          if (debounceRef.current) window.clearTimeout(debounceRef.current)
          setPopup(null)
          return
        }
        const node = selection.anchor.getNode()
        if (!$isTextNode(node) || node instanceof MentionNode) {
          if (debounceRef.current) window.clearTimeout(debounceRef.current)
          setPopup(null)
          return
        }
        const before = node.getTextContent().slice(0, selection.anchor.offset)
        const match = mentionMatch(before)
        if (!match) {
          if (debounceRef.current) window.clearTimeout(debounceRef.current)
          setPopup(null)
          return
        }
        const query = before.slice(before.lastIndexOf("@") + 1).toLowerCase()
        if (debounceRef.current) window.clearTimeout(debounceRef.current)
        debounceRef.current = window.setTimeout(() => {
          const filtered = options.filter((member) =>
            `${member.name} ${member.email}`.toLowerCase().includes(query),
          )
          if (filtered.length === 0) {
            setPopup(null)
            return
          }
          const domSelection = window.getSelection()
          const range = domSelection && domSelection.rangeCount > 0 ? domSelection.getRangeAt(0) : null
          const rect = range?.getBoundingClientRect()
          setPopup((current) => ({
            query, options: filtered,
            selected: Math.min(current?.query === query ? current.selected : 0, filtered.length - 1),
            left: rect?.left ?? 0,
            top: (rect?.bottom ?? 0) + 6,
          }))
        }, 300)
      })
    })
  }, [editor, options])

  function insertMember(member: Member) {
    editor.update(() => {
      const selection = $getSelection()
      if (!$isRangeSelection(selection) || !selection.isCollapsed()) return
      const node = selection.anchor.getNode()
      if (!$isTextNode(node)) return
      const text = node.getTextContent()
      const offset = selection.anchor.offset
      const match = mentionMatch(text.slice(0, offset))
      if (!match) return
      const suffix = text.slice(offset)
      node.setTextContent(text.slice(0, match.start))
      const after = $createTextNode(suffix)
      const space = $createTextNode(" ")
      node.insertAfter(after)
      node.insertAfter(space)
      node.insertAfter($createMentionNode(member.name, member.userId, colorFor(member.userId)))
      after.select(0, 0)
    })
    setPopup(null)
  }

  useEffect(() => {
    return editor.registerCommand(
      KEY_DOWN_COMMAND,
      (event) => {
        if (!popup) return false
        if (isImeKeyEvent(event)) return false
        if (event.key === "ArrowDown") {
          event.preventDefault()
          setPopup((current) => current ? { ...current, selected: (current.selected + 1) % current.options.length } : current)
          return true
        }
        if (event.key === "ArrowUp") {
          event.preventDefault()
          setPopup((current) => current ? { ...current, selected: (current.selected - 1 + current.options.length) % current.options.length } : current)
          return true
        }
        if (event.key === "Enter" || event.key === "Tab") {
          event.preventDefault()
          const member = popup.options[popup.selected]
          if (member) insertMember(member)
          return true
        }
        if (event.key === "Escape") {
          event.preventDefault()
          setPopup(null)
          return true
        }
        return false
      },
      COMMAND_PRIORITY_HIGH,
    )
  }, [editor, popup])

  if (!popup) return null
  return createPortal(
    <div
      data-mention-popup
      className="fixed z-[60] w-72 overflow-hidden rounded-xl border bg-popover p-1.5 shadow-2xl animate-in fade-in-0 zoom-in-95"
      style={{ left: Math.min(popup.left, window.innerWidth - 300), top: Math.min(popup.top, window.innerHeight - 240) }}
    >
      <div className="px-2 pb-1.5 pt-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {tr("Mention someone")}
      </div>
      <div className="max-h-56 overflow-y-auto thin-scrollbar">
        {popup.options.map((member, index) => (
          <button
            key={member.userId}
            type="button"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => insertMember(member)}
            onMouseEnter={() => setPopup((current) => current ? { ...current, selected: index } : current)}
            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-left transition ${index === popup.selected ? "bg-accent" : "hover:bg-accent/60"}`}
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full text-[9px] font-semibold text-white" style={{ backgroundColor: colorFor(member.userId) }}>
              {initials(member.name)}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-medium">{member.name}</span>
              <span className="block truncate text-[10px] text-muted-foreground">{member.email}</span>
            </span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  )
}
