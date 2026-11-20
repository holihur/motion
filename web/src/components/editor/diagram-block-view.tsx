import { useRef, useState } from "react"
import { Copy, Maximize2, Network } from "lucide-react"
import { toast } from "sonner"
import type { Block } from "@/lib/types"
import { cn } from "@/lib/utils"
import { tr } from "@/lib/i18n"
import { DiagramLightbox, MermaidDiagram } from "@/components/editor/mermaid-diagram"
import { MermaidSourceEditor } from "@/components/editor/mermaid-source-editor"


export function DiagramBlockView({
  block,
  readOnly,
  onUpdate,
  onFocusBlock,
}: {
  block: Block
  readOnly: boolean
  onUpdate: (patch: Partial<Block>) => void
  onFocusBlock?: (blockId: string) => void
}) {
  const [diagramMode, setDiagramMode] = useState<"preview" | "split" | "source">(block.text ? "split" : "source")
  const [diagramSplit, setDiagramSplit] = useState(() => {
    try {
      const value = Number(localStorage.getItem("motion.mermaid.split"))
      return Number.isFinite(value) && value >= 20 && value <= 80 ? value : 50
    } catch {
      return 50
    }
  })
  const diagramSplitRef = useRef<{ rect: DOMRect } | null>(null)
  const [diagramZoom, setDiagramZoom] = useState(false)

  function renderDiagram() {
        const zoom = Number(block.align ?? "100") || 100
        const mode = readOnly ? "preview" : diagramMode
        const sourceEditor = (
          <MermaidSourceEditor
            value={block.text}
            readOnly={readOnly}
            onChange={(value) => onUpdate({ text: value })}
            onFocus={() => onFocusBlock?.(block.id)}
            className={mode === "split" ? "h-[300px] md:h-full md:min-h-[300px]" : "h-[220px]"}
          />
        )
        const preview = (
          <div
            role="button"
            tabIndex={0}
            onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setDiagramZoom(true) } }}
            className="group/diagram relative w-full min-w-0 cursor-zoom-in overflow-auto rounded-lg p-2 outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
            onClick={() => setDiagramZoom(true)}
            title={tr("Click to zoom")}
          >
            <MermaidDiagram source={block.text} />
            <span className="pointer-events-none absolute right-2 top-2 hidden items-center gap-1 rounded-md border bg-background/85 px-2 py-1 text-[10px] text-muted-foreground shadow-sm backdrop-blur group-hover/diagram:flex">
              <Maximize2 className="size-3" /> {tr("Click to zoom")}
            </span>
          </div>
        )
        function startSplitResize(event: React.PointerEvent<HTMLDivElement>) {
          if (event.button !== 0) return
          const row = event.currentTarget.parentElement
          if (!row) return
          event.preventDefault()
          diagramSplitRef.current = { rect: row.getBoundingClientRect() }
          event.currentTarget.setPointerCapture(event.pointerId)
        }
        function moveSplitResize(event: React.PointerEvent<HTMLDivElement>) {
          const current = diagramSplitRef.current
          if (!current) return
          const percent = Math.max(20, Math.min(80, ((event.clientX - current.rect.left) / current.rect.width) * 100))
          setDiagramSplit(percent)
          try { localStorage.setItem("motion.mermaid.split", String(Math.round(percent))) } catch { /* ignore */ }
        }
        function endSplitResize(event: React.PointerEvent<HTMLDivElement>) {
          diagramSplitRef.current = null
          if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId)
        }
        return (
          <div className="my-2 overflow-hidden rounded-xl bg-card shadow-[var(--shadow-card)]">
            <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 px-2.5 py-1.5">
              <Network className="size-3 text-muted-foreground" />
              <span className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                {tr("Mermaid diagram")}
              </span>
              {!readOnly && (
                <div className="ml-2 flex rounded-md border bg-background p-0.5">
                  {(["preview", "split", "source"] as const).map((value) => (
                    <button
                      key={value}
                      type="button"
                      aria-pressed={diagramMode === value}
                      onClick={() => setDiagramMode(value)}
                      className={cn("rounded px-1.5 py-0.5 text-[10px] text-muted-foreground transition hover:text-foreground", diagramMode === value && "bg-accent font-medium text-foreground")}
                    >
                      {tr(value === "preview" ? "Preview" : value === "split" ? "Split" : "Source")}
                    </button>
                  ))}
                </div>
              )}
              <div className="ml-auto flex items-center gap-1">
                {mode !== "source" && (
                  <>
                    <button type="button" onClick={() => onUpdate({ align: String(Math.max(50, zoom - 10)) })} className="rounded px-1.5 py-0.5 text-[10px] hover:bg-accent">−</button>
                    <span className="text-[10px] text-muted-foreground">{zoom}%</span>
                    <button type="button" onClick={() => onUpdate({ align: String(Math.min(200, zoom + 10)) })} className="rounded px-1.5 py-0.5 text-[10px] hover:bg-accent">+</button>
                    <button
                      type="button"
                      onClick={() => { void navigator.clipboard.writeText(block.text).then(() => toast.success(tr("Copied")), () => toast.error(tr("Could not copy"))) }}
                      title={tr("Copy source")}
                      className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                    >
                      <Copy className="size-3" />
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiagramZoom(true)}
                      title={tr("Zoom preview")}
                      className="rounded p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                    >
                      <Maximize2 className="size-3" />
                    </button>
                  </>
                )}
              </div>
              <DiagramLightbox source={block.text} title={tr("Diagram preview")} open={diagramZoom} onOpenChange={setDiagramZoom} />
            </div>
            {mode === "split" ? (
              <div
                className="grid grid-cols-1 md:items-stretch md:[grid-template-columns:var(--mermaid-split)_6px_1fr]"
                style={{ "--mermaid-split": `${diagramSplit}%` } as React.CSSProperties}
              >
                <div className="flex min-w-0">{sourceEditor}</div>
                <div
                  role="separator"
                  aria-orientation="vertical"
                  aria-label={tr("Resize split")}
                  onPointerDown={startSplitResize}
                  onPointerMove={moveSplitResize}
                  onPointerUp={endSplitResize}
                  onPointerCancel={endSplitResize}
                  className="group/split hidden cursor-col-resize touch-none items-center justify-center bg-border/50 transition hover:bg-brand/40 md:flex"
                >
                  <span className="h-8 w-0.5 rounded-full bg-muted-foreground/30 transition group-hover/split:bg-brand" />
                </div>
                <div className="flex min-w-0">{preview}</div>
              </div>
            ) : mode === "source" ? sourceEditor : preview}
          </div>
        )
  }

  return renderDiagram()
}
