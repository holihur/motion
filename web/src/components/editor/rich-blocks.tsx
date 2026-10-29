import { useEffect, useMemo, useRef, useState } from "react"
import {
  ArrowUpRight,
  Bookmark,
  FileArchive,
  FileAudio,
  FileCode2,
  FileImage,
  FileJson,
  FileSpreadsheet,
  FileText,
  FileVideo,
  Frame,
  Hash,
  ListTree,
  Pencil,
  Play,
  Presentation,
  Sigma,
  Upload,
  Video,
} from "lucide-react"
import katex from "katex"
import "katex/dist/katex.min.css"
import type { Block } from "@/lib/types"
import { api } from "@/lib/api"
import { tr } from "@/lib/i18n"
import { isImeKeyEvent } from "@/lib/keyboard"
import { cn } from "@/lib/utils"

export interface HeadingItem {
  id: string
  text: string
  level: 1 | 2 | 3
}

function safeHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value)
    return url.protocol === "http:" || url.protocol === "https:" ? url : null
  } catch {
    return null
  }
}

function faviconFor(value: string) {
  try {
    return new URL("/favicon.ico", value).toString()
  } catch {
    return ""
  }
}

function hostFor(value: string) {
  const url = safeHttpUrl(value)
  return url?.hostname.replace(/^www\./, "") ?? value
}

function LinkPrompt({
  block,
  kind,
  readOnly,
  autoFocus,
  workspaceId,
  onUpdate,
}: {
  block: Block
  kind: "bookmark" | "video" | "embed" | "file"
  readOnly: boolean
  autoFocus?: boolean
  workspaceId?: string
  onUpdate: (patch: Partial<Block>) => void
}) {
  const [url, setUrl] = useState(block.url ?? "")
  const [title, setTitle] = useState(block.text ?? "")
  const [caption, setCaption] = useState(block.caption ?? "")
  const [error, setError] = useState("")
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const config = {
    bookmark: { label: tr("Link URL"), placeholder: "https://example.com", icon: Bookmark },
    video: { label: tr("Video URL"), placeholder: "https://www.youtube.com/watch?v=…", icon: Video },
    embed: { label: tr("Embed URL"), placeholder: "https://example.com/embed", icon: Frame },
    file: { label: tr("File URL"), placeholder: "https://example.com/file.pdf", icon: FileText },
  }[kind]
  const Icon = config.icon

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  async function upload(file: File) {
    if (!workspaceId || uploading) return
    setUploading(true)
    setError("")
    try {
      const uploaded = await api.files.upload(file, workspaceId)
      setUrl(uploaded.url)
      setTitle(uploaded.name)
      setError("")
      onUpdate({ url: uploaded.url, text: uploaded.name, caption: "", rich: "" })
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("Could not upload file"))
    } finally {
      setUploading(false)
    }
  }

  function save() {
    const value = url.trim()
    if (!safeHttpUrl(value)) {
      setError(tr("Enter a valid http(s) URL."))
      return
    }
    onUpdate({ url: value, text: title.trim(), caption: caption.trim(), rich: "" })
  }

  return (
    <div
      id={`block-input-${block.id}`}
      data-block-input
      tabIndex={0}
      className="my-2 space-y-2 rounded-xl border border-dashed border-border bg-muted/15 p-3.5 outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Icon className="size-3.5" /> {config.label}
      </div>
      <input
        ref={inputRef}
        value={url}
        readOnly={readOnly}
        onChange={(event) => { setUrl(event.target.value); setError("") }}
        onKeyDown={(event) => {
          if (isImeKeyEvent(event)) return
          if (event.key === "Enter") {
            event.preventDefault()
            save()
          }
        }}
        placeholder={config.placeholder}
        className="h-8 w-full rounded-md border bg-background px-2.5 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
      />
      {kind !== "video" && kind !== "embed" && (
        <div className="grid gap-2 sm:grid-cols-2">
          <input
            value={title}
            readOnly={readOnly}
            onChange={(event) => setTitle(event.target.value)}
            placeholder={kind === "file" ? tr("File name (optional)") : tr("Title (optional)")}
            className="h-8 w-full rounded-md border bg-background px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
          />
          <input
            value={caption}
            readOnly={readOnly}
            onChange={(event) => setCaption(event.target.value)}
            placeholder={kind === "file" ? tr("Size or note (optional)") : tr("Description (optional)")}
            className="h-8 w-full rounded-md border bg-background px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
          />
        </div>
      )}
      {error && <p className="text-[11px] text-destructive">{error}</p>}
      {!readOnly && (
        <div className="flex flex-wrap items-center justify-end gap-2">
          {kind === "file" && workspaceId && (
            <label className="flex cursor-pointer items-center gap-1 rounded-md border px-2.5 py-1.5 text-[11px] text-muted-foreground transition hover:bg-accent hover:text-foreground">
              <Upload className="size-3" /> {uploading ? tr("Uploading…") : tr("Upload file")}
              <input type="file" className="hidden" disabled={uploading} onChange={(event) => { const file = event.target.files?.[0]; if (file) void upload(file); event.target.value = "" }} />
            </label>
          )}
          <button
            type="button"
            onClick={save}
            className="rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground transition hover:bg-primary/90"
          >
            {kind === "bookmark" ? tr("Add bookmark") : kind === "video" ? tr("Embed video") : kind === "embed" ? tr("Embed") : tr("Add file")}
          </button>
        </div>
      )}
    </div>
  )
}

