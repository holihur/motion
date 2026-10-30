import { useEffect, useId, useRef, useState } from "react"
import { AlertTriangle, Download, Loader2, Maximize, Minimize, ZoomIn, ZoomOut } from "lucide-react"
import { toast } from "sonner"
import { useThemeStore } from "@/stores/theme"
import { tr } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"

type MermaidApi = {
  initialize: (config: Record<string, unknown>) => void
  render: (id: string, source: string) => Promise<{ svg: string }>
}

declare global {
  interface Window {
    mermaid?: MermaidApi
  }
}

let mermaidPromise: Promise<MermaidApi> | null = null

function loadMermaid(): Promise<MermaidApi> {
  if (typeof window === "undefined") return Promise.reject(new Error("Mermaid requires a browser"))
  if (window.mermaid) return Promise.resolve(window.mermaid)
  if (mermaidPromise) return mermaidPromise
  mermaidPromise = new Promise<MermaidApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-motion-mermaid]")
    if (existing) {
      existing.addEventListener("load", () => resolve(window.mermaid!))
      existing.addEventListener("error", () => reject(new Error("Could not load Mermaid")))
      return
    }
    const script = document.createElement("script")
    script.src = "/vendor/mermaid.min.js"
    script.async = true
    script.dataset.motionMermaid = "true"
    script.onload = () => {
      if (window.mermaid) resolve(window.mermaid)
      else reject(new Error("Mermaid runtime did not initialize"))
    }
    script.onerror = () => {
      mermaidPromise = null
      script.remove()
      reject(new Error("Could not load the Mermaid runtime"))
    }
    document.head.appendChild(script)
  })
  return mermaidPromise
}

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
    let cancelled = false
    setLoading(true)
    setError("")
    void loadMermaid()
      .then((mermaid) => {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: isDark ? "dark" : "default",
          fontFamily: "var(--font-sans)",
          themeVariables: {
            primaryColor: isDark ? "#3b3550" : "#ede9fe",
            primaryTextColor: isDark ? "#f5f3ff" : "#1e1b4b",
            primaryBorderColor: isDark ? "#7c5cff" : "#8b5cf6",
            lineColor: isDark ? "#a1a1aa" : "#52525b",
          },
        })
        return mermaid.render(`mmd-${reactId}-${Date.now()}`, source)
      })
      .then((result) => {
        if (!cancelled) setSvg(result.svg)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not render diagram")
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
        Diagram
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
        className="mermaid-frame overflow-x-auto rounded-lg border bg-muted/15 p-4 [&_svg]:mx-auto [&_svg]:h-auto [&_svg]:max-w-full"
        dangerouslySetInnerHTML={{ __html: svg }}
      />
    </div>
  )
}

/* ---------------- 放大预览 ---------------- */

function downloadSVG(svgEl: SVGSVGElement, name: string) {
  const clone = svgEl.cloneNode(true) as SVGSVGElement
  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")
  const text = new XMLSerializer().serializeToString(clone)
  const blob = new Blob([text], { type: "image/svg+xml;charset=utf-8" })
  const href = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = href
  link.download = name + ".svg"
  document.body.appendChild(link)
  link.click()
  link.remove()
  window.setTimeout(() => URL.revokeObjectURL(href), 2000)
}

function downloadPNG(svgEl: SVGSVGElement, name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const clone = svgEl.cloneNode(true) as SVGSVGElement
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")
    const rect = svgEl.getBoundingClientRect()
    const w = Math.max(800, Math.round(rect.width * 2))
    const text = new XMLSerializer().serializeToString(clone)
    const href = URL.createObjectURL(new Blob([text], { type: "image/svg+xml;charset=utf-8" }))
    const img = new Image()
    img.onload = () => {
      try {
        const scale = w / Math.max(1, img.width || rect.width || 800)
        const canvas = document.createElement("canvas")
        canvas.width = Math.round((img.width || rect.width || 800) * scale)
        canvas.height = Math.round((img.height || rect.height || 600) * scale)
        const ctx = canvas.getContext("2d")
        if (!ctx) throw new Error("no canvas")
        ctx.fillStyle = getComputedStyle(document.body).backgroundColor || "#ffffff"
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        URL.revokeObjectURL(href)
        canvas.toBlob((blob) => {
          if (!blob) {
            reject(new Error("rasterize failed"))
            return
          }
          const url = URL.createObjectURL(blob)
          const link = document.createElement("a")
          link.href = url
          link.download = name + ".png"
          document.body.appendChild(link)
          link.click()
          link.remove()
          window.setTimeout(() => URL.revokeObjectURL(url), 2000)
          resolve()
        }, "image/png")
      } catch (err) {
        URL.revokeObjectURL(href)
        reject(err instanceof Error ? err : new Error("rasterize failed"))
      }
    }
    img.onerror = () => {
      URL.revokeObjectURL(href)
      reject(new Error("could not load diagram image"))
    }
    img.src = href
  })
}

export function DiagramLightbox({ source, title, open, onOpenChange }: {
  source: string
  title?: string
  open: boolean
  onOpenChange: (v: boolean) => void
}) {
  const [zoom, setZoom] = useState(100)
  const [fullscreen, setFullscreen] = useState(false)
  const [busy, setBusy] = useState(false)
  const frameRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (open) setZoom(100)
  }, [open ])

  function currentSVG(): SVGSVGElement | null {
    return frameRef.current?.querySelector("svg") ?? null
  }

  async function onDownload(kind: "svg" | "png") {
    const el = currentSVG()
    if (!el) {
      toast.error(tr("Diagram is still rendering"))
      return
    }
    const name = (title?.trim() || "diagram").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 60) || "diagram"
    setBusy(true)
    try {
      if (kind === "svg") downloadSVG(el, name)
      else await downloadPNG(el, name)
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
        <div className="min-h-0 flex-1 overflow-auto bg-muted/20 p-4 thin-scrollbar">
          <div ref={frameRef} style={{ width: zoom === 100 ? undefined : `${zoom}%`, minWidth: zoom > 100 ? `${zoom}%` : undefined }} className="mx-auto [&_.mermaid-frame]:border-0 [&_.mermaid-frame]:bg-transparent [&_.mermaid-frame]:p-2 [&_svg]:h-auto [&_svg]:w-full">
            <MermaidDiagram source={source} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
