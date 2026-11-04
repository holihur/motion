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

function numeric(value: string | null): number {
  const parsed = Number.parseFloat(value ?? "")
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0
}

/**
 * Make a Mermaid SVG standalone. Preview SVGs contain percentage sizes and
 * sometimes `max-width`; image viewers and the PNG rasterizer need explicit
 * intrinsic dimensions. Export-mode diagrams already avoid foreignObject.
 */
export function normalizeSvg(raw: string): DiagramImage {
  const doc = new DOMParser().parseFromString(raw, "image/svg+xml")
  const root = doc.documentElement
  if (!root || root.nodeName.toLowerCase() !== "svg") {
    throw new Error("Mermaid returned an invalid SVG")
  }
  const viewBox = (root.getAttribute("viewBox") ?? "").trim().split(/[\s,]+/).map(Number)
  let width = 0
  let height = 0
  if (viewBox.length === 4 && viewBox.every((value) => Number.isFinite(value)) && viewBox[2] > 0 && viewBox[3] > 0) {
    width = Math.round(viewBox[2])
    height = Math.round(viewBox[3])
  } else {
    width = Math.round(numeric(root.getAttribute("width")))
    height = Math.round(numeric(root.getAttribute("height")))
    if (!width || !height) {
      width = 800
      height = 600
    }
    root.setAttribute("viewBox", `0 0 ${width} ${height}`)
  }
  width = Math.max(1, Math.min(4096, width))
  height = Math.max(1, Math.min(4096, height))
  root.setAttribute("width", String(width))
  root.setAttribute("height", String(height))
  root.setAttribute("xmlns", "http://www.w3.org/2000/svg")
  root.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink")
  const style = root.getAttribute("style")
  if (style) {
    const cleaned = style
      .split(";")
      .filter((part) => !/^\s*(?:max-width|width|height)\s*:/i.test(part))
      .join(";")
      .trim()
    if (cleaned) root.setAttribute("style", cleaned)
    else root.removeAttribute("style")
  }
  const svg = new XMLSerializer().serializeToString(root)
  return { svg, png: "", width, height }
}

async function rasterize(svg: string, width: number, height: number, background: string): Promise<string> {
  const scale = 2
  const canvasWidth = Math.max(1, Math.min(4096, Math.round(width * scale)))
  const canvasHeight = Math.max(1, Math.min(4096, Math.round(height * scale)))
  try { await document.fonts?.ready } catch { /* ignore */ }
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
    context.fillStyle = background
    context.fillRect(0, 0, canvasWidth, canvasHeight)
    context.drawImage(image, 0, 0, canvasWidth, canvasHeight)
    const png = canvas.toDataURL("image/png")
    return png.slice(png.indexOf(",") + 1)
  } finally {
    URL.revokeObjectURL(url)
  }
}

export async function renderDiagramImage(source: string, theme: "default" | "dark" = "default", background = "#ffffff"): Promise<DiagramImage> {
  const raw = await renderMermaid(source, {
    theme,
    mode: "export",
    instanceId: `export-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  })
  const normalized = normalizeSvg(raw)
  const png = await rasterize(normalized.svg, normalized.width, normalized.height, background)
  return { ...normalized, png }
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
      const image = await renderDiagramImage(block.text, "default")
      if (image.svg.length > 3_000_000 || image.png.length > 8_000_000) continue
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