function CardActions({ onEdit }: { onEdit: () => void }) {
  return (
    <button
      type="button"
      onClick={onEdit}
      className="absolute right-2 top-2 flex items-center gap-1 rounded-md bg-background/90 px-1.5 py-1 text-[10px] text-muted-foreground opacity-0 shadow-sm ring-1 ring-border transition group-hover:opacity-100 hover:text-foreground"
    >
      <Pencil className="size-3" /> {tr("Edit")}
    </button>
  )
}

export function BookmarkBlock({
  block, readOnly, autoFocus, onUpdate,
}: {
  block: Block; readOnly: boolean; autoFocus?: boolean; onUpdate: (patch: Partial<Block>) => void
}) {
  const [editing, setEditing] = useState(!block.url)
  const [iconState, setIconState] = useState<"loading" | "ok" | "error">("loading")
  useEffect(() => { if (!block.url) setEditing(true) }, [block.url])
  useEffect(() => { setIconState(faviconFor(block.url ?? "") ? "loading" : "error") }, [block.url])
  if (editing) {
    return <LinkPrompt block={block} kind="bookmark" readOnly={readOnly} autoFocus={autoFocus} onUpdate={(patch) => { onUpdate(patch); setEditing(false) }} />
  }
  const url = safeHttpUrl(block.url ?? "")
  const title = block.text || hostFor(block.url ?? "")
  return (
    <div className="group relative my-2">
      <a
        href={url?.toString() ?? "#"}
        target="_blank"
        rel="noreferrer noopener"
        className="flex items-center gap-3 rounded-xl border border-border/80 bg-card px-3.5 py-3 transition hover:border-brand/40 hover:bg-accent/25"
      >
        <span className="relative flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-brand-soft text-brand">
          {iconState === "loading" && <span className="absolute inset-1 animate-pulse rounded bg-brand/15" />}
          {iconState !== "error" && faviconFor(block.url ?? "") && (
            <img
              src={faviconFor(block.url ?? "")}
              alt=""
              loading="lazy"
              referrerPolicy="no-referrer"
              className={cn("size-5 rounded-sm", iconState === "ok" ? "opacity-100" : "opacity-0")}
              onLoad={() => setIconState("ok")}
              onError={() => setIconState("error")}
            />
          )}
          {iconState === "error" && <Bookmark className="size-4" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{title}</span>
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{block.caption || block.url}</span>
        </span>
        <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
      </a>
      {!readOnly && <CardActions onEdit={() => setEditing(true)} />}
    </div>
  )
}

function videoEmbed(value: string) {
  try {
    const url = new URL(value)
    const host = url.hostname.replace(/^www\./, "")
    if (host === "youtu.be") return `https://www.youtube-nocookie.com/embed/${url.pathname.slice(1)}`
    if (host.endsWith("youtube.com")) {
      const id = url.searchParams.get("v") ?? url.pathname.split("/").filter(Boolean).pop()
      if (id) return `https://www.youtube-nocookie.com/embed/${id}`
    }
    if (host.endsWith("vimeo.com")) {
      const id = url.pathname.split("/").filter(Boolean).pop()
      if (id && /^\d+$/.test(id)) return `https://player.vimeo.com/video/${id}`
    }
    if (host.includes("bilibili.com")) {
      const avid = url.searchParams.get("aid")
      const bvid = url.pathname.match(/(BV\w+)/)?.[1] ?? url.searchParams.get("bvid")
      if (bvid) return `https://player.bilibili.com/player.html?bvid=${bvid}`
      if (avid) return `https://player.bilibili.com/player.html?aid=${avid}`
    }
    if (host.endsWith("youku.com")) {
      const id = url.pathname.split("/").filter(Boolean).pop()
      if (id) return `https://player.youku.com/embed/${id}`
    }
  } catch {
    return null
  }
  return null
}

export function VideoBlock({
  block, readOnly, autoFocus, onUpdate,
}: {
  block: Block; readOnly: boolean; autoFocus?: boolean; onUpdate: (patch: Partial<Block>) => void
}) {
  const [editing, setEditing] = useState(!block.url)
  useEffect(() => { if (!block.url) setEditing(true) }, [block.url])
  if (editing) {
    return <LinkPrompt block={block} kind="video" readOnly={readOnly} autoFocus={autoFocus} onUpdate={(patch) => { onUpdate(patch); setEditing(false) }} />
  }
  const embed = videoEmbed(block.url ?? "")
  return (
    <div className="group relative my-2">
      {embed ? (
        <div className="overflow-hidden rounded-xl border border-border/80 bg-black">
          <iframe
            src={embed}
            title={block.caption || "Embedded video"}
            allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen"
            allowFullScreen
            loading="lazy"
            className="aspect-video w-full"
          />
        </div>
      ) : (
        <a href={safeHttpUrl(block.url ?? "")?.toString() ?? "#"} target="_blank" rel="noreferrer noopener" className="flex items-center gap-3 rounded-xl border px-3.5 py-3 text-xs hover:bg-accent/30">
          <Play className="size-4 text-brand" />
          <span className="min-w-0 flex-1 truncate">{block.caption || block.url}</span>
          <ArrowUpRight className="size-3.5 text-muted-foreground" />
        </a>
      )}
      {block.caption && embed && <div className="mt-1.5 text-center text-[11px] text-muted-foreground">{block.caption}</div>}
      {!readOnly && <CardActions onEdit={() => setEditing(true)} />}
    </div>
  )
}

export function EmbedBlock({
  block, readOnly, autoFocus, onUpdate,
}: {
  block: Block; readOnly: boolean; autoFocus?: boolean; onUpdate: (patch: Partial<Block>) => void
}) {
  const [editing, setEditing] = useState(!block.url)
  const [loading, setLoading] = useState(true)
  useEffect(() => { if (!block.url) setEditing(true) }, [block.url])
  if (editing) {
    return <LinkPrompt block={block} kind="embed" readOnly={readOnly} autoFocus={autoFocus} onUpdate={(patch) => { onUpdate(patch); setEditing(false) }} />
  }
  return (
    <div className="group relative my-2 overflow-hidden rounded-xl border border-border/80 bg-card">
      <div className="flex items-center gap-1.5 border-b border-border/60 px-2.5 py-1.5 text-[10px] text-muted-foreground">
        <Frame className="size-3" /> <span className="truncate">{hostFor(block.url ?? "")}</span>
        <a href={safeHttpUrl(block.url ?? "")?.toString() ?? "#"} target="_blank" rel="noreferrer noopener" className="ml-auto flex items-center gap-1 hover:text-foreground">
          {tr("Open")} <ArrowUpRight className="size-3" />
        </a>
      </div>
      <div className="relative">
        {loading && <div className="absolute inset-0 flex items-center justify-center bg-muted/30"><div className="h-6 w-6 animate-spin rounded-full border-2 border-brand border-t-transparent" /></div>}
        <iframe
          src={safeHttpUrl(block.url ?? "")?.toString() ?? "about:blank"}
          title={block.caption || "Embedded content"}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups allow-presentation"
          allow="clipboard-write; encrypted-media; picture-in-picture; fullscreen"
          referrerPolicy="no-referrer"
          loading="lazy"
          onLoad={() => setLoading(false)}
          className="h-[360px] w-full bg-background"
        />
      </div>
      {!readOnly && <CardActions onEdit={() => setEditing(true)} />}
    </div>
  )
}

function fileVisual(name: string) {
  const extension = name.split(".").pop()?.toLowerCase() ?? ""
  if (["pdf"].includes(extension)) return { Icon: FileText, className: "bg-red-500/10 text-red-600 dark:text-red-400" }
  if (["doc", "docx", "rtf", "odt"].includes(extension)) return { Icon: FileText, className: "bg-blue-500/10 text-blue-600 dark:text-blue-400" }
  if (["xls", "xlsx", "csv", "ods"].includes(extension)) return { Icon: FileSpreadsheet, className: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" }
  if (["ppt", "pptx", "key", "odp"].includes(extension)) return { Icon: Presentation, className: "bg-orange-500/10 text-orange-600 dark:text-orange-400" }
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "avif", "heic"].includes(extension)) return { Icon: FileImage, className: "bg-violet-500/10 text-violet-600 dark:text-violet-400" }
  if (["mp3", "wav", "ogg", "m4a", "flac", "aac"].includes(extension)) return { Icon: FileAudio, className: "bg-pink-500/10 text-pink-600 dark:text-pink-400" }
  if (["mp4", "mov", "webm", "mkv", "avi"].includes(extension)) return { Icon: FileVideo, className: "bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400" }
  if (["zip", "rar", "7z", "tar", "gz", "bz2"].includes(extension)) return { Icon: FileArchive, className: "bg-amber-500/10 text-amber-600 dark:text-amber-400" }
  if (["json", "yaml", "yml", "toml"].includes(extension)) return { Icon: FileJson, className: "bg-cyan-500/10 text-cyan-600 dark:text-cyan-400" }
  if (["js", "jsx", "ts", "tsx", "go", "py", "rb", "rs", "java", "c", "cpp", "h", "css", "html", "sh", "sql"].includes(extension)) return { Icon: FileCode2, className: "bg-sky-500/10 text-sky-600 dark:text-sky-400" }
  return { Icon: FileText, className: "bg-muted text-muted-foreground" }
}

