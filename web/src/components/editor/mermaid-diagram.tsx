import { useEffect, useId, useRef, useState } from "react"
import { AlertTriangle, Download, Hand, Loader2, Maximize, Minimize, ZoomIn, ZoomOut } from "lucide-react"
import { toast } from "sonner"
import { useThemeStore } from "@/stores/theme"
import { tr } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"

import { peekMermaidCache, renderMermaid } from "@/lib/mermaid-render"
import { renderDiagramImage } from "@/lib/mermaid-export"

export function MermaidDiagram({ source }: { source: string }) {
  const isDark = useThemeStore((state) => state.isDark)
  const reactId = useId().replace(/[^a-zA-Z0-9]/g, "")
  const [svg, setSvg] = useState("")
  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)
  const [visible, setVisible] = useState(false)
  const wrapperRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const node = wrapperRef.current
    if (!node) return
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true)
      return
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true)
          observer.disconnect()
        }
      },
      { rootMargin: "600px 0px" },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!visible) return
    if (!source.trim()) {
      setSvg("")
      setError("")
      return
    }
    const theme = isDark ? "dark" : "default"
    const instanceId = `mmd-${reactId}`
    const cached = peekMermaidCache(source, theme, "preview", instanceId)
    if (cached) {
      setSvg(cached)
      setError("")
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError("")
    void renderMermaid(source, { theme, mode: "preview", instanceId })
      .then((next) => {
        if (!cancelled) setSvg(next)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : tr("Could not render diagram"))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [source, isDark, reactId, visible])

  if (!visible) {
    return (
      <div ref={wrapperRef} className="flex min-h-[140px] items-center justify-center rounded-lg border bg-muted/10 text-[11px] text-muted-foreground">
        {tr("Diagram")}
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-start gap-2 rounded-lg border border-destructive/25 bg-destructive/5 px-3 py-2 text-[11px] text-destructive">
        <AlertTriangle className="mt-0.5 size-3.5 shrink-0" />
        <span className="whitespace-pre-wrap">{error}</span>
      </div>
    )
  }
  if (loading && !svg) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Rendering diagram…
      </div>
    )
  }
  return (
    <div ref={wrapperRef}>
      <div
        className="mermaid-frame overflow-x-auto rounded-lg bg-muted/15 p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  )
}

/* ---------------- 放大预览 ---------------- */

function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = name
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(url), 2000)
}

function base64Blob(value: string, type: string): Blob {
  const binary = atob(value)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index)
  return new Blob([bytes], { type })
}

export function DiagramLightbox({ source, title, open, onOpenChange }: {
  source: string
  title?: string
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const isDark = useThemeStore((state) => state.isDark)
  const [zoom, setZoom] = useState(100)
  const [fullscreen, setFullscreen] = useState(false)
  const [busy, setBusy] = useState(false)
  const [hand, setHand] = useState(false)
  const [panning, setPanning] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)
  const panRef = useRef<{ x: number; y: number; left: number; top: number } | null>(null)

  useEffect(() => {
    if (open) setZoom(100)
  }, [open ])

  function startPan(event: React.PointerEvent<HTMLDivElement>) {
    if (!hand || event.button !== 0) return
    const element = event.currentTarget
    panRef.current = { x: event.clientX, y: event.clientY, left: element.scrollLeft, top: element.scrollTop }
    element.setPointerCapture(event.pointerId)
    setPanning(true)
    event.preventDefault()
  }

  function movePan(event: React.PointerEvent<HTMLDivElement>) {
    const start = panRef.current
    if (!start) return
    const element = event.currentTarget
    element.scrollLeft = start.left - (event.clientX - start.x)
    element.scrollTop = start.top - (event.clientY - start.y)
  }

  function endPan(event: React.PointerEvent<HTMLDivElement>) {
    if (!panRef.current) return
    panRef.current = null
    setPanning(false)
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  async function onDownload(kind: "svg" | "png") {
    if (!source.trim()) {
      toast.error(tr("Diagram is still rendering"))
      return
    }
    const name = (title?.trim() || "diagram").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 60) || "diagram"
    setBusy(true)
    try {
      const image = await renderDiagramImage(source, isDark ? "dark" : "default", isDark ? "#0b0b0f" : "#ffffff")
      if (kind === "svg") {
        saveBlob(new Blob([image.svg], { type: "image/svg+xml;charset=utf-8" }), name + ".svg")
      } else {
        saveBlob(base64Blob(image.png, "image/png"), name + ".png")
      }
      toast.success(tr("Export ready"))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Could not export page"))
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={fullscreen
        ? "flex h-[100dvh] w-screen max-w-none flex-col rounded-none border-0 p-0"
        : "flex max-h-[92svh] w-[calc(100vw-2rem)] max-w-6xl flex-col p-0"}>
        <DialogHeader className="flex shrink-0 flex-row items-center gap-2 border-b px-4 py-2.5">
          <DialogTitle className="truncate text-sm">{title?.trim() || tr("Diagram preview")}</DialogTitle>
          <div className="ml-auto flex items-center gap-1">
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setZoom((z) => Math.max(50, z - 25))} title={`${tr("Zoom out")}`}>
              <ZoomOut className="size-3.5" />
            </Button>
            <button type="button" onClick={() => setZoom(100)} className="min-w-12 rounded px-1 py-0.5 text-[11px] tabular-nums text-muted-foreground hover:bg-accent" title={tr("Reset zoom")}>
              {zoom}%
            </button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setZoom((z) => Math.min(300, z + 25))} title={`${tr("Zoom in")}`}>
              <ZoomIn className="size-3.5" />
            </Button>
            <input
              type="range"
              min={50}
              max={300}
              step={25}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="hidden h-1 w-24 accent-[var(--brand)] sm:block"
              aria-label={tr("Zoom")}
            />
            <Button
              variant={hand ? "secondary" : "ghost"}
              size="sm"
              className="h-7 w-7 p-0"
              aria-pressed={hand}
              onClick={() => setHand((value) => !value)}
              title={tr("Hand tool")}
            >
              <Hand className="size-3.5" />
            </Button>
            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setFullscreen((v) => !v)} title={fullscreen ? tr("Exit fullscreen") : tr("Fullscreen")}>
              {fullscreen ? <Minimize className="size-3.5" /> : <Maximize className="size-3.5" />}
            </Button>
            <span className="mx-1 h-4 w-px bg-border" />
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-[11px]" disabled={busy} onClick={() => void onDownload("svg")}>
              <Download className="size-3.5" /> SVG
            </Button>
            <Button variant="ghost" size="sm" className="h-7 gap-1 text-[11px]" disabled={busy} onClick={() => void onDownload("png")}>
              <Download className="size-3.5" /> PNG
            </Button>
          </div>
        </DialogHeader>
        <div
          ref={scrollRef}
          onPointerDown={startPan}
          onPointerMove={movePan}
          onPointerUp={endPan}
          onPointerCancel={endPan}
          className={cn(
            "min-h-0 flex-1 overflow-auto bg-muted/20 p-4 thin-scrollbar",
            hand && (panning ? "cursor-grabbing touch-none select-none" : "cursor-grab touch-none select-none"),
          )}
        >
          <div style={{ width: zoom === 100 ? undefined : `${zoom}%`, minWidth: zoom > 100 ? `${zoom}%` : undefined }} className={cn("mx-auto [&_.mermaid-frame]:border-0 [&_.mermaid-frame]:bg-transparent [&_.mermaid-frame]:p-2 [&_svg]:h-auto [&_svg]:w-full", hand && "[&_*]:pointer-events-none")}>
            <MermaidDiagram source={source} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
