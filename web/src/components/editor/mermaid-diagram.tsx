import { useEffect, useId, useRef, useState } from "react"
import { AlertTriangle, Loader2 } from "lucide-react"
import { useThemeStore } from "@/stores/theme"

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