export function FileBlock({
  block, readOnly, autoFocus, workspaceId, onUpdate,
}: {
  block: Block; readOnly: boolean; autoFocus?: boolean; workspaceId?: string; onUpdate: (patch: Partial<Block>) => void
}) {
  const [editing, setEditing] = useState(!block.url)
  const [pdfExpanded, setPdfExpanded] = useState(false)
  useEffect(() => { if (!block.url) setEditing(true) }, [block.url])
  if (editing) {
    return <LinkPrompt block={block} kind="file" readOnly={readOnly} autoFocus={autoFocus} workspaceId={workspaceId} onUpdate={(patch) => { onUpdate(patch); setEditing(false) }} />
  }
  const name = block.text || block.url?.split("/").filter(Boolean).pop() || tr("Attachment")
  const visual = fileVisual(name)
  const FileIcon = visual.Icon
  const rawUrl = block.url ?? ""
  const isPdf = (() => {
    const v = `${name} ${rawUrl}`.toLowerCase()
    return v.includes(".pdf")
  })()
  const href = rawUrl.startsWith("/") ? rawUrl : safeHttpUrl(rawUrl)?.toString() ?? "#"
  const iframeSrc = rawUrl.startsWith("/") ? rawUrl : safeHttpUrl(rawUrl)?.toString() ?? rawUrl
  return (
    <div className="group relative my-2">
      <a
        href={href}
        target="_blank"
        rel="noreferrer noopener"
        download={!isPdf ? name : undefined}
        className="flex items-center gap-3 rounded-xl border border-border/80 bg-card px-3.5 py-3 transition hover:border-brand/40 hover:bg-accent/25"
      >
        <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-lg", visual.className)}>
          <FileIcon className="size-4" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[13px] font-medium">{name}</span>
          <span className="mt-0.5 block truncate text-[11px] text-muted-foreground">{block.caption || hostFor(rawUrl)}</span>
        </span>
        <ArrowUpRight className="size-3.5 shrink-0 text-muted-foreground" />
      </a>
      {isPdf && rawUrl && (
        <div className="mt-2 overflow-hidden rounded-xl border border-border/80 bg-white shadow-sm">
          <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-1.5">
            <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <FileText className="size-3.5" /> {tr("PDF Preview")}
            </span>
            <div className="flex items-center gap-1">
              <a href={href} target="_blank" rel="noreferrer noopener" className="rounded px-2 py-1 text-[11px] hover:bg-accent">
                {tr("Open")}
              </a>
              <a href={href} download={name} className="rounded px-2 py-1 text-[11px] hover:bg-accent">
                {tr("Download")}
              </a>
              <button type="button" onClick={() => setPdfExpanded((v) => !v)} className="rounded px-2 py-1 text-[11px] hover:bg-accent">
                {pdfExpanded ? tr("Collapse") : tr("Expand")}
              </button>
            </div>
          </div>
          <iframe
            src={iframeSrc}
            title={name}
            loading="lazy"
            className={cn("w-full bg-white", pdfExpanded ? "h-[800px]" : "h-[480px]")}
          />
        </div>
      )}
      {!readOnly && <CardActions onEdit={() => setEditing(true)} />}
    </div>
  )
}

