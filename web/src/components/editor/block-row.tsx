import { useRef } from "react"
import { Copy, GripVertical, LockOpen, MessageSquare, MoreHorizontal, MoreVertical } from "lucide-react"
import { toast } from "sonner"
import type { Block, BlockType, Comment, Member } from "@/lib/types"
import { getBlockRenderer, type BlockRenderProps } from "@/components/editor/block-renderers"
import { BlockMenu } from "@/components/editor/block-menu"
import type { HeadingItem } from "@/components/editor/rich-blocks"
import { cn, formatRelative } from "@/lib/utils"
import {
  ALIGN_STYLE_TYPES,
  TEXT_STYLE_TYPES,
  alignClass,
  backgroundColorClass,
  textColorClass,
} from "@/lib/block-style"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { RealtimePresence } from "@/lib/realtime"
import { LexicalBlock } from "@/components/editor/lexical-block"
import { tr } from "@/lib/i18n"

export interface BlockRowProps {
  block: Block
  index: number
  number: number
  placeholder: string
  slashActive: boolean
  isDragging: boolean
  dropPosition: "before" | "after" | null
  readOnly?: boolean
  allowVote?: boolean
  isLayout?: boolean
  hasContentPlaceholder?: boolean
  selected?: boolean
  onSelectBlock?: () => void
  onToggleLock?: () => void
  resetKey?: number
  autoFocus?: boolean
  autoFocusWhere?: "start" | "end"
  autoFocusOffset?: number
  hasChildren?: boolean
  onToggleCollapsed?: () => void
  headings?: HeadingItem[]
  breadcrumb?: { id: string; title: string; icon: string }[]
  workspaceId?: string
  pageId?: string
  members?: Member[]
  focusUsers?: RealtimePresence[]
  commentCount?: number
  comments?: Comment[]
  onOpenComments?: () => void
  onCommentsChanged?: () => void
  onCommentBlock?: (blockId: string) => void
  onFocusBlock?: (blockId: string) => void
  onInput: (text: string, el: HTMLElement, rich?: string) => void
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>, index: number) => void
  onPaste: (text: string) => void
  onToggle: () => void
  onUpdate: (patch: Partial<Block>) => void
  onConvert: (type: BlockType) => void
  onDelete: () => void
  onDuplicate: () => void
  onInsertAbove?: () => void
  onInsertBelow?: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  canMoveUp?: boolean
  canMoveDown?: boolean
  onDragStart: () => void
  onDragEnd: () => void
  onDragOver: (position: "before" | "after") => void
  onDrop: (position: "before" | "after") => void
}

