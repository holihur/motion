import type { Block } from "@/lib/types"
import { renderMermaid } from "@/lib/mermaid-render"

export type DiagramImage = {
  svg: string
  png: string
  width: number
  height: number
}

const imageCache = new Map<string, DiagramImage>()
const MAX_IMAGES = 30

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
  const out: Record<string, DiagramImage> = {}
  for (const block of diagrams) {
    const cached = imageCache.get(block.text)
    if (cached) {
      out[block.id] = cached
      continue
    }
    try {
      const raw = await renderMermaid(block.text, {
        theme: "default",
        mode: "export",
        instanceId: `export-${block.id}-${Date.now()}`,
      })
      const svg = raw.replace(/<\?xml[^>]*>\s*/i, "").trim()
      if (!svg.startsWith("<svg")) continue
      const size = svgSize(svg)
      const png = await rasterize(svg, size.width, size.height)
      if (svg.length > 3_000_000 || png.length > 8_000_000) continue
      const image = { svg, png, ...size }
      imageCache.set(block.text, image)
      while (imageCache.size > MAX_IMAGES) {
        const oldest = imageCache.keys().next().value
        if (!oldest) break
        imageCache.delete(oldest)
      }
      out[block.id] = image
    } catch {
      // Leave the block as a code fallback in the export.
    }
  }
  return out
}