export function EquationBlock({
  block, readOnly, autoFocus, onUpdate,
}: {
  block: Block; readOnly: boolean; autoFocus?: boolean; onUpdate: (patch: Partial<Block>) => void
}) {
  const [editing, setEditing] = useState(!block.text)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const html = useMemo(() => {
    try {
      return katex.renderToString(block.text || "E = mc^2", { displayMode: true, throwOnError: false, strict: false })
    } catch {
      return ""
    }
  }, [block.text])
  useEffect(() => { if (autoFocus) textareaRef.current?.focus() }, [autoFocus])
  return (
    <div
      id={`block-input-${block.id}`}
      data-block-input
      tabIndex={0}
      className="my-2 overflow-hidden rounded-xl border border-border/80 bg-card"
    >
      <div className="flex items-center gap-1.5 border-b border-border/60 px-2.5 py-1.5 text-[10px] text-muted-foreground">
        <Sigma className="size-3" /> {tr("Equation")}
        <button
          type="button"
          onClick={() => void navigator.clipboard.writeText(block.text).then(() => toast.success(tr("Copied to clipboard")), () => toast.error(tr("Could not copy")))}
          className="ml-auto rounded px-1.5 py-0.5 text-[10px] transition hover:bg-accent hover:text-foreground"
        >
          {tr("Copy")}
        </button>
        <button
          type="button"
          onClick={() => setEditing((value) => !value)}
          className="rounded px-2 py-0.5 text-[10px] transition hover:bg-accent hover:text-foreground"
        >
          {editing ? tr("Preview") : tr("Edit source")}
        </button>
      </div>
      {editing && (
        <textarea
          ref={textareaRef}
          value={block.text}
          readOnly={readOnly}
          onChange={(event) => onUpdate({ text: event.target.value })}
          rows={3}
          spellCheck={false}
          placeholder={"\\frac{a}{b} = c^2"}
          className="block w-full resize-y bg-transparent p-3 font-mono text-xs leading-5 outline-none placeholder:text-muted-foreground/50"
        />
      )}
      <div
        className={cn("overflow-x-auto px-4 py-4 text-center", editing && "border-t border-border/60 bg-muted/15")}
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  )
}