export function BlockRow(props: BlockRowProps) {
  const {
    block,
    index,
    number,
    placeholder,
    slashActive,
    isDragging,
    dropPosition,
    readOnly: pageReadOnly = false,
    allowVote = false,
    isLayout = false,
    hasContentPlaceholder = false,
    selected = false,
    onSelectBlock,
    onToggleLock,
    resetKey = 0,
    autoFocus = false,
    autoFocusWhere,
    autoFocusOffset,
    hasChildren = false,
    onToggleCollapsed,
    headings = [],
    breadcrumb = [],
    workspaceId = "",
    pageId = "",
    members = [],
    focusUsers,
    commentCount = 0,
    comments = [],
    onOpenComments,
    onCommentsChanged,
    onCommentBlock,
    onFocusBlock,
    onInput,
    onKeyDown,
    onPaste,
    onToggle,
    onUpdate,
    onConvert,
    onDelete,
    onDuplicate,
    onInsertAbove,
    onInsertBelow,
    onMoveUp,
    onMoveDown,
    canMoveUp = false,
    canMoveDown = false,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDrop,
  } = props

  const locked = Boolean(block.locked)
  const readOnly = pageReadOnly || locked
  const textStyled = TEXT_STYLE_TYPES.has(block.type)
  const aligned = ALIGN_STYLE_TYPES.has(block.type)
  const blockBackground = textStyled ? backgroundColorClass(block.bgColor) : ""
  const fixedHeight = typeof block.height === "number" && block.height > 0
  const contentClassName = cn(
    "min-w-0 flex-1",
    textStyled && textColorClass(block.textColor),
    aligned && alignClass(block.align),
    (block.type === "code" || block.type === "curl") && "py-2",
    blockBackground && cn("-mx-2 rounded-md px-2", blockBackground),
    fixedHeight && "thin-scrollbar overflow-y-auto overscroll-contain",
  )

  const contentRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)


  function handleOver(event: React.DragEvent) {
    event.preventDefault()
    event.dataTransfer.dropEffect = "move"
    const rect = rowRef.current?.getBoundingClientRect()
    if (!rect) return
    onDragOver(event.clientY < rect.top + rect.height / 2 ? "before" : "after")
  }

  function handleDrop(event: React.DragEvent) {
    event.preventDefault()
    const rect = rowRef.current?.getBoundingClientRect()
    if (!rect) return
    onDrop(event.clientY < rect.top + rect.height / 2 ? "before" : "after")
  }

  function resizeBlockHeight(event: React.PointerEvent<HTMLSpanElement>) {
    if (event.button !== 0) return
    event.preventDefault()
    event.stopPropagation()
    const target = event.currentTarget
    const pointerId = event.pointerId
    const startY = event.clientY
    const startHeight = fixedHeight
      ? block.height!
      : contentRef.current?.getBoundingClientRect().height ?? 0
    const previousCursor = document.body.style.cursor
    const previousSelect = document.body.style.userSelect
    document.body.style.cursor = "row-resize"
    document.body.style.userSelect = "none"
    target.setPointerCapture(pointerId)
    let moved = false
    const onMove = (moveEvent: PointerEvent) => {
      const delta = moveEvent.clientY - startY
      if (!moved && Math.abs(delta) < 3) return
      moved = true
      const next = Math.round(Math.max(48, Math.min(4000, startHeight + delta)))
      onUpdate({ height: next })
    }
    const onUp = () => {
      document.body.style.cursor = previousCursor
      document.body.style.userSelect = previousSelect
      if (target.hasPointerCapture(pointerId)) target.releasePointerCapture(pointerId)
      window.removeEventListener("pointermove", onMove)
      window.removeEventListener("pointerup", onUp)
      window.removeEventListener("pointercancel", onUp)
    }
    window.addEventListener("pointermove", onMove)
    window.addEventListener("pointerup", onUp)
    window.addEventListener("pointercancel", onUp)
  }


  function copyBlockLink() {
    const path = pageId ? `/page/${pageId}` : window.location.pathname
    const url = `${window.location.origin}${path}#block-${encodeURIComponent(block.id)}`
    void navigator.clipboard.writeText(url).then(
      () => toast.success(tr("Block link copied")),
      () => toast.error(tr("Could not copy block link")),
    )
  }

  function renderEditable(className: string) {
    return (
      <LexicalBlock
        id={block.id}
        text={block.text}
        rich={block.rich}
        placeholder={placeholder}
        className={className}
        readOnly={readOnly}
        resetKey={resetKey}
        autoFocus={autoFocus}
        autoFocusWhere={autoFocusWhere}
        autoFocusOffset={autoFocusOffset}
        onFocus={() => onFocusBlock?.(block.id)}
        onInput={(text, rich, el) => onInput(text, el, rich)}
        onKeyDown={(event) => onKeyDown(event, index)}
        onPaste={(text) => onPaste(text)}
        members={members}
      />
    )
  }


  const BlockContent = getBlockRenderer(block.type)
  const renderProps: BlockRenderProps = {
    block,
    index,
    number,
    placeholder,
    readOnly,
    allowVote,
    isLayout,
    hasContentPlaceholder,
    resetKey,
    autoFocus,
    autoFocusWhere,
    autoFocusOffset,
    hasChildren,
    headings,
    breadcrumb,
    workspaceId,
    pageId,
    members,
    comments,
    onInput,
    onKeyDown,
    onPaste,
    onToggle,
    onUpdate,
    onDelete,
    onFocusBlock,
    onOpenComments,
    onCommentsChanged,
    onToggleCollapsed,
    renderEditable,
  }

  return (
    <div
      ref={rowRef}
      id={`block-${block.id}`}
      data-block-row
      data-block-id={block.id}
      data-block-index={index}
      data-selected={selected || undefined}
      className={cn(
        "group/block relative flex items-start gap-0.5 rounded-md transition-colors",
        selected && "bg-brand-soft/25 ring-1 ring-inset ring-brand/20",
        isDragging && "block-dragging",
        dropPosition === "before" && "block-drop-before",
        dropPosition === "after" && "block-drop-after",
        slashActive && "z-10",
      )}
      style={{ marginLeft: (block.indent ?? 0) * 18 }}
      onDragOver={handleOver}
      onDrop={handleDrop}
    >
      {!readOnly && <div className="absolute -left-10 top-0 hidden h-7 items-center gap-0 opacity-0 transition-opacity group-hover/block:opacity-100 has-[[data-state=open]]:opacity-100 md:flex">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              draggable
              onDragStart={(event) => {
                event.dataTransfer.effectAllowed = "move"
                event.dataTransfer.setData("text/plain", block.id)
                onDragStart()
              }}
              onDragEnd={onDragEnd}
              className="flex size-5 cursor-grab items-center justify-center rounded text-muted-foreground opacity-60 transition hover:bg-accent hover:text-foreground hover:opacity-100 group-hover/block:opacity-100 active:cursor-grabbing md:opacity-[0.12]"
              aria-label={tr("Drag block")}
            >
              <GripVertical className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>{tr("Drag to move")}</TooltipContent>
        </Tooltip>
        <BlockMenu
          block={block}
          locked={locked}
          selected={selected}
          isLayout={isLayout}
          hasContentPlaceholder={hasContentPlaceholder}
          onToggleLock={onToggleLock}
          onConvert={onConvert}
          onUpdate={onUpdate}
          onSelectBlock={onSelectBlock}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onInsertAbove={onInsertAbove}
          onInsertBelow={onInsertBelow}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          onComment={onCommentBlock ? () => onCommentBlock(block.id) : undefined}
          onCopyLink={copyBlockLink}
          collapsed={block.collapsed}
          onToggleCollapsed={onToggleCollapsed}
          trigger={
            <button
              type="button"
              className="flex size-5 items-center justify-center rounded text-muted-foreground/70 transition hover:bg-accent hover:text-foreground data-[state=open]:bg-accent"
              aria-label={tr("Block options")}
            >
              <MoreHorizontal className="size-3.5" />
            </button>
          }
        />
      </div>}

      {focusUsers && focusUsers.length > 0 && (
        <span
          className="absolute -left-1.5 bottom-0.5 top-0.5 w-[3px] rounded-full"
          style={{ backgroundColor: focusUsers[0].color }}
          title={`${focusUsers.map((person) => person.name).join(", ")} editing`}
        />
      )}

      <div
        key={block.type}
        ref={contentRef}
        className={contentClassName}
        style={fixedHeight ? { height: block.height } : undefined}
      >
        <BlockContent {...renderProps} />
        {block.translations && Object.keys(block.translations).length > 0 && (
          <div className="mt-1.5 rounded-md border border-dashed border-brand/20 bg-brand-soft/20 px-2.5 py-1.5">
            {Object.entries(block.translations).slice(0,3).map(([code, val]) => (
              <div key={code} className="flex items-start gap-1.5 py-0.5 text-xs">
                <span className="rounded bg-brand px-1 py-0.5 text-[10px] font-mono text-white">{code}</span>
                <span className="flex-1 leading-5">{val as string}</span>
                {!readOnly && <button type="button" onClick={() => { onUpdate({ text: val as string, rich: "" }); toast.success(tr("Applied")) }} className="shrink-0 rounded bg-background px-1.5 py-0.5 text-[10px] hover:bg-accent">{tr("Apply")}</button>}
                <button type="button" onClick={() => void navigator.clipboard.writeText(val as string).then(()=>toast.success(tr("Copied")), ()=>toast.error(tr("Could not copy")))} className="shrink-0 rounded px-1 py-0.5 text-[10px] hover:bg-accent"><Copy className="size-3" /></button>
              </div>
            ))}
            {Object.keys(block.translations).length > 3 && <div className="text-[11px] text-muted-foreground">+{Object.keys(block.translations).length-3} more</div>}
          </div>
        )}
      </div>

      {!readOnly && block.type !== "divider" && (
        <span
          role="separator"
          aria-label={tr("Resize block height")}
          title={tr("Drag to resize block height; double-click to reset")}
          onPointerDown={resizeBlockHeight}
          onDoubleClick={(event) => {
            event.preventDefault()
            onUpdate({ height: undefined })
          }}
          className="group/resize absolute bottom-0 left-1/2 z-20 hidden h-1.5 w-12 -translate-x-1/2 cursor-row-resize touch-none items-center justify-center bg-transparent md:flex"
        >
          <span className="pointer-events-none h-0.5 w-8 rounded-full bg-transparent transition-colors group-hover/block:bg-brand/25 group-hover/resize:bg-brand/60" />
        </span>
      )}

      {locked && !pageReadOnly && (
        <button
          type="button"
          onClick={onToggleLock}
          aria-label={tr("Unlock block")}
          className="ml-1 mt-1 flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/70 transition hover:bg-accent hover:text-foreground"
        >
          <LockOpen className="size-3" />
        </button>
      )}

      {commentCount > 0 && (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={tr(commentCount === 1 ? "View {n} comment" : "View {n} comments", { n: commentCount })}
              className="ml-1 mt-1 flex h-5 shrink-0 items-center gap-1 rounded-full bg-brand-soft px-1.5 text-[10px] font-medium text-brand transition hover:bg-brand/15"
            >
              <MessageSquare className="size-3" />
              {commentCount}
            </button>
          </PopoverTrigger>
          <PopoverContent align="end" className="w-80 p-2">
            <div className="flex items-center justify-between px-1.5 pb-1.5">
              <span className="text-xs font-medium">{tr("Comments")}</span>
              <span className="text-[10px] text-muted-foreground">
                {commentCount} {tr("open")}
              </span>
            </div>
            <div className="max-h-64 space-y-1 overflow-y-auto thin-scrollbar">
              {comments.slice(0, 3).map((comment) => (
                <button
                  key={comment.id}
                  type="button"
                  onClick={onOpenComments}
                  className="block w-full rounded-lg px-2 py-1.5 text-left transition hover:bg-accent/60"
                >
                  {comment.quote && (
                    <div className="truncate border-l-2 border-brand/50 pl-1.5 text-[10px] italic text-muted-foreground">
                      “{comment.quote}”
                    </div>
                  )}
                  <div className="mt-0.5 flex items-baseline gap-1.5">
                    <span className="truncate text-[10px] font-medium">{comment.authorName}</span>
                    <span className="shrink-0 text-[9px] text-muted-foreground">
                      {formatRelative(comment.createdAt)}
                    </span>
                  </div>
                  <div className="mt-0.5 line-clamp-2 text-[11px] leading-4">{comment.body}</div>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={onOpenComments}
              className="mt-1 w-full rounded-md border border-border/70 px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              {tr("Open all comments")}
            </button>
          </PopoverContent>
        </Popover>
      )}

      {!readOnly && <div className="flex size-8 shrink-0 items-center justify-center md:hidden">
        <BlockMenu
          block={block}
          locked={locked}
          selected={selected}
          isLayout={isLayout}
          hasContentPlaceholder={hasContentPlaceholder}
          onToggleLock={onToggleLock}
          onConvert={onConvert}
          onUpdate={onUpdate}
          onSelectBlock={onSelectBlock}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onInsertAbove={onInsertAbove}
          onInsertBelow={onInsertBelow}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          canMoveUp={canMoveUp}
          canMoveDown={canMoveDown}
          onComment={onCommentBlock ? () => onCommentBlock(block.id) : undefined}
          onCopyLink={copyBlockLink}
          collapsed={block.collapsed}
          onToggleCollapsed={onToggleCollapsed}
          align="end"
          trigger={
            <button
              type="button"
              aria-label={tr("Block options")}
              className="flex size-6 items-center justify-center rounded text-muted-foreground/40 hover:bg-accent hover:text-foreground data-[state=open]:bg-accent"
            >
              <MoreVertical className="size-3.5" />
            </button>
          }
        />
      </div>}
    </div>
  )
}
