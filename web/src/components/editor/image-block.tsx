import { useEffect, useRef, useState } from "react"
import {
  Check,
  ImageIcon,
  Link2,
  Maximize2,
  MessageSquarePlus,
  Pencil,
  Trash2,
  Upload,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { Block, Comment } from "@/lib/types"
import { tr } from "@/lib/i18n"
import { isImeKeyEvent } from "@/lib/keyboard"
import { cn } from "@/lib/utils"
import { imageAlignClass, imageWidthClass } from "@/lib/block-style"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

const WIDTHS: { value: string; label: string }[] = [
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "full", label: "Full width" },
]

const ALIGNMENTS: { value: string; label: string }[] = [
  { value: "left", label: "Left" },
  { value: "center", label: "Center" },
  { value: "right", label: "Right" },
]

type Rect = { x: number; y: number; width: number; height: number }

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

export function ImageBlock({
  block,
  pageId,
  readOnly,
  workspaceId,
  autoFocus,
  comments = [],
  onUpdate,
  onKeyDown,
  onFocus,
  onOpenComments,
  onCommentsChanged,
}: {
  block: Block
  pageId: string
  readOnly: boolean
  workspaceId: string
  autoFocus?: boolean
  comments?: Comment[]
  onUpdate: (patch: Partial<Block>) => void
  onKeyDown: (event: React.KeyboardEvent<HTMLElement>) => void
  onFocus: () => void
  onOpenComments?: () => void
  onCommentsChanged?: () => void
}) {
  const [urlDraft, setUrlDraft] = useState("")
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(0)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const pendingFileRef = useRef<File | null>(null)
  const [imageError, setImageError] = useState(false)
  const [lightbox, setLightbox] = useState(false)
  const [editing, setEditing] = useState(false)
  const [editUrl, setEditUrl] = useState("")
  const [editCaption, setEditCaption] = useState("")
  const [editLink, setEditLink] = useState("")
  const [editWidth, setEditWidth] = useState("full")
  const [editAlign, setEditAlign] = useState("center")
  const [annotating, setAnnotating] = useState(false)
  const [draftRect, setDraftRect] = useState<Rect | null>(null)
  const [commentRect, setCommentRect] = useState<Rect | null>(null)
  const [commentBody, setCommentBody] = useState("")
  const [commentPending, setCommentPending] = useState(false)
  const imageBoxRef = useRef<HTMLDivElement>(null)
  const urlInputRef = useRef<HTMLInputElement>(null)

  const annotations = (comments ?? []).filter((comment) => comment.annotation && !comment.resolved)
  const width = block.width || "full"
  const align = block.align || "center"

  useEffect(() => {
    setImageError(false)
  }, [block.url])

  useEffect(() => {
    if (autoFocus && !block.url) urlInputRef.current?.focus()
  }, [autoFocus, block.url])

  useEffect(() => {
    if (!editing) return
    setEditUrl(block.url || "")
    setEditCaption(block.caption || "")
    setEditLink(block.language || "")
    setEditWidth(block.width || "full")
    setEditAlign(block.align || "center")
  }, [editing, block.url, block.caption, block.width, block.align, block.language])

  async function uploadImage(file: File) {
    if (!workspaceId || uploading) return
    pendingFileRef.current = file
    setUploading(true)
    setUploadError(null)
    setUploadProgress(0)
    try {
      const uploaded = await api.files.upload(file, workspaceId, setUploadProgress)
      onUpdate({ url: uploaded.url, caption: block.caption || uploaded.name, rich: "" })
      toast.success(tr("Image uploaded"))
      setUploadError(null)
      pendingFileRef.current = null
    } catch (error) {
      const msg = error instanceof Error ? error.message : tr("Could not upload image")
      setUploadError(msg)
      toast.error(msg)
    } finally {
      setUploading(false)
      setUploadProgress(0)
    }
  }

  function retryUpload() {
    const file = pendingFileRef.current
    if (file) void uploadImage(file)
  }

  function imageDrop(event: React.DragEvent) {
    const file = Array.from(event.dataTransfer.files).find((item) => item.type.startsWith("image/"))
    if (!file) return
    event.preventDefault()
    event.stopPropagation()
    void uploadImage(file)
  }

  function openEditor() {
    setEditing(true)
  }

  function saveEditor(event: React.FormEvent) {
    event.preventDefault()
    const url = editUrl.trim()
    if (!url) {
      setEditing(false)
      onUpdate({ url: "", caption: "", width: "", align: "" })
      return
    }
    onUpdate({
      url,
      caption: editCaption.trim(),
      language: editLink.trim(),
      width: editWidth === "full" ? "" : editWidth,
      align: editAlign === "center" ? "" : editAlign,
    })
    setEditing(false)
    toast.success(tr("Image updated"))
  }

  function pointFromEvent(event: React.MouseEvent<HTMLElement> | MouseEvent) {
    const box = imageBoxRef.current?.getBoundingClientRect()
    if (!box || box.width === 0 || box.height === 0) return null
    return {
      x: clamp(((event.clientX - box.left) / box.width) * 100, 0, 100),
      y: clamp(((event.clientY - box.top) / box.height) * 100, 0, 100),
    }
  }

  function beginAnnotation(event: React.MouseEvent<HTMLElement>) {
    if (!annotating || readOnly) return
    const origin = pointFromEvent(event)
    if (!origin) return
    const start = origin
    event.preventDefault()
    event.stopPropagation()
    let current = { ...start }
    setDraftRect({ x: start.x, y: start.y, width: 0, height: 0 })

    function onMove(moveEvent: MouseEvent) {
      const point = pointFromEvent(moveEvent)
      if (!point) return
      current = point
      setDraftRect({
        x: Math.min(start.x, point.x),
        y: Math.min(start.y, point.y),
        width: Math.abs(point.x - start.x),
        height: Math.abs(point.y - start.y),
      })
    }

    function onUp() {
      window.removeEventListener("mousemove", onMove)
      window.removeEventListener("mouseup", onUp)
      const rect = {
        x: Math.min(start.x, current.x),
        y: Math.min(start.y, current.y),
        width: Math.abs(current.x - start.x),
        height: Math.abs(current.y - start.y),
      }
      setDraftRect(null)
      setAnnotating(false)
      if (rect.width >= 2 && rect.height >= 2) {
        setCommentRect(rect)
        setCommentBody("")
      }
    }

    window.addEventListener("mousemove", onMove)
    window.addEventListener("mouseup", onUp)
  }

  async function submitAnnotation() {
    if (!commentRect || !commentBody.trim() || !pageId || commentPending) return
    setCommentPending(true)
    try {
      await api.pages.createComment(pageId, {
        blockId: block.id,
        quote: block.caption || tr("Image annotation"),
        startOffset: 0,
        endOffset: 0,
        body: commentBody.trim(),
        annotation: commentRect,
      })
      setCommentRect(null)
      setCommentBody("")
      toast.success(tr("Comment added"))
      onCommentsChanged?.()
      onOpenComments?.()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not add comment"))
    } finally {
      setCommentPending(false)
    }
  }

  function renderToolbar() {
    if (readOnly) return null
    return (
      <div className="absolute right-2 top-2 z-10 flex items-center gap-0.5 rounded-lg border border-border/70 bg-background/95 p-0.5 opacity-100 shadow-sm backdrop-blur transition-opacity md:opacity-0 md:group-hover/image:opacity-100 focus-within:opacity-100">
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); setLightbox(true) }}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={tr("View full size")}
          title={tr("View full size")}
        >
          <Maximize2 className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); openEditor() }}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={tr("Edit image")}
          title={tr("Edit image")}
        >
          <Pencil className="size-3.5" />
        </button>
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation()
            setAnnotating((value) => !value)
          }}
          aria-pressed={annotating}
          className={cn(
            "flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground",
            annotating && "bg-brand-soft text-brand",
          )}
          aria-label={tr("Annotate image")}
          title={tr("Annotate image")}
        >
          <MessageSquarePlus className="size-3.5" />
        </button>
        <label className="flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground" title={tr("Replace image")}>
          <Upload className="size-3.5" />
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={uploading}
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void uploadImage(file)
              event.target.value = ""
            }}
          />
          <span className="sr-only">{tr("Replace image")}</span>
        </label>
        <button
          type="button"
          onClick={(event) => { event.stopPropagation(); onUpdate({ url: "", caption: "" }) }}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
          aria-label={tr("Remove image")}
          title={tr("Remove image")}
        >
          <Trash2 className="size-3.5" />
        </button>
      </div>
    )
  }

  if (!block.url) {
    return (
      <div
        id={`block-input-${block.id}`}
        data-block-input
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault() }}
        onDrop={imageDrop}
        className="my-2 flex flex-col items-center gap-2 rounded-lg border border-dashed border-border bg-muted/20 px-4 py-6 outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
      >
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ImageIcon className="size-4" /> {tr("Embed an image")}
        </div>
        {!readOnly && <div className="flex w-full max-w-md gap-1.5">
          <input
            ref={urlInputRef}
            value={urlDraft}
            onChange={(event) => setUrlDraft(event.target.value)}
            onKeyDown={(event) => {
              if (isImeKeyEvent(event)) return
              if (event.key === "Enter") {
                event.preventDefault()
                const url = urlDraft.trim()
                if (url) onUpdate({ url })
              }
            }}
            placeholder={tr("Paste an image URL…")}
            aria-label={tr("Image URL")}
            className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
          />
          <button
            type="button"
            onClick={() => {
              const url = urlDraft.trim()
              if (url) onUpdate({ url })
            }}
            className="h-8 shrink-0 rounded-md bg-primary px-3 text-[11px] font-medium text-primary-foreground hover:bg-primary/90"
          >
            {tr("Embed")}
          </button>
          <label className="flex h-8 shrink-0 cursor-pointer items-center gap-1 rounded-md border px-2 text-[11px] text-muted-foreground transition hover:bg-accent hover:text-foreground">
            <Upload className="size-3" /> {uploading ? `${tr("Uploading…")} ${uploadProgress}%` : tr("Upload")}
            <input
              type="file"
              accept="image/*"
              className="hidden"
              disabled={uploading}
              onChange={(event) => {
                const file = event.target.files?.[0]
                if (file) void uploadImage(file)
                event.target.value = ""
              }}
            />
          </label>
        </div>}
        {uploadError && !uploading && (
          <div className="flex w-full max-w-md items-center gap-2 rounded-md border border-destructive/30 bg-destructive/5 px-2.5 py-2 text-xs text-destructive">
            <span className="min-w-0 flex-1 truncate">{uploadError}</span>
            <button type="button" onClick={retryUpload} className="shrink-0 rounded bg-destructive px-2 py-1 text-[11px] font-medium text-destructive-foreground hover:bg-destructive/90">{tr("Retry")}</button>
            <button type="button" onClick={() => { setUploadError(null); pendingFileRef.current = null }} className="shrink-0 rounded border px-2 py-1 text-[11px] hover:bg-accent">{tr("Dismiss")}</button>
          </div>
        )}
      </div>
    )
  }

  return (
    <>
      <figure
        id={`block-input-${block.id}`}
        data-block-input
        tabIndex={0}
        onKeyDown={onKeyDown}
        onFocus={onFocus}
        onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault() }}
        onDrop={imageDrop}
        className="group/image relative my-2 overflow-hidden rounded-lg outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
      >
        <div
          ref={imageBoxRef}
          className={cn("relative", imageWidthClass(width), imageAlignClass(align))}
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
                {tr("Replace URL")}
              </button>}
            </div>
          ) : (
            <button
              type="button"
              onClick={(event) => {
                if (annotating) return
                if (block.language) {
                  window.open(block.language, "_blank", "noopener")
                  return
                }
                event.stopPropagation()
                setLightbox(true)
              }}
              title={block.language ? block.language : undefined}
              className="block w-full cursor-zoom-in outline-none"
              aria-label={block.language ? tr("Open link") : tr("View full size")}
            >
              <img
                src={block.url}
                alt={block.caption || "Image"}
                loading="lazy"
                decoding="async"
                onError={() => setImageError(true)}
                onLoad={(e) => {
                  const img = e.currentTarget
                  if (img.naturalWidth && img.naturalHeight) {
                    img.style.aspectRatio = `${img.naturalWidth} / ${img.naturalHeight}`
                  }
                }}
                style={{ aspectRatio: "16 / 9" }}
                className="max-h-[440px] w-full bg-muted/30 object-contain"
              />
            </button>
          )}

          {uploading && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/55 backdrop-blur-[1px]">
              <div className="w-40 rounded-full bg-muted p-1">
                <div className="h-1.5 rounded-full bg-brand transition-[width] duration-200" style={{ width: `${uploadProgress}%` }} />
              </div>
              <span className="absolute bottom-2 right-2 rounded bg-background/90 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                {uploadProgress}%
              </span>
            </div>
          )}

          {!annotating && annotations.length > 0 && (
            <div className="pointer-events-none absolute inset-0">
              {annotations.map((comment, index) => {
                const area = comment.annotation!
                return (
                  <button
                    key={comment.id}
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation()
                      onOpenComments?.()
                    }}
                    aria-label={tr("Open image comment")}
                    className="pointer-events-auto absolute rounded-sm border-2 border-amber-400 bg-amber-300/15 shadow-[0_0_0_1px_rgba(0,0,0,0.25)] transition hover:bg-amber-300/25"
                    style={{
                      left: `${area.x}%`,
                      top: `${area.y}%`,
                      width: `${area.width}%`,
                      height: `${area.height}%`,
                    }}
                  >
                    <span className="absolute -left-2 -top-2 flex size-4 items-center justify-center rounded-full bg-amber-400 text-[9px] font-bold text-black shadow">
                      {index + 1}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {annotating && (
            <div
              className="absolute inset-0 cursor-crosshair bg-black/10"
              onMouseDown={beginAnnotation}
            >
              {draftRect && (
                <div
                  className="pointer-events-none absolute border-2 border-dashed border-amber-400 bg-amber-300/20"
                  style={{
                    left: `${draftRect.x}%`,
                    top: `${draftRect.y}%`,
                    width: `${draftRect.width}%`,
                    height: `${draftRect.height}%`,
                  }}
                />
              )}
            </div>
          )}
        </div>

        {renderToolbar()}

        {readOnly ? (
          block.caption && (
            <figcaption className="mt-2 px-2 text-center text-xs text-muted-foreground">
              {block.caption}
            </figcaption>
          )
        ) : (
          <figcaption className="mt-2 px-2">
            <input
              value={block.caption ?? ""}
              onChange={(event) => onUpdate({ caption: event.target.value })}
              onFocus={onFocus}
              placeholder={tr("Add a caption…")}
              aria-label={tr("Image caption")}
              className="mx-auto block w-full max-w-xl border-0 bg-transparent text-center text-xs text-muted-foreground outline-none placeholder:text-muted-foreground/40 focus:text-foreground"
            />
          </figcaption>
        )}
        {annotating && (
          <div className="mt-2 flex items-center justify-center gap-1 text-[10px] text-amber-600 dark:text-amber-300">
            <MessageSquarePlus className="size-3" /> {tr("Drag on the image to select an area")}
          </div>
        )}
      </figure>

      <Dialog open={lightbox} onOpenChange={setLightbox}>
        <DialogContent
          showCloseButton={false}
          className="max-h-[96svh] w-[96vw] max-w-[96vw] gap-2 border-0 bg-black/95 p-2 text-white shadow-2xl"
        >
          <DialogTitle className="sr-only">{block.caption || tr("Image preview")}</DialogTitle>
          <DialogDescription className="sr-only">{tr("Full-size image preview")}</DialogDescription>
          <button
            type="button"
            onClick={() => setLightbox(false)}
            aria-label={tr("Close")}
            className="absolute right-3 top-3 z-10 flex size-8 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
          >
            <X className="size-4" />
          </button>
          <div className="flex max-h-[88svh] items-center justify-center overflow-auto">
            <img src={block.url} alt={block.caption || "Image"} className="max-h-[88svh] max-w-full object-contain" />
          </div>
          <div className="flex items-center gap-3 px-2 pb-1 text-xs text-white/65">
            <span className="min-w-0 flex-1 truncate">{block.caption}</span>
            <a href={block.url} target="_blank" rel="noreferrer" className="shrink-0 underline underline-offset-2 hover:text-white">
              {tr("Open original")}
            </a>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={editing} onOpenChange={setEditing}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{tr("Edit image")}</DialogTitle>
            <DialogDescription>{tr("Adjust the image URL, caption and layout.")}</DialogDescription>
          </DialogHeader>
          <form onSubmit={saveEditor} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={`image-url-${block.id}`}>{tr("Image URL")}</Label>
              <Input
                id={`image-url-${block.id}`}
                value={editUrl}
                onChange={(event) => setEditUrl(event.target.value)}
                placeholder="https://…"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`image-link-${block.id}`}>{tr("Link URL (optional)")}</Label>
              <Input
                id={`image-link-${block.id}`}
                value={editLink}
                onChange={(event) => setEditLink(event.target.value)}
                placeholder="https://…"
                inputMode="url"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor={`image-caption-${block.id}`}>{tr("Image caption")}</Label>
              <Input
                id={`image-caption-${block.id}`}
                value={editCaption}
                onChange={(event) => setEditCaption(event.target.value)}
                placeholder={tr("Add a caption…")}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor={`image-width-${block.id}`}>{tr("Image size")}</Label>
                <select
                  id={`image-width-${block.id}`}
                  value={editWidth}
                  onChange={(event) => setEditWidth(event.target.value)}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm outline-none"
                >
                  {WIDTHS.map((option) => <option key={option.value} value={option.value}>{tr(option.label)}</option>)}
                </select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor={`image-align-${block.id}`}>{tr("Align")}</Label>
                <select
                  id={`image-align-${block.id}`}
                  value={editAlign}
                  onChange={(event) => setEditAlign(event.target.value)}
                  className="h-9 w-full rounded-md border bg-background px-2 text-sm outline-none"
                >
                  {ALIGNMENTS.map((option) => <option key={option.value} value={option.value}>{tr(option.label)}</option>)}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-dashed p-2 text-xs text-muted-foreground">
              <Link2 className="size-3.5 shrink-0" />
              <span className="min-w-0 flex-1 truncate">{block.url}</span>
              <label className="shrink-0 cursor-pointer rounded border px-2 py-1 text-[11px] hover:bg-accent">
                {uploading ? `${tr("Uploading…")} ${uploadProgress}%` : tr("Replace")}
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  disabled={uploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void uploadImage(file)
                    event.target.value = ""
                  }}
                />
              </label>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setEditing(false)}>{tr("Cancel")}</Button>
              <Button type="submit">{tr("Save")}</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(commentRect)} onOpenChange={(open) => { if (!open) setCommentRect(null) }}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{tr("Comment on image")}</DialogTitle>
            <DialogDescription>{tr("The selected area will stay highlighted on the image.")}</DialogDescription>
          </DialogHeader>
          <textarea
            autoFocus
            value={commentBody}
            onChange={(event) => setCommentBody(event.target.value)}
            onKeyDown={(event) => {
              if (isImeKeyEvent(event)) return
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault()
                void submitAnnotation()
              }
            }}
            rows={3}
            placeholder={tr("Write a comment…")}
            className="w-full resize-none rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setCommentRect(null)}>{tr("Cancel")}</Button>
            <Button type="button" onClick={() => void submitAnnotation()} disabled={!commentBody.trim() || commentPending}>
              {commentPending ? <Check className="size-3.5 animate-pulse" /> : null} {tr("Comment")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
