import { useEffect, useMemo, useRef, useState } from "react"
import { Plus } from "lucide-react"
import type { Block, BlockType, Comment, Member } from "@/lib/types"
import { uid } from "@/lib/utils"
import { tr } from "@/lib/i18n"
import { markOnboardingStep } from "@/lib/onboarding"
import { caretOffset, caretRect, focusBlockById, setCaret } from "@/lib/caret"
import { BlockRow } from "@/components/editor/block-row"
import { SlashMenu, type SlashState } from "@/components/editor/slash-menu"
import { VirtualBlockList } from "@/components/editor/virtual-block-list"
import type { HeadingItem } from "@/components/editor/rich-blocks"
import { defaultChartTable, defaultGanttTable } from "@/components/editor/data-blocks"
import { defaultColumnsTable } from "@/components/editor/link-blocks"
import { hasMarkdownSyntax, parseMarkdownToBlocks } from "@/lib/markdown-import"
import type { RealtimePresence } from "@/lib/realtime"
import { filterCommands, type SlashCommand } from "@/components/editor/commands"

const LIST_TYPES: BlockType[] = ["bulleted", "numbered", "todo"]
const TOGGLE_TYPES: BlockType[] = ["toggle", "toggleHeading1", "toggleHeading2", "toggleHeading3"]

const SHORTCUTS: [string, BlockType][] = [
  ["### ", "heading3"],
  ["## ", "heading2"],
  ["# ", "heading1"],
  ["- ", "bulleted"],
  ["* ", "bulleted"],
  ["1. ", "numbered"],
  ["[] ", "todo"],
  ["[ ] ", "todo"],
  ["> ", "quote"],
  ["``` ", "code"],
  ["```", "code"],
]

function createBlock(type: BlockType = "paragraph"): Block {
  return {
    id: uid(),
    type,
    text: type === "diagram" ? DEFAULT_DIAGRAM : "",
    checked: false,
    ...(type === "code" ? { language: "auto" } : {}),
    ...(type === "callout" ? { color: "amber" } : {}),
    ...(type === "table"
      ? {
          table: {
            columns: ["Column 1", "Column 2", "Column 3"],
            rows: [["", "", ""], ["", "", ""]],
            header: true,
          },
        }
      : {}),
    ...(type === "gantt" ? { table: defaultGanttTable() } : {}),
    ...(type === "chart" ? { table: defaultChartTable(), language: "bar" } : {}),
    ...(type === "columns" ? { table: defaultColumnsTable() } : {}),
  }
}

const DEFAULT_DIAGRAM = `flowchart LR
  Idea[Idea] --> Draft[Draft]
  Draft --> Review{Review}
  Review -->|Yes| Ship[Ship it]
  Review -->|No| Draft`

function focusAt(id: string, offset: number) {
  requestAnimationFrame(() => {
    window.dispatchEvent(
      new CustomEvent("motion:focus-block", { detail: { id, where: "end", offset } }),
    )
    const el = document.getElementById(`block-input-${id}`) as HTMLElement | null
    if (!el || el.hasAttribute("data-lexical-input")) return
    el.focus()
    if (el instanceof HTMLTextAreaElement) {
      el.setSelectionRange(offset, offset)
    } else {
      setCaret(el, offset)
    }
  })
}

function focusSoon(id: string, where: "start" | "end" = "end") {
  requestAnimationFrame(() => focusBlockById(id, where))
}

