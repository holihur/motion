import type { CSSProperties } from "react"

export interface CoverOption {
  id: string
  name: string
  css: string
}

export const COVERS: CoverOption[] = [
  { id: "sunrise", name: "Sunrise", css: "linear-gradient(120deg, #ffd6a5 0%, #ff9e9e 46%, #f7a8d8 100%)" },
  { id: "ocean", name: "Ocean", css: "linear-gradient(120deg, #a8e6ff 0%, #7fb7ff 46%, #9d8cff 100%)" },
  { id: "forest", name: "Forest", css: "linear-gradient(120deg, #c7f0c2 0%, #8fd6b4 48%, #5fb3a1 100%)" },
  { id: "lavender", name: "Lavender", css: "linear-gradient(120deg, #e6dcff 0%, #c4b5fd 48%, #a78bfa 100%)" },
  { id: "sand", name: "Sand", css: "linear-gradient(120deg, #f7efe2 0%, #ead9bd 48%, #d9bd97 100%)" },
  { id: "rose", name: "Rose", css: "linear-gradient(120deg, #ffe0ea 0%, #ffb3c8 48%, #ff8fab 100%)" },
  { id: "mint", name: "Mint", css: "linear-gradient(120deg, #d7fff1 0%, #9cf0da 48%, #65d6c0 100%)" },
  { id: "twilight", name: "Twilight", css: "linear-gradient(120deg, #d9d4ff 0%, #9d9bff 45%, #5b6ee1 100%)" },
  { id: "citrus", name: "Citrus", css: "linear-gradient(120deg, #fff3b0 0%, #ffd166 46%, #ff9f68 100%)" },
  { id: "graphite", name: "Graphite", css: "linear-gradient(120deg, #e7e7ea 0%, #bcbcc4 48%, #8f8f99 100%)" },
  { id: "peach", name: "Peach", css: "linear-gradient(120deg, #ffe8d6 0%, #ffc3a0 46%, #ffafcc 100%)" },
  { id: "aurora", name: "Aurora", css: "linear-gradient(120deg, #c2f0ff 0%, #a6ffcb 34%, #c4b5fd 68%, #ffb3c8 100%)" },
]

export function coverStyle(value: string): CSSProperties | undefined {
  if (!value) return undefined
  if (value.startsWith("gradient:")) {
    const cover = COVERS.find((item) => item.id === value.slice("gradient:".length))
    if (cover) return { backgroundImage: cover.css }
    return { backgroundImage: COVERS[0].css }
  }
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return {
      backgroundImage: `url(${value})`,
      backgroundSize: "cover",
      backgroundPosition: "center",
    }
  }
  return undefined
}

export const CALLOUT_COLORS: Record<string, string> = {
  amber: "bg-amber-100/70 text-amber-950 dark:bg-amber-400/10 dark:text-amber-100",
  blue: "bg-sky-100/70 text-sky-950 dark:bg-sky-400/10 dark:text-sky-100",
  green: "bg-emerald-100/70 text-emerald-950 dark:bg-emerald-400/10 dark:text-emerald-100",
  rose: "bg-rose-100/70 text-rose-950 dark:bg-rose-400/10 dark:text-rose-100",
  violet: "bg-violet-100/70 text-violet-950 dark:bg-violet-400/10 dark:text-violet-100",
  neutral: "bg-muted text-foreground",
}

export const CALLOUT_EMOJI: Record<string, string> = {
  amber: "💡",
  blue: "📘",
  green: "🌱",
  rose: "🌸",
  violet: "🔮",
  neutral: "💬",
}