export function TocBlock({
  block, headings, readOnly,
}: {
  block: Block
  headings: HeadingItem[]
  readOnly: boolean
}) {
  const [activeId, setActiveId] = useState<string | null>(null)
  useEffect(() => {
    const ids = headings.map((h) => h.id)
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) if (entry.isIntersecting) { setActiveId(entry.target.getAttribute("data-block-id")); break }
      },
      { rootMargin: "-40% 0px -55% 0px", threshold: 0 }
    )
    ids.forEach((id) => {
      const el = document.querySelector<HTMLElement>(`[data-block-id="${id}"]`)
      if (el) observer.observe(el)
    })
    return () => observer.disconnect()
  }, [headings])
  return (
    <div
      id={`block-input-${block.id}`}
      data-block-input
      tabIndex={0}
      className="my-2 rounded-xl border border-border/80 bg-card p-3.5"
    >
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <ListTree className="size-3.5" /> {block.text || tr("Table of contents")}
      </div>
      {headings.length === 0 ? (
        <p className="mt-2 text-[11px] text-muted-foreground">{tr("Add headings to build a table of contents.")}</p>
      ) : (
        <nav className="mt-2 space-y-0.5">
          {headings.map((heading) => (
            <button
              key={heading.id}
              type="button"
              onClick={() => {
                window.dispatchEvent(new CustomEvent("motion:scroll-block", { detail: { id: heading.id } }))
                document.querySelector<HTMLElement>(`[data-block-id="${heading.id}"]`)?.scrollIntoView({ block: "center", behavior: "smooth" })
                if (!readOnly) window.dispatchEvent(new CustomEvent("motion:focus-block", { detail: { id: heading.id, where: "end" } }))
              }}
              className={cn(
                "flex w-full items-center gap-1.5 rounded px-1.5 py-1 text-left text-xs transition hover:bg-accent hover:text-foreground",
                heading.level === 1 && "font-medium",
                heading.level === 2 && "pl-4",
                heading.level === 3 && "pl-7 text-[11px]",
                activeId === heading.id ? "bg-brand-soft font-medium text-brand" : "text-muted-foreground",
              )}
            >
              <Hash className={cn("size-3 shrink-0", activeId === heading.id ? "opacity-100" : "opacity-50")} />
              <span className="truncate">{heading.text || tr("Untitled heading")}</span>
            </button>
          ))}
        </nav>
      )}
    </div>
  )
}
