import type { Block } from "@/lib/types"

type MermaidApi = {
  initialize: (config: Record<string, unknown>) => void
  render: (id: string, source: string) => Promise<{ svg: string }>
}

declare global {
  interface Window {
    mermaid?: MermaidApi
  }
}

export type DiagramImage = {
  svg: string
  png: string
  width: number
  height: number
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

function svgSize(svg: string): { width: number; height: number } {
  const doc = new DOMParser().parseFromString(svg, "image/svg+xml")
  const root = doc.documentElement
  const viewBox = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number)
  if (viewBox.length === 4 && viewBox.every((value) => Number.isFinite(value)) && viewBox[2] > 0 && viewBox[3] > 0) {
    return { width: Math.round(viewBox[2]), height: Math.round(viewBox[3]) }
  }
  const width = Number.parseFloat(root.getAttribute("width") ?? "")
  const height = Number.parseFloat(root.getAttribute("height") ?? "")
  if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
    return { width: Math.round(width), height: Math.round(height) }
  }
  return { width: 800, height: 600 }
}

async function rasterize(svg: string, width: number, height: number): Promise<string> {
  const scale = 2
  const canvasWidth = Math.max(1, Math.min(4000, Math.round(width * scale)))
  const canvasHeight = Math.max(1, Math.min(4000, Math.round(height * scale)))
  const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error("Could not rasterize diagram"))
      img.src = url
    })
    const canvas = document.createElement("canvas")
    canvas.width = canvasWidth
    canvas.height = canvasHeight
    const context = canvas.getContext("2d")
    if (!context) throw new Error("Canvas is unavailable")
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, canvasWidth, canvasHeight)
    context.drawImage(image, 0, 0, canvasWidth, canvasHeight)
    const png = canvas.toDataURL("image/png")
    return png.slice(png.indexOf(",") + 1)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function renderDiagramImages(blocks: Block[]): Promise<Record<string, DiagramImage>> {
  const diagrams = blocks.filter((block) => block.type === "diagram" && block.text.trim() && block.text.length < 20000).slice(0, 40)
  if (diagrams.length === 0) return {}
  const mermaid = await loadMermaid()
  mermaid.initialize({
    startOnLoad: false,
    securityLevel: "strict",
    theme: "default",
    fontFamily: "ui-sans-serif, system-ui, sans-serif",
    // SVG text labels keep the rasterized PNG exportable: Chrome taints a
    // canvas drawn from an SVG that contains foreignObject HTML labels.
    htmlLabels: false,
    flowchart: { htmlLabels: false },
    class: { htmlLabels: false },
  })
  const out: Record<string, DiagramImage> = {}
  for (const block of diagrams) {
    try {
      const result = await mermaid.render(`export-${block.id}-${Date.now()}`, block.text)
      const svg = result.svg.replace(/<\?xml[^>]*>\s*/i, "").trim()
      if (!svg.startsWith("<svg")) continue
      const size = svgSize(svg)
      const png = await rasterize(svg, size.width, size.height)
      if (svg.length > 3_000_000 || png.length > 8_000_000) continue
      out[block.id] = { svg, png, ...size }
    } catch {
      // Leave the block as a code fallback in the export.
    }
  }
  return out
}
