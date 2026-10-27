import { useEffect, useRef, useState } from "react"
import {
  Check,
  Copy,
  GripVertical,
  LockKeyhole,
  LockOpen,
  ImageIcon,
  MessageSquare,
  MoreHorizontal,
  MoreVertical,
  Network,
  Plus,
  RefreshCw,
  ChevronRight,
  Table2,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { Block, BlockType, Comment, Member } from "@/lib/types"
import { BLOCK_LABELS, SLASH_COMMANDS } from "@/components/editor/commands"
import { CALLOUT_COLORS, CALLOUT_EMOJI } from "@/lib/covers"
import { cn, formatRelative } from "@/lib/utils"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import type { RealtimePresence } from "@/lib/realtime"
import { MermaidDiagram } from "@/components/editor/mermaid-diagram"
import { LexicalBlock } from "@/components/editor/lexical-block"
import { PasswordBlock } from "@/components/editor/password-block"
import { CodeBlock } from "@/components/editor/code-block"
import { ChartBlock, GanttBlock } from "@/components/editor/data-blocks"
import { BarcodeBlock, QRCodeBlock } from "@/components/editor/code-image-blocks"
import { FormBlock } from "@/components/editor/form-block"
import { BreadcrumbBlock, ColumnsBlock, PageLinkBlock } from "@/components/editor/link-blocks"
import {
  BookmarkBlock,
  EmbedBlock,
  EquationBlock,
  FileBlock,
  TocBlock,
  VideoBlock,
  type HeadingItem,
} from "@/components/editor/rich-blocks"
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
  onInsertAfter: (rect: DOMRect) => void
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
    onInsertAfter,
    onDragStart,
    onDragEnd,
    onDragOver,
    onDrop,
  } = props

  const locked = Boolean(block.locked)
  const readOnly = pageReadOnly || locked

  const editableRef = useRef<HTMLDivElement>(null)
  const imageRef = useRef<HTMLDivElement>(null)
  const rowRef = useRef<HTMLDivElement>(null)
  const [imageDraft, setImageDraft] = useState("")
  const [imageError, setImageError] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [diagramEditing, setDiagramEditing] = useState(!block.text)

  useEffect(() => {
    const el = editableRef.current
    if (!el) return
    if (el.innerText !== block.text) el.innerText = block.text
  }, [block.text, block.type])

  useEffect(() => {
    setImageError(false)
  }, [block.url])

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

  function deleteDividerFocused(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault()
      onDelete()
    } else {
      onKeyDown(event, index)
    }
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

  async function uploadImage(file: File) {
    if (!workspaceId || uploading) return
    setUploading(true)
    try {
      const uploaded = await api.files.upload(file, workspaceId)
      onUpdate({ url: uploaded.url, caption: block.caption || uploaded.name, rich: "" })
      toast.success(tr("Image uploaded"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not upload image"))
    } finally {
      setUploading(false)
    }
  }

  function imageDrop(event: React.DragEvent) {
    const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith("image/"))
    if (!file) return
    event.preventDefault()
    event.stopPropagation()
    void uploadImage(file)
  }

  function renderContent() {
    switch (block.type) {
      case "toggle":
      case "toggleHeading1":
      case "toggleHeading2":
      case "toggleHeading3": {
        const headingClass =
          block.type === "toggleHeading1"
            ? "text-[30px] font-semibold leading-[1.25] tracking-[-0.02em] py-1.5 mt-5"
            : block.type === "toggleHeading2"
              ? "text-[24px] font-semibold leading-[1.3] tracking-[-0.015em] py-1 mt-4"
              : block.type === "toggleHeading3"
                ? "text-[19px] font-semibold leading-[1.4] py-1 mt-3"
                : "text-[15px] leading-[1.7] py-[3px]"
        return (
          <div className={cn("flex items-start gap-1", block.type !== "toggle" && "mt-0.5")}>
            <button
              type="button"
              aria-label={block.collapsed ? tr("Expand") : tr("Collapse")}
              aria-expanded={!block.collapsed}
              onClick={onToggleCollapsed}
              className={cn(
                "mt-[7px] flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/70 transition hover:bg-accent hover:text-foreground",
                !hasChildren && "opacity-30",
              )}
            >
              <ChevronRight className={cn("size-3.5 transition-transform", !block.collapsed && "rotate-90")} />
            </button>
            {renderEditable(headingClass)}
          </div>
        )
      }
      case "heading1":
        return renderEditable("text-[30px] font-semibold leading-[1.25] tracking-[-0.02em] py-1.5 mt-5")
      case "heading2":
        return renderEditable("text-[24px] font-semibold leading-[1.3] tracking-[-0.015em] py-1 mt-4")
      case "heading3":
        return renderEditable("text-[19px] font-semibold leading-[1.4] py-1 mt-3")
      case "bulleted":
        return (
          <div className="flex items-start gap-2.5">
            <span className="mt-[9px] flex h-4 w-4 shrink-0 items-center justify-center">
              <span className="size-[5px] rounded-full bg-foreground/70" />
            </span>
            {renderEditable("text-[15px] leading-[1.7] py-[3px]")}
          </div>
        )
      case "numbered":
        return (
          <div className="flex items-start gap-2">
            <span className="mt-[3px] flex h-6 w-5 shrink-0 items-center justify-end text-[14px] tabular-nums text-muted-foreground">
              {number}.
            </span>
            {renderEditable("text-[15px] leading-[1.7] py-[3px]")}
          </div>
        )
      case "todo":
        return (
          <div className="flex items-start gap-2.5">
            <button
              type="button"
              role="checkbox"
              aria-checked={!!block.checked}
              onClick={onToggle}
              className={cn(
                "mt-[5px] flex size-[17px] shrink-0 items-center justify-center rounded-[4px] border transition-colors",
                block.checked
                  ? "border-brand bg-brand text-white"
                  : "border-muted-foreground/40 bg-background hover:border-brand/60",
              )}
            >
              {block.checked && <Check className="size-3" strokeWidth={3.2} />}
            </button>
            {renderEditable(
              cn(
                "text-[15px] leading-[1.7] py-[3px] transition-colors",
                block.checked && "text-muted-foreground line-through decoration-muted-foreground/50",
              ),
            )}
          </div>
        )
      case "quote":
        return (
          <div className="border-l-[3px] border-foreground/60 py-0.5 pl-4">
            {renderEditable("text-[15px] leading-[1.7] py-[3px] text-foreground/90")}
          </div>
        )
      case "callout": {
        const color = block.color || "amber"
        return (
          <div
            className={cn(
              "flex items-start gap-3 rounded-lg px-3.5 py-3",
              CALLOUT_COLORS[color] ?? CALLOUT_COLORS.amber,
            )}
          >
            <span className="mt-[1px] shrink-0 select-none text-[17px] leading-6">
              {CALLOUT_EMOJI[color] ?? "💡"}
            </span>
            {renderEditable("text-[15px] leading-[1.7] py-0")}
          </div>
        )
      }
      case "code":
        return (
          <CodeBlock
            block={block}
            index={index}
            readOnly={readOnly}
            placeholder={placeholder}
            autoFocus={autoFocus}
            onInput={(text, el) => onInput(text, el)}
            onKeyDown={(event, rowIndex) => onKeyDown(event, rowIndex)}
            onFocus={() => onFocusBlock?.(block.id)}
            onUpdate={onUpdate}
          />
        )
      case "table": {
        const table = block.table ?? {
          columns: ["Column 1", "Column 2", "Column 3"],
          rows: [["", "", ""], ["", "", ""]],
          header: true,
        }
        const updateTable = (next: typeof table) => onUpdate({ table: next })
        const setCell = (rowIndex: number, columnIndex: number, value: string) => {
          const rows = table.rows.map((row, index) =>
            index === rowIndex
              ? table.columns.map((_, cellIndex) => (cellIndex === columnIndex ? value : (row[cellIndex] ?? "")))
              : row,
          )
          updateTable({ ...table, rows })
        }
        const addRow = () => {
          if (table.rows.length >= 200) return
          updateTable({ ...table, rows: [...table.rows, table.columns.map(() => "")] })
        }
        const removeRow = (index: number) => {
          updateTable({ ...table, rows: table.rows.filter((_, rowIndex) => rowIndex !== index) })
        }
        const addColumn = () => {
          if (table.columns.length >= 20) return
          const name = `Column ${table.columns.length + 1}`
          updateTable({
            ...table,
            columns: [...table.columns, name],
            rows: table.rows.map((row) => [...row, ""]),
          })
        }
        const removeColumn = (index: number) => {
          if (table.columns.length <= 1) return
          updateTable({
            ...table,
            columns: table.columns.filter((_, columnIndex) => columnIndex !== index),
            rows: table.rows.map((row) => row.filter((_, columnIndex) => columnIndex !== index)),
          })
        }
        const setColumn = (index: number, value: string) => {
          updateTable({
            ...table,
            columns: table.columns.map((column, columnIndex) => (columnIndex === index ? value : column)),
          })
        }
        return (
          <div className="my-2 overflow-hidden rounded-lg border border-border/80 bg-card" onFocus={() => onFocusBlock?.(block.id)}>
            <div className="flex items-center gap-1.5 border-b border-border/60 px-2.5 py-1.5 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              <Table2 className="size-3" /> Table
              <span className="ml-auto normal-case tracking-normal text-muted-foreground/60">
                {table.columns.length} × {table.rows.length + 1}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-sm">
                <thead>
                  <tr>
                    {table.columns.map((column, columnIndex) => (
                      <th key={columnIndex} className="group/head min-w-[110px] border-b border-r border-border/60 bg-muted/35 p-0 text-left last:border-r-0">
                        <div className="flex items-center gap-0.5 px-1">
                          <input
                            value={column}
                            readOnly={readOnly}
                            onChange={(event) => setColumn(columnIndex, event.target.value)}
                            onFocus={() => onFocusBlock?.(block.id)}
                            className="h-8 min-w-0 flex-1 bg-transparent px-1.5 text-xs font-semibold outline-none"
                            placeholder={`Column ${columnIndex + 1}`}
                          />
                          {!readOnly && table.columns.length > 1 && (
                            <button
                              type="button"
                              onClick={() => removeColumn(columnIndex)}
                              className="flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/0 transition group-hover/head:text-muted-foreground hover:bg-destructive/10 hover:!text-destructive"
                              aria-label={tr("Delete column")}
                            >
                              <X className="size-3" />
                            </button>
                          )}
                        </div>
                      </th>
                    ))}
                    <th className="w-6 border-b border-border/60 bg-muted/35" />
                  </tr>
                </thead>
                <tbody>
                  {table.rows.map((row, rowIndex) => (
                    <tr key={rowIndex} className="group/row">
                      {table.columns.map((_, columnIndex) => (
                        <td key={columnIndex} className="border-b border-r border-border/60 p-0 last:border-r-0">
                          <input
                            value={row[columnIndex] ?? ""}
                            readOnly={readOnly}
                            onChange={(event) => setCell(rowIndex, columnIndex, event.target.value)}
                            onFocus={() => onFocusBlock?.(block.id)}
                            className="h-9 w-full bg-transparent px-2 text-[13px] outline-none transition focus:bg-brand-soft/20"
                            placeholder=" "
                          />
                        </td>
                      ))}
                      <td className="border-b border-border/60 p-0 text-center">
                        {!readOnly && <button
                          type="button"
                          onClick={() => removeRow(rowIndex)}
                          className="flex size-6 items-center justify-center rounded text-muted-foreground/0 transition group-hover/row:text-muted-foreground hover:bg-destructive/10 hover:!text-destructive"
                          aria-label={tr("Delete row")}
                        >
                          <X className="size-3" />
                        </button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!readOnly && <div className="flex items-center gap-1 border-t border-border/60 p-1.5">
              <button
                type="button"
                onClick={addRow}
                className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <Plus className="size-3" /> Row
              </button>
              <button
                type="button"
                onClick={addColumn}
                className="flex items-center gap-1 rounded px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <Plus className="size-3" /> Column
              </button>
            </div>}
          </div>
        )
      }
      case "diagram":
        return (
          <div className="my-2 overflow-hidden rounded-lg border border-border/80 bg-card">
            <div className="flex items-center gap-1.5 border-b border-border/60 px-2.5 py-1.5">
              <Network className="size-3 text-muted-foreground" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Mermaid diagram
              </span>
              <button
                type="button"
                onClick={() => setDiagramEditing((value) => !value)}
                className="ml-auto rounded px-2 py-0.5 text-[10px] text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                {diagramEditing ? tr("Preview") : tr("Edit source")}
              </button>
            </div>
            {diagramEditing ? (
              <textarea
                value={block.text}
                readOnly={readOnly}
                onChange={(event) => onUpdate({ text: event.target.value })}
                onFocus={() => onFocusBlock?.(block.id)}
                spellCheck={false}
                rows={Math.min(16, Math.max(5, block.text.split("\n").length + 1))}
                placeholder={"flowchart LR\n  A[Start] --> B[Finish]"}
                className="block w-full resize-y bg-transparent p-3 font-mono text-[12px] leading-5 outline-none placeholder:text-muted-foreground/50"
              />
            ) : (
              <div className="cursor-pointer" onClick={() => setDiagramEditing(true)}>
                <MermaidDiagram source={block.text} />
              </div>
            )}
          </div>
        )
      case "divider":
        return (
          <div className="py-3">
            <div
              id={`block-input-${block.id}`}
              data-block-input
              tabIndex={0}
              onKeyDown={deleteDividerFocused}
              onFocus={() => onFocusBlock?.(block.id)}
              className="rounded-sm py-1 outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
            >
              <hr className="border-border" />
            </div>
          </div>
        )
      case "password":
        return (
          <PasswordBlock
            block={block}
            readOnly={readOnly}
            autoFocus={autoFocus}
            onUpdate={onUpdate}
            onFocus={() => onFocusBlock?.(block.id)}
          />
        )
      case "bookmark":
        return <BookmarkBlock block={block} readOnly={readOnly} autoFocus={autoFocus} onUpdate={onUpdate} />
      case "video":
        return <VideoBlock block={block} readOnly={readOnly} autoFocus={autoFocus} onUpdate={onUpdate} />
      case "embed":
        return <EmbedBlock block={block} readOnly={readOnly} autoFocus={autoFocus} onUpdate={onUpdate} />
      case "file":
        return <FileBlock block={block} readOnly={readOnly} autoFocus={autoFocus} workspaceId={workspaceId} onUpdate={onUpdate} />
      case "equation":
        return <EquationBlock block={block} readOnly={readOnly} autoFocus={autoFocus} onUpdate={onUpdate} />
      case "toc":
        return <TocBlock block={block} headings={headings} readOnly={readOnly} />
      case "gantt":
        return <GanttBlock block={block} readOnly={readOnly} autoFocus={autoFocus} onUpdate={onUpdate} />
      case "chart":
        return <ChartBlock block={block} readOnly={readOnly} autoFocus={autoFocus} onUpdate={onUpdate} />
      case "pageLink":
        return <PageLinkBlock block={block} readOnly={readOnly} onUpdate={onUpdate} />
      case "breadcrumb":
        return <BreadcrumbBlock block={block} breadcrumb={breadcrumb} />
      case "columns":
        return <ColumnsBlock block={block} readOnly={readOnly} onUpdate={onUpdate} />
      case "qrcode":
        return <QRCodeBlock block={block} readOnly={readOnly} autoFocus={autoFocus} onUpdate={onUpdate} />
      case "barcode":
        return <BarcodeBlock block={block} readOnly={readOnly} autoFocus={autoFocus} onUpdate={onUpdate} />
      case "form":
        return <FormBlock block={block} pageId={pageId} readOnly={pageReadOnly} autoFocus={autoFocus} onUpdate={onUpdate} />
      case "image":
        return block.url ? (
          <figure
            ref={imageRef}
            id={`block-input-${block.id}`}
            data-block-input
            tabIndex={0}
            onKeyDown={(event) => onKeyDown(event, index)}
            onFocus={() => onFocusBlock?.(block.id)}
            onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault() }}
            onDrop={imageDrop}
            className="my-2 overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
          >
            {imageError ? (
              <div className="flex flex-col items-center gap-2 border border-dashed bg-muted/30 px-4 py-10 text-center text-xs text-muted-foreground">
                <ImageIcon className="size-5" />
                {tr("This image could not be loaded.")}
                {!readOnly && <button
                  type="button"
                  onClick={() => onUpdate({ url: "" })}
                  className="rounded border px-2 py-1 text-[11px] hover:bg-accent"
                >
                  Replace URL
                </button>}
              </div>
            ) : (
              <img
                src={block.url}
                alt={block.caption || "Image"}
                loading="lazy"
                decoding="async"
                onError={() => setImageError(true)}
                className="max-h-[440px] w-full bg-muted/30 object-contain"
              />
            )}
            {block.caption && (
              <figcaption className="mt-2 text-center text-xs text-muted-foreground">
                {block.caption}
              </figcaption>
            )}
            {!readOnly && (
              <div className="flex justify-end border-t border-border/40 p-1.5">
                <label className="flex cursor-pointer items-center gap-1 rounded px-2 py-1 text-[10px] text-muted-foreground transition hover:bg-accent hover:text-foreground">
                  <Upload className="size-3" /> {uploading ? tr("Uploading…") : tr("Replace image")}
                  <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(file); event.target.value = "" }} />
                </label>
              </div>
            )}
          </figure>
        ) : (
          <div
            id={`block-input-${block.id}`}
            ref={imageRef}
            data-block-input
            tabIndex={0}
            onKeyDown={(event) => onKeyDown(event, index)}
            onFocus={() => onFocusBlock?.(block.id)}
            onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault() }}
            onDrop={imageDrop}
            className="my-2 flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
          >
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ImageIcon className="size-4" /> {tr("Embed an image")}
            </div>
            {!readOnly && <div className="flex w-full max-w-md gap-1.5">
              <input
                value={imageDraft}
                onChange={(event) => setImageDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    const url = imageDraft.trim()
                    if (url) onUpdate({ url })
                  }
                }}
                placeholder={tr("Paste an image URL…")}
                className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
              />
              <button
                type="button"
                onClick={() => {
                  const url = imageDraft.trim()
                  if (url) onUpdate({ url })
                }}
                className="h-8 shrink-0 rounded-md bg-primary px-3 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
              >
                Embed
              </button>
              <label className="flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-md border px-2 text-[11px] text-muted-foreground transition hover:bg-accent hover:text-foreground">
                <Upload className="size-3" /> {uploading ? tr("Uploading…") : tr("Upload")}
                <input type="file" accept="image/*" className="hidden" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadImage(file); event.target.value = "" }} />
              </label>
            </div>}
          </div>
        )
      case "paragraph":
      default:
        return renderEditable("text-[15px] leading-[1.7] py-[3px]")
    }
  }

  return (
    <div
      ref={rowRef}
      data-block-row
      data-block-id={block.id}
      className={cn(
        "group/block relative flex items-start gap-0.5",
        isDragging && "block-dragging",
        dropPosition === "before" && "block-drop-before",
        dropPosition === "after" && "block-drop-after",
        slashActive && "z-10",
      )}
      style={{ marginLeft: (block.indent ?? 0) * 18 }}
      onDragOver={handleOver}
      onDrop={handleDrop}
    >
      {!readOnly && <div className="absolute -left-[66px] top-0 hidden h-7 items-center gap-0.5 opacity-0 transition-opacity group-hover/block:opacity-100 has-[[data-state=open]]:opacity-100 md:flex">
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={(event) => onInsertAfter(event.currentTarget.getBoundingClientRect())}
              className="flex size-5 items-center justify-center rounded text-muted-foreground/70 transition hover:bg-accent hover:text-foreground"
              aria-label="Add block below"
            >
              <Plus className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Add block below</TooltipContent>
        </Tooltip>
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
              className="flex size-5 cursor-grab items-center justify-center rounded text-muted-foreground/70 transition hover:bg-accent hover:text-foreground active:cursor-grabbing"
              aria-label="Drag block"
            >
              <GripVertical className="size-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent>Drag to move</TooltipContent>
        </Tooltip>
        <BlockMenu
          block={block}
          locked={locked}
          onToggleLock={onToggleLock}
          onConvert={onConvert}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onComment={onCommentBlock ? () => onCommentBlock(block.id) : undefined}
          trigger={
            <button
              type="button"
              className="flex size-5 items-center justify-center rounded text-muted-foreground/70 transition hover:bg-accent hover:text-foreground data-[state=open]:bg-accent"
              aria-label="Block options"
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

      <div key={block.type} className="min-w-0 flex-1">
        {renderContent()}
      </div>

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
              aria-label={`View ${commentCount} comment${commentCount === 1 ? "" : "s"}`}
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

      {!readOnly && <div className="flex size-6 shrink-0 items-center justify-center md:hidden">
        <BlockMenu
          block={block}
          locked={locked}
          onToggleLock={onToggleLock}
          onConvert={onConvert}
          onDuplicate={onDuplicate}
          onDelete={onDelete}
          onComment={onCommentBlock ? () => onCommentBlock(block.id) : undefined}
          align="end"
          trigger={
            <button
              type="button"
              aria-label="Block options"
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

function BlockMenu({
  block,
  locked = false,
  onToggleLock,
  trigger,
  onConvert,
  onDuplicate,
  onDelete,
  onComment,
  align = "start",
}: {
  block: Block
  locked?: boolean
  onToggleLock?: () => void
  trigger: React.ReactNode
  onConvert: (type: BlockType) => void
  onDuplicate: () => void
  onDelete: () => void
  onComment?: () => void
  align?: "start" | "end"
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent align={align} sideOffset={6} className="w-48">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <RefreshCw /> Turn into
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="max-h-[280px] w-48 overflow-y-auto thin-scrollbar">
            {SLASH_COMMANDS.map((command) => (
              <DropdownMenuItem key={command.type} onSelect={() => onConvert(command.type)}>
                <command.icon />
                {BLOCK_LABELS[command.type]}
                {block.type === command.type && (
                  <Check className="ml-auto size-3.5 text-brand" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {onToggleLock && (
          <DropdownMenuItem onSelect={onToggleLock}>
            {locked ? <LockOpen /> : <LockKeyhole />}
            {locked ? tr("Unlock block") : tr("Lock block")}
          </DropdownMenuItem>
        )}
        <DropdownMenuItem onSelect={onDuplicate}>
          <Copy /> Duplicate
        </DropdownMenuItem>
        {onComment && (
          <DropdownMenuItem onSelect={onComment}>
            <MessageSquare /> Comment
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 /> Delete
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
