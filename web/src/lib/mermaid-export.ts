import type { Block } from "@/lib/types"
import { renderMermaid } from "@/lib/mermaid-render"
import katex from "katex"
import "katex/dist/katex.min.css"
import { toPng } from "html-to-image"

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

async function fetchWithTimeout(url: string, timeoutMs: number, init: RequestInit = {}) {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...init, signal: controller.signal })
  } finally {
    window.clearTimeout(timer)
  }
}

async function renderImageURL(url: string): Promise<DiagramImage | null> {
  if (!url || url.startsWith("data:") && url.length > 20_000_000) return null
  const response = await fetchWithTimeout(url, 8000, { credentials: "include" })
  if (!response.ok) return null
  const blob = await response.blob()
  if (!blob.type.startsWith("image/")) return null
  const objectURL = URL.createObjectURL(blob)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = () => reject(new Error("Could not load image"))
      img.src = objectURL
    })
    const naturalWidth = image.naturalWidth || image.width
    const naturalHeight = image.naturalHeight || image.height
    if (!naturalWidth || !naturalHeight) return null
    const maxDimension = 1800
    const scale = Math.min(1, maxDimension / Math.max(naturalWidth, naturalHeight))
    const canvas = document.createElement("canvas")
    canvas.width = Math.max(1, Math.round(naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(naturalHeight * scale))
    const context = canvas.getContext("2d")
    if (!context) return null
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const dataURL = canvas.toDataURL("image/png")
    const png = dataURL.slice(dataURL.indexOf(",") + 1)
    if (png.length > 11_000_000) return null
    return { svg: "", png, width: canvas.width, height: canvas.height }
  } finally {
    URL.revokeObjectURL(objectURL)
  }
}

async function renderEquationImage(block: Block): Promise<DiagramImage | null> {
  const host = document.createElement("div")
  const size = block.language === "sm" ? 18 : block.language === "lg" ? 30 : 24
  host.style.cssText = `position:fixed;left:0;top:0;z-index:-1;opacity:1;pointer-events:none;padding:16px;background:#ffffff;color:#1c1c22;font-size:${size}px;line-height:1.3;display:inline-block`
  document.body.appendChild(host)
  try {
    katex.render(block.text || "E = mc^2", host, { displayMode: true, throwOnError: false, strict: false })
    try { await document.fonts?.ready } catch { /* ignore */ }
    await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)))
    const rect = host.getBoundingClientRect()
    const width = Math.ceil(rect.width)
    const height = Math.ceil(rect.height)
    if (width <= 0 || height <= 0 || width > 2400 || height > 1600) return null
    const dataURL = await toPng(host, { pixelRatio: 2, backgroundColor: "#ffffff", cacheBust: true })
    const png = dataURL.slice(dataURL.indexOf(",") + 1)
    if (!png || png.length > 10_000_000) return null
    return { svg: "", png, width: width * 2, height: height * 2 }
  } finally {
    host.remove()
  }
}

function tileURL(x: number, y: number, zoom: number) {
  return `https://tile.openstreetmap.org/${zoom}/${x}/${y}.png`
}

