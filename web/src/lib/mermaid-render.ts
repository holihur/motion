type MermaidApi = {
  initialize: (config: Record<string, unknown>) => void
  render: (id: string, source: string) => Promise<{ svg: string }>
}

declare global {
  interface Window {
    mermaid?: MermaidApi
  }
}

export type MermaidMode = "preview" | "export"

type CachedRender = { svg: string; id: string }

const MAX_ENTRIES = 80
const cache = new Map<string, CachedRender>()
const inFlight = new Map<string, Promise<CachedRender>>()

let mermaidPromise: Promise<MermaidApi> | null = null
// mermaid.initialize() mutates global config, so renders with different themes
// or label modes must not overlap.
let renderQueue: Promise<unknown> = Promise.resolve()

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

function cacheKey(source: string, theme: "default" | "dark", mode: MermaidMode) {
  return `${mode}\u0000${theme}\u0000${source}`
}

function trimCache() {
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value
    if (!oldest) break
    cache.delete(oldest)
  }
}

function withInstanceId(render: CachedRender, instanceId: string) {
  if (!instanceId || instanceId === render.id) return render.svg
  return render.svg.split(render.id).join(instanceId)
}

export function peekMermaidCache(source: string, theme: "default" | "dark", mode: MermaidMode, instanceId: string): string | null {
  const hit = cache.get(cacheKey(source, theme, mode))
  if (!hit) return null
  // Refresh LRU order.
  cache.delete(cacheKey(source, theme, mode))
  cache.set(cacheKey(source, theme, mode), hit)
  return withInstanceId(hit, instanceId)
}

async function renderWithMermaid(source: string, theme: "default" | "dark", mode: MermaidMode, instanceId: string): Promise<CachedRender> {
  const mermaid = await loadMermaid()
  // Give every render a stable DOM id; cached SVGs are re-keyed per instance
  // when they are injected into the page.
  const renderId = mode === "preview" ? instanceId : `export-${Math.random().toString(36).slice(2)}`
  return new Promise<CachedRender>((resolve, reject) => {
    renderQueue = renderQueue.then(async () => {
      try {
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: theme === "dark" ? "dark" : "default",
          fontFamily: "ui-sans-serif, system-ui, sans-serif",
          // HTML labels are prettier in the editor, but foreignObject taints
          // the canvas used to rasterize diagrams for DOCX/PDF export.
          htmlLabels: mode === "preview",
          flowchart: { htmlLabels: mode === "preview" },
          class: { htmlLabels: mode === "preview" },
          themeVariables: {
            primaryColor: theme === "dark" ? "#3b3550" : "#ede9fe",
            primaryTextColor: theme === "dark" ? "#f5f3ff" : "#1e1b4b",
            primaryBorderColor: theme === "dark" ? "#7c5cff" : "#8b5cf6",
            lineColor: theme === "dark" ? "#a1a1a1" : "#52525b",
          },
        })
        const result = await mermaid.render(renderId, source)
        resolve({ svg: result.svg, id: renderId })
      } catch (error) {
        reject(error)
      }
    })
  })
}

export async function renderMermaid(source: string, options: {
  theme: "default" | "dark"
  mode: MermaidMode
  instanceId: string
}): Promise<string> {
  const { theme, mode, instanceId } = options
  const key = cacheKey(source, theme, mode)
  const cached = cache.get(key)
  if (cached) {
    cache.delete(key)
    cache.set(key, cached)
    return withInstanceId(cached, instanceId)
  }

  let request = inFlight.get(key)
  if (!request) {
    request = renderWithMermaid(source, theme, mode, instanceId)
    inFlight.set(key, request)
    request.then((rendered) => {
      cache.set(key, rendered)
      trimCache()
    }).finally(() => {
      inFlight.delete(key)
    })
  }
  const rendered = await request
  return withInstanceId(rendered, instanceId)
}