export function BlockEditor({
  blocks,
  onChange,
  onFocusBlock,
  remoteFocus,
  commentCounts,
  blockComments,
  onOpenComments,
  onCommentBlock,
  scrollParentRef,
  readOnly = false,
  breadcrumb = [],
  workspaceId = "",
  members = [],
}: {
  blocks: Block[]
  onChange: (blocks: Block[]) => void
  onFocusBlock?: (blockId: string) => void
  remoteFocus?: Record<string, RealtimePresence[]>
  commentCounts?: Record<string, number>
  blockComments?: Record<string, Comment[]>
  onOpenComments?: () => void
  onCommentBlock?: (blockId: string) => void
  scrollParentRef?: React.RefObject<HTMLDivElement | null>
  readOnly?: boolean
  breadcrumb?: { id: string; title: string; icon: string }[]
  workspaceId?: string
  members?: Member[]
}) {
  const blocksRef = useRef(blocks)
  blocksRef.current = blocks
  const resetKeysRef = useRef<Record<string, number>>({})
  const [, setResetVersion] = useState(0)
  const [autoFocus, setAutoFocus] = useState<{ id: string; where: "start" | "end"; offset?: number } | null>(null)

  useEffect(() => {
    if (!autoFocus) return
    const timer = window.setTimeout(() => setAutoFocus(null), 1200)
    return () => window.clearTimeout(timer)
  }, [autoFocus])
  function bumpReset(id: string) {
    resetKeysRef.current[id] = (resetKeysRef.current[id] ?? 0) + 1
    setResetVersion((value) => value + 1)
  }

  function focusNew(id: string, where: "start" | "end" = "end", offset?: number) {
    setAutoFocus({ id, where, offset })
  }
  const [slash, setSlash] = useState<SlashState | null>(null)
  const [dragging, setDragging] = useState<number | null>(null)
  const [drop, setDrop] = useState<{ index: number; position: "before" | "after" } | null>(null)

  const commands = useMemo(() => filterCommands(slash?.query ?? ""), [slash?.query])

  useEffect(() => {
    function onInsert() {
      if (readOnly || blocks.length === 0) return
      const index = blocks.length - 1
      const fallback = document.getElementById(`block-input-${blocks[index].id}`)
      openSlash(index, "insert", "", fallback?.getBoundingClientRect() ?? null)
    }
    window.addEventListener("motion:open-insert", onInsert)
    return () => window.removeEventListener("motion:open-insert", onInsert)
  }, [blocks, readOnly])

  const headings = useMemo<HeadingItem[]>(
    () =>
      blocks
        .filter((block) => ["heading1", "heading2", "heading3", "toggleHeading1", "toggleHeading2", "toggleHeading3"].includes(block.type))
        .map((block) => ({
          id: block.id,
          text: block.text,
          level: block.type.includes("1") ? 1 : block.type.includes("2") ? 2 : 3,
        })),
    [blocks],
  )

  const visibleEntries = useMemo(() => {
    const entries: { block: Block; index: number }[] = []
    let hiddenIndent: number | null = null
    blocks.forEach((block, index) => {
      const indent = block.indent ?? 0
      if (hiddenIndent !== null && indent > hiddenIndent) return
      if (hiddenIndent !== null) hiddenIndent = null
      entries.push({ block, index })
      if (TOGGLE_TYPES.includes(block.type) && block.collapsed) hiddenIndent = indent
    })
    return entries
  }, [blocks])

  const toggleHasChildren = useMemo(() => {
    const result = new Set<string>()
    blocks.forEach((block, index) => {
      if (!TOGGLE_TYPES.includes(block.type)) return
      const indent = block.indent ?? 0
      for (let next = index + 1; next < blocks.length; next += 1) {
        const nextIndent = blocks[next].indent ?? 0
        if (nextIndent <= indent) break
        result.add(block.id)
      }
    })
    return result
  }, [blocks])

  const numbers = useMemo(() => {
    let current = 0
    let previousNumbered = false
    return blocks.map((block) => {
      if (block.type === "numbered") {
        current = previousNumbered ? current + 1 : 1
        previousNumbered = true
        return current
      }
      previousNumbered = false
      return 0
    })
  }, [blocks])

  function commit(next: Block[]) {
    blocksRef.current = next
    onChange(next)
  }

  function updateBlock(index: number, patch: Partial<Block>) {
    commit(blocksRef.current.map((block, position) => (position === index ? { ...block, ...patch } : block)))
  }

  function openSlash(
    index: number,
    mode: "convert" | "insert",
    query: string,
    rect?: DOMRect | null,
  ) {
    const fallback = document.getElementById(`block-input-${blocksRef.current[index]?.id}`)
    const box = rect ?? (fallback ? caretRect(fallback) : null) ?? fallback?.getBoundingClientRect()
    setSlash({
      blockId: blocksRef.current[index]?.id ?? "",
      index,
      mode,
      query,
      x: box?.left ?? 220,
      y: box?.bottom ?? 220,
      selected: 0,
    })
  }

  function closeSlash() {
    setSlash(null)
  }

  function convertBlock(index: number, type: BlockType, clearText = false) {
    const block = blocksRef.current[index]
    if (!block) return
    const clear = clearText || type === "divider" || type === "image" || type === "table" || type === "diagram"
    const nextText = clear
      ? type === "diagram"
        ? DEFAULT_DIAGRAM
        : ""
      : block.text
    updateBlock(index, {
      type,
      text: nextText,
      rich: "",
      checked: false,
      ...(type === "code" ? { language: block.language || "auto" } : {}),
      ...(type === "callout" ? { color: block.color || "amber" } : {}),
      ...(type === "table"
        ? {
            table: block.table ?? {
              columns: ["Column 1", "Column 2", "Column 3"],
              rows: [["", "", ""], ["", "", ""]],
              header: true,
            },
          }
        : {}),
      ...(type === "gantt"
        ? { table: block.type === "gantt" && block.table ? block.table : defaultGanttTable() }
        : {}),
      ...(type === "chart"
        ? {
            table: block.type === "chart" && block.table ? block.table : defaultChartTable(),
            language: "bar",
          }
        : {}),
      ...(type === "columns" ? { table: block.type === "columns" && block.table ? block.table : defaultColumnsTable() } : {}),
    })
    focusNew(block.id, clear ? "start" : "end")
    closeSlash()
  }

  function applyCommand(command: SlashCommand) {
    if (!slash) return
    markOnboardingStep("slash")
    const index = slash.index
    if (slash.mode === "insert") {
      const block = createBlock(command.type)
      const next = [...blocksRef.current.slice(0, index + 1), block, ...blocksRef.current.slice(index + 1)]
      if (command.type === "divider" || command.type === "image") {
        const paragraph = createBlock("paragraph")
        next.splice(index + 2, 0, paragraph)
        commit(next)
        focusNew(paragraph.id, "start")
      } else {
        commit(next)
        focusNew(block.id, "end")
      }
    } else {
      convertBlock(index, command.type, true)
    }
    closeSlash()
  }

  function handleInput(index: number, text: string, el: HTMLElement, rich?: string) {
    const block = blocksRef.current[index]
    if (!block) return

    if (block.type === "code") {
      updateBlock(index, { text })
      return
    }

    const shortcut = SHORTCUTS.find(([prefix]) => text === prefix)
    if (shortcut) {
      const [, type] = shortcut
      updateBlock(index, {
        type,
        text: "",
        rich: "",
        checked: false,
        ...(type === "code" ? { language: "auto" } : {}),
      })
      closeSlash()
      focusNew(block.id, "start")
      return
    }

    updateBlock(index, { text, ...(rich !== undefined ? { rich } : {}) })

    const isSlashForThisBlock = slash?.blockId === block.id && slash.mode === "convert"
    if (!isSlashForThisBlock && text.startsWith("/") && !text.includes("\n") && text.length <= 26) {
      // Open on the first slash even when the browser batches "/" and the next
      // character into one input event (fast typists and automation).
      openSlash(index, "convert", text.slice(1), caretRect(el))
      return
    }
    if (isSlashForThisBlock) {
      if (text.startsWith("/") && !text.includes("\n") && text.length <= 26) {
        const rect = caretRect(el)
        setSlash((current) =>
          current
            ? {
                ...current,
                query: text.slice(1),
                x: rect?.left ?? current.x,
                y: rect?.bottom ?? current.y,
                selected: 0,
              }
            : current,
        )
      } else {
        closeSlash()
      }
      return
    }
    if (slash?.mode === "insert" && slash.blockId === block.id) {
      closeSlash()
    }
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLElement>, index: number) {
    const block = blocksRef.current[index]
    if (!block) return

    if (slash && slash.blockId === block.id) {
      if (event.key === "ArrowDown") {
        event.preventDefault()
        if (commands.length > 0) {
          setSlash({ ...slash, selected: (slash.selected + 1) % commands.length })
        }
        return
      }
      if (event.key === "ArrowUp") {
        event.preventDefault()
        if (commands.length > 0) {
          setSlash({
            ...slash,
            selected: (slash.selected - 1 + commands.length) % commands.length,
          })
        }
        return
      }
      if (event.key === "Enter") {
        event.preventDefault()
        const command = commands[slash.selected]
        if (command) applyCommand(command)
        return
      }
      if (event.key === "Escape") {
        event.preventDefault()
        closeSlash()
        return
      }
    }

    if (block.type === "code") {
      handleCodeKeyDown(event, index, block)
      return
    }

    if (event.key === "Tab") {
      event.preventDefault()
      const next = Math.max(0, Math.min(8, (block.indent ?? 0) + (event.shiftKey ? -1 : 1)))
      if (next !== (block.indent ?? 0)) updateBlock(index, { indent: next })
      return
    }

    if (block.type === "divider" || block.type === "image") {
      if (event.key === "Enter") {
        event.preventDefault()
        const paragraph = createBlock("paragraph")
        commit([...blocksRef.current.slice(0, index + 1), paragraph, ...blocksRef.current.slice(index + 1)])
        focusNew(paragraph.id, "start")
      } else if ((event.key === "Backspace" || event.key === "Delete") && block.type === "divider") {
        event.preventDefault()
        deleteBlock(index)
      } else if (event.key === "ArrowUp" && index > 0) {
        event.preventDefault()
        focusSoon(blocksRef.current[index - 1].id, "end")
      } else if (event.key === "ArrowDown" && index < blocksRef.current.length - 1) {
        event.preventDefault()
        focusSoon(blocksRef.current[index + 1].id, "start")
      }
      return
    }

    const el = event.currentTarget as HTMLElement

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault()
      const offset = caretOffset(el)
      const before = block.text.slice(0, offset)
      const after = block.text.slice(offset)

      if (LIST_TYPES.includes(block.type) && block.text.trim() === "") {
        updateBlock(index, { type: "paragraph", checked: false })
        focusSoon(block.id, "end")
        return
      }

      let nextType: BlockType = "paragraph"
      if (block.type === "bulleted" || block.type === "numbered" || block.type === "todo") {
        nextType = block.type
      }
      if (TOGGLE_TYPES.includes(block.type) && block.collapsed) {
        updateBlock(index, { collapsed: false })
      }
      const fresh = createBlock(nextType)
      fresh.text = after
      fresh.rich = ""
      fresh.indent = TOGGLE_TYPES.includes(block.type) ? (block.indent ?? 0) + 1 : block.indent ?? 0
      commit([
        ...blocksRef.current.slice(0, index),
        { ...block, text: before, rich: after ? "" : block.rich },
        fresh,
        ...blocksRef.current.slice(index + 1),
      ])
      if (after) bumpReset(block.id)
      focusNew(fresh.id, "start")
      return
    }

    if (event.key === "Backspace" && caretOffset(el) === 0) {
      if (index === 0) {
        if (block.type !== "paragraph" && block.text === "") {
          event.preventDefault()
          updateBlock(index, { type: "paragraph" })
        }
        return
      }
      const previous = blocksRef.current[index - 1]
      event.preventDefault()
      if (previous.type === "divider" || previous.type === "image") return
      if (block.text === "") {
        commit(blocksRef.current.filter((_, position) => position !== index))
        focusSoon(previous.id, "end")
        return
      }
      const merged = { ...previous, text: previous.text + block.text, rich: "" }
      const offset = previous.text.length
      commit([
        ...blocksRef.current.slice(0, index - 1),
        merged,
        ...blocksRef.current.slice(index + 1),
      ])
      bumpReset(merged.id)
      focusNew(merged.id, "end", offset)
      return
    }

    if (event.key === "ArrowUp" && !event.shiftKey && caretOffset(el) === 0 && index > 0) {
      event.preventDefault()
      focusSoon(blocksRef.current[index - 1].id, "end")
      return
    }
    if (
      event.key === "ArrowDown" &&
      !event.shiftKey &&
      caretOffset(el) === block.text.length &&
      index < blocksRef.current.length - 1
    ) {
      event.preventDefault()
      focusSoon(blocksRef.current[index + 1].id, "start")
    }
  }

  function handleCodeKeyDown(
    event: React.KeyboardEvent<HTMLElement>,
    index: number,
    block: Block,
  ) {
    const el = event.currentTarget as HTMLTextAreaElement
    if (event.key === "Tab") {
      event.preventDefault()
      const start = el.selectionStart
      const end = el.selectionEnd
      const text = block.text.slice(0, start) + "  " + block.text.slice(end)
      updateBlock(index, { text })
      requestAnimationFrame(() => {
        const next = document.getElementById(`block-input-${block.id}`) as HTMLTextAreaElement
        next?.setSelectionRange(start + 2, start + 2)
      })
      return
    }
    if (event.key === "Backspace" && el.selectionStart === 0 && el.selectionEnd === 0) {
      if (block.text === "") {
        event.preventDefault()
        deleteBlock(index)
      }
      return
    }
    if (event.key === "ArrowUp" && el.selectionStart === 0 && index > 0) {
      event.preventDefault()
      focusSoon(blocksRef.current[index - 1].id, "end")
      return
    }
    if (
      event.key === "ArrowDown" &&
      el.selectionStart === block.text.length &&
      index < blocksRef.current.length - 1
    ) {
      event.preventDefault()
      focusSoon(blocksRef.current[index + 1].id, "start")
    }
  }

  function handlePaste(index: number, raw: string) {
    const block = blocksRef.current[index]
    const el = document.getElementById(`block-input-${block.id}`) as HTMLElement | null
    const offset = el ? caretOffset(el) : block.text.length
    const text = raw.replace(/\r/g, "")
    if (hasMarkdownSyntax(text)) {
      const imported = parseMarkdownToBlocks(text)
      if (imported.length === 0) return
      const currentEmpty = block.type === "paragraph" && block.text === ""
      const next = currentEmpty
        ? [...blocksRef.current.slice(0, index), ...imported, ...blocksRef.current.slice(index + 1)]
        : [...blocksRef.current.slice(0, index + 1), ...imported, ...blocksRef.current.slice(index + 1)]
      commit(next)
      focusNew(imported[imported.length - 1].id, "end")
      return
    }
    const lines = text.split("\n")
    if (lines.length === 1) {
      const nextText = block.text.slice(0, offset) + text + block.text.slice(offset)
      updateBlock(index, { text: nextText })
      focusAt(block.id, offset + text.length)
      return
    }
    const before = block.text.slice(0, offset)
    const after = block.text.slice(offset)
    const middle = lines.slice(1, -1).map((line) => ({ ...createBlock("paragraph"), text: line }))
    const last = { ...createBlock("paragraph"), text: lines[lines.length - 1] + after }
    const first = { ...createBlock("paragraph"), text: before + lines[0], rich: "" }
    const next = [
      ...blocksRef.current.slice(0, index),
      first,
      ...middle,
      last,
      ...blocksRef.current.slice(index + 1),
    ]
    commit(next)
    bumpReset(first.id)
    focusNew(last.id, "end")
  }

  function deleteBlock(index: number) {
    const block = blocksRef.current[index]
    const next = blocksRef.current.filter((_, position) => position !== index)
    if (next.length === 0) {
      const fresh = createBlock("paragraph")
      commit([fresh])
      focusNew(fresh.id, "start")
      return
    }
    const target = blocksRef.current[index - 1] ?? blocksRef.current[index + 1]
    commit(next)
    focusSoon(target.id, index === 0 ? "start" : "end")
  }

  function duplicateBlock(index: number) {
    const block = blocksRef.current[index]
    const copy = { ...block, id: uid() }
    commit([...blocksRef.current.slice(0, index + 1), copy, ...blocksRef.current.slice(index + 1)])
    focusNew(copy.id, "end")
  }

  function moveBlock(from: number, target: number, position: "before" | "after") {
    if (from === target) {
      setDragging(null)
      setDrop(null)
      return
    }
    let insert = position === "after" ? target + 1 : target
    const next = [...blocksRef.current]
    const [item] = next.splice(from, 1)
    if (from < insert) insert -= 1
    next.splice(insert, 0, item)
    commit(next)
    setDragging(null)
    setDrop(null)
    focusSoon(item.id, "end")
  }

  function appendBlock() {
    const last = blocksRef.current[blocksRef.current.length - 1]
    if (last && last.type === "paragraph" && last.text === "") {
      focusSoon(last.id, "end")
      return
    }
    const block = createBlock("paragraph")
    commit([...blocksRef.current, block])
    focusNew(block.id, "start")
  }

  function placeholderFor(block: Block, index: number) {
    switch (block.type) {
      case "heading1":
        return tr("Heading 1")
      case "heading2":
        return tr("Heading 2")
      case "heading3":
        return tr("Heading 3")
      case "bulleted":
        return tr("List")
      case "numbered":
        return tr("List")
      case "todo":
        return tr("To-do")
      case "quote":
        return tr("Quote")
      case "callout":
        return tr("Write something…")
      case "code":
        return tr("Write some code…")
      default:
        return index === 0 ? tr("Write something, or type '/' for commands…") : ""
    }
  }

  function renderRow(block: Block, index: number) {
    return (
      <BlockRow
        block={block}
        index={index}
        number={numbers[index]}
        placeholder={placeholderFor(block, index)}
        slashActive={slash?.blockId === block.id}
        isDragging={dragging === index}
        dropPosition={drop?.index === index ? drop.position : null}
        focusUsers={remoteFocus?.[block.id]}
        commentCount={commentCounts?.[block.id] ?? 0}
        comments={blockComments?.[block.id]}
        onOpenComments={onOpenComments}
        onCommentBlock={onCommentBlock}
        onFocusBlock={onFocusBlock}
        readOnly={readOnly}
        resetKey={resetKeysRef.current[block.id] ?? 0}
        autoFocus={autoFocus?.id === block.id}
        autoFocusWhere={autoFocus?.where}
        autoFocusOffset={autoFocus?.offset}
        headings={headings}
        breadcrumb={breadcrumb}
        workspaceId={workspaceId}
        members={members}
        hasChildren={toggleHasChildren.has(block.id)}
        onToggleCollapsed={() => updateBlock(index, { collapsed: !block.collapsed })}
        onToggleLock={() => updateBlock(index, { locked: !block.locked })}
        onInput={(text, el, rich) => handleInput(index, text, el, rich)}
        onKeyDown={handleKeyDown}
        onPaste={(text) => handlePaste(index, text)}
        onToggle={() => updateBlock(index, { checked: !block.checked })}
        onUpdate={(patch) => updateBlock(index, patch)}
        onConvert={(type) => convertBlock(index, type)}
        onDelete={() => deleteBlock(index)}
        onDuplicate={() => duplicateBlock(index)}
        onInsertAfter={(rect) => openSlash(index, "insert", "", rect)}
        onDragStart={() => setDragging(index)}
        onDragEnd={() => {
          setDragging(null)
          setDrop(null)
        }}
        onDragOver={(position) => {
          if (dragging === null) return
          setDrop((current) =>
            current && current.index === index && current.position === position
              ? current
              : { index, position },
          )
        }}
        onDrop={(position) => {
          if (dragging !== null) moveBlock(dragging, index, position)
        }}
      />
    )
  }

  return (
    <div className="relative">
      {blocks.length > 80 && scrollParentRef ? (
        <VirtualBlockList items={visibleEntries} scrollParentRef={scrollParentRef} renderRow={renderRow} />
      ) : (
        <div className="space-y-0.5">{visibleEntries.map(({ block, index }) => renderRow(block, index))}</div>
      )}


      {!readOnly && <button
        type="button"
        onClick={appendBlock}
        aria-label="Add a block"
        className="group/add mt-1 flex min-h-[90px] w-full items-start gap-2 rounded-md pt-2 text-left outline-none"
      >
        <span className="flex h-6 items-center gap-1 text-[11px] text-muted-foreground/0 transition group-hover/add:text-muted-foreground/60">
          <Plus className="size-3" /> Add block
        </span>
      </button>}

      {slash && !readOnly && (
        <SlashMenu
          state={slash}
          commands={commands}
          onSelect={applyCommand}
          onHover={(selected) => setSlash((current) => (current ? { ...current, selected } : current))}
          onQueryChange={(query) => setSlash((current) => (current ? { ...current, query, selected: 0 } : current))}
          onClose={closeSlash}
        />
      )}
    </div>
  )
}
