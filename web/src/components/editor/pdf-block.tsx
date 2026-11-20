import { useEffect, useRef, useState } from "react"
import { ArrowUpRight, Download, FileUp, Loader2, Maximize2, Minimize2, RefreshCw, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { api, getToken } from "@/lib/api"
import type { Block } from "@/lib/types"
import { tr } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { safeHttpUrl } from "@/components/editor/rich-blocks"

/**
 * Inline PDF preview. Uploads land in the workspace file store; private files
 * are fetched with the session token and shown via a blob URL so the browser's
 * native PDF viewer can render them without exposing the token in the URL.
 */
export function PdfBlock({
  block,
  readOnly,
  autoFocus,
  workspaceId,
  onUpdate,
}: {
  block: Block
  readOnly: boolean
  autoFocus?: boolean
  workspaceId?: string
  onUpdate: (patch: Partial<Block>) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [progress, setProgress] = useState(0)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState("")
  const [blobUrl, setBlobUrl] = useState("")
  const [expanded, setExpanded] = useState(false)
  const rawUrl = block.url ?? ""
  const name = block.text || rawUrl.split("/").filter(Boolean).pop() || "document.pdf"
  const previewSrc = blobUrl || (rawUrl.startsWith("/") ? "" : safeHttpUrl(rawUrl)?.toString() ?? "")

  useEffect(() => {
    if (autoFocus && !rawUrl) inputRef.current?.focus()
  }, [autoFocus, rawUrl])

  useEffect(() => {
    setBlobUrl("")
    setError("")
    if (!rawUrl.startsWith("/api/files/")) return
    let alive = true
    let objectUrl = ""
    const token = getToken()
    fetch(rawUrl, { headers: token ? { Authorization: `Bearer ${token}` } : {} })
      .then(async (response) => {
        if (!response.ok) throw new Error(response.status === 401 ? tr("Attachment access denied") : `HTTP ${response.status}`)
        return response.blob()
      })
      .then((blob) => {
        if (!alive) return
        objectUrl = URL.createObjectURL(new Blob([blob], { type: "application/pdf" }))
        setBlobUrl(objectUrl)
      })
      .catch((err) => {
        if (alive) setError(err instanceof Error ? err.message : tr("Could not load PDF"))
      })
    return () => {
      alive = false
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [rawUrl])

  async function upload(file: File) {
    if (!workspaceId || uploading) return
    if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
      setError(tr("Choose a PDF file"))
      return
    }
    setUploading(true)
    setProgress(0)
    setError("")
    try {
      const uploaded = await api.files.upload(file, workspaceId, setProgress)
      onUpdate({ url: uploaded.url, text: uploaded.name, caption: "", rich: "" })
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("Could not upload PDF"))
    } finally {
      setUploading(false)
    }
  }

  if (!rawUrl) {
    return (
      <div
        id={`block-input-${block.id}`}
        data-block-input
        tabIndex={0}
        onDragOver={(event) => {
          if (readOnly) return
          event.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(event) => {
          if (readOnly) return
          event.preventDefault()
          setDragging(false)
          const file = event.dataTransfer.files?.[0]
          if (file) void upload(file)
        }}
        onKeyDown={(event) => {
          if (readOnly) return
          if (event.key === "Enter" || event.key === " ") {
            event.preventDefault()
            inputRef.current?.click()
          }
        }}
        className={cn(
          "my-2 flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-8 text-center transition",
          dragging ? "border-brand bg-brand-soft/30" : "border-border bg-muted/15",
          !readOnly && "cursor-pointer hover:border-brand/60 hover:bg-brand-soft/20",
        )}
        onClick={() => {
          if (!readOnly) inputRef.current?.click()
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept="application/pdf,.pdf"
          className="hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void upload(file)
            event.target.value = ""
          }}
        />
        {uploading ? (
          <>
            <Loader2 className="size-5 animate-spin text-brand" />
            <span className="text-xs font-medium">{tr("Uploading PDF… {n}%", { n: progress })}</span>
          </>
        ) : (
          <>
            <FileUp className="size-5 text-muted-foreground" />
            <span className="text-xs font-medium">{readOnly ? tr("No PDF attached") : tr("Upload a PDF or drop it here")}</span>
            <span className="text-[11px] text-muted-foreground">{tr("Shown inline with the browser's PDF viewer")}</span>
          </>
        )}
        {error && <span className="text-[11px] text-destructive">{error}</span>}
      </div>
    )
  }

  const href = previewSrc || rawUrl
  return (
    <div className="group relative my-2 overflow-hidden rounded-xl bg-card shadow-sm">
      <div className="flex items-center gap-2 border-b bg-muted/40 px-3 py-1.5">
        <span className="flex min-w-0 items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <FileUp className="size-3.5 shrink-0" />
          <span className="truncate">{name}</span>
        </span>
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          <a href={href} target="_blank" rel="noreferrer noopener" className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={tr("Open in new tab")} data-catch-event="pdf_open">
            <ArrowUpRight className="size-3.5" />
          </a>
          <a href={href} download={name} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={tr("Download")} data-catch-event="pdf_download">
            <Download className="size-3.5" />
          </a>
          {!readOnly && (
            <>
              <button type="button" onClick={() => inputRef.current?.click()} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={tr("Replace PDF")} data-catch-event="pdf_replace">
                <RefreshCw className="size-3.5" />
              </button>
              <button type="button" onClick={() => setExpanded((value) => !value)} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground" aria-label={expanded ? tr("Collapse") : tr("Expand")}>
                {expanded ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
              </button>
              <button
                type="button"
                onClick={() => onUpdate({ url: "", text: "", caption: "" })}
                className="rounded p-1 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                aria-label={tr("Remove PDF")}
              >
                <Trash2 className="size-3.5" />
              </button>
            </>
          )}
        </div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0]
          if (file) void upload(file)
          event.target.value = ""
        }}
      />
      {previewSrc ? (
        <iframe
          src={previewSrc}
          title={name}
          loading="lazy"
          sandbox="allow-same-origin allow-presentation"
          className={cn("w-full bg-white", expanded ? "h-[min(860px,80svh)]" : "h-[min(560px,55svh)]")}
        />
      ) : (
        <div className="flex h-40 items-center justify-center gap-2 text-xs text-muted-foreground">
          {error ? <span className="text-destructive">{error}</span> : <Loader2 className="size-4 animate-spin" />}
          {!error && tr("Loading PDF…")}
        </div>
      )}
      {error && previewSrc && (
        <div className="border-t px-3 py-1.5 text-[11px] text-destructive">{error}</div>
      )}
    </div>
  )
}

export function PdfBlockRenderer(props: {
  block: Block
  readOnly: boolean
  autoFocus?: boolean
  workspaceId?: string
  onUpdate: (patch: Partial<Block>) => void
}) {
  return <PdfBlock {...props} />
}