async function renderMapImage(block: Block): Promise<DiagramImage | null> {
  const map = block.map
  if (!map || !Number.isFinite(map.lat) || !Number.isFinite(map.lng)) return null
  const zoom = Math.max(1, Math.min(18, Math.round(map.zoom || 12)))
  const scale = 2 ** zoom
  const latRad = (map.lat * Math.PI) / 180
  const tileX = ((map.lng + 180) / 360) * scale
  const tileY = ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * scale
  const baseX = Math.floor(tileX) - 1
  const baseY = Math.floor(tileY) - 1
  const tiles = document.createElement("canvas")
  tiles.width = 768
  tiles.height = 768
  const tileContext = tiles.getContext("2d")
  if (!tileContext) return null
  const tileImages: HTMLImageElement[] = []
  const tileOffsets: { dx: number; dy: number }[] = []
  for (let dy = 0; dy < 3; dy++) {
    for (let dx = 0; dx < 3; dx++) {
      tileOffsets.push({ dx, dy })
    }
  }
  const loaded = await Promise.all(tileOffsets.map(async ({ dx, dy }) => {
    const response = await fetchWithTimeout(tileURL(baseX + dx, baseY + dy, zoom), 4000, { credentials: "omit" })
    if (!response.ok) throw new Error("Could not load map tile")
    const blob = await response.blob()
    const objectURL = URL.createObjectURL(blob)
    try {
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = () => reject(new Error("Could not load map tile"))
        img.src = objectURL
      })
    } finally {
      URL.revokeObjectURL(objectURL)
    }
  }))
  tileImages.push(...loaded)
  for (let index = 0; index < tileOffsets.length; index++) {
    const { dx, dy } = tileOffsets[index]
    tileContext.drawImage(tileImages[index], dx * 256, dy * 256, 256, 256)
  }
  const centerX = (tileX - baseX) * 256
  const centerY = (tileY - baseY) * 256
  const out = document.createElement("canvas")
  out.width = 512
  out.height = 512
  const context = out.getContext("2d")
  if (!context) return null
  context.drawImage(tiles, centerX - 256, centerY - 256, 512, 512, 0, 0, 512, 512)
  context.fillStyle = "#7c5cff"
  context.strokeStyle = "#ffffff"
  context.lineWidth = 3
  context.beginPath()
  context.arc(256, 256, 8, 0, Math.PI * 2)
  context.fill()
  context.stroke()
  context.fillStyle = "rgba(255,255,255,0.82)"
  context.fillRect(0, 486, 512, 26)
  context.fillStyle = "#333333"
  context.font = "12px sans-serif"
  context.fillText("© OpenStreetMap contributors", 8, 503)
  return { svg: "", png: out.toDataURL("image/png").slice(out.toDataURL("image/png").indexOf(",") + 1), width: 512, height: 512 }
}

function rememberImage(key: string, image: DiagramImage) {
  imageCache.set(key, image)
  while (imageCache.size > MAX_IMAGES) {
    const oldest = imageCache.keys().next().value
    if (!oldest) break
    imageCache.delete(oldest)
  }
}

/**
 * Renders diagram and image blocks in the browser for PDF/DOCX export.
 * Same-origin images and CORS-enabled sources are rasterized; anything that
 * cannot be read is left to the server-side text fallback.
 */
export async function renderExportImages(blocks: Block[]): Promise<Record<string, DiagramImage>> {
  const diagrams = blocks.filter((block) => block.type === "diagram" && block.text.trim() && block.text.length < 20000).slice(0, 40)
  const images = blocks.filter((block) => block.type === "image" && Boolean(block.url)).slice(0, 40)
  const equations = blocks.filter((block) => block.type === "equation" && block.text.trim()).slice(0, 40)
  const maps = blocks.filter((block) => block.type === "map" && block.map).slice(0, 40)
  const out: Record<string, DiagramImage> = {}
  for (const block of diagrams) {
    if (Object.keys(out).length >= 40) break
    const cached = imageCache.get(block.text)
    if (cached) {
      out[block.id] = cached
      continue
    }
    try {
      const image = await renderDiagramImage(block.text, "default")
      if (image.svg.length > 3_000_000 || image.png.length > 8_000_000) continue
      rememberImage(block.text, image)
      out[block.id] = image
    } catch {
      // Leave the block as a code fallback in the export.
    }
  }
  for (const block of images) {
    if (Object.keys(out).length >= 40) break
    const url = block.url ?? ""
    const cached = imageCache.get(`image:${url}`)
    if (cached) {
      out[block.id] = cached
      continue
    }
    try {
      const image = await renderImageURL(url)
      if (!image) continue
      rememberImage(`image:${url}`, image)
      out[block.id] = image
    } catch {
      // Cross-origin images without CORS fall back to the server placeholder.
    }
  }
  for (const block of equations) {
    if (Object.keys(out).length >= 40) break
    const key = `equation:${block.text}:${block.language ?? ""}`
    const cached = imageCache.get(key)
    if (cached) {
      out[block.id] = cached
      continue
    }
    try {
      const image = await renderEquationImage(block)
      if (!image) continue
      rememberImage(key, image)
      out[block.id] = image
    } catch {
      // The server falls back to the LaTeX source.
    }
  }
  for (const block of maps) {
    if (Object.keys(out).length >= 40) break
    const map = block.map!
    const key = `map:${map.lat}:${map.lng}:${map.zoom ?? 12}`
    const cached = imageCache.get(key)
    if (cached) {
      out[block.id] = cached
      continue
    }
    try {
      const image = await renderMapImage(block)
      if (!image) continue
      rememberImage(key, image)
      out[block.id] = image
    } catch {
      // Offline or blocked tile servers fall back to the location card.
    }
  }
  return out
}
