import type { CSSProperties } from "react"

export interface PageTheme {
  value: string
  label: string
  swatch: string
  brand: string
}

export const PAGE_THEMES: PageTheme[] = [
  { value: "default", label: "Default", swatch: "bg-violet-500", brand: "oklch(0.58 0.21 288)" },
  { value: "blue", label: "Blue", swatch: "bg-sky-500", brand: "oklch(0.58 0.18 240)" },
  { value: "teal", label: "Teal", swatch: "bg-teal-500", brand: "oklch(0.58 0.12 185)" },
  { value: "green", label: "Green", swatch: "bg-emerald-500", brand: "oklch(0.55 0.14 155)" },
  { value: "amber", label: "Amber", swatch: "bg-amber-500", brand: "oklch(0.63 0.16 75)" },
  { value: "rose", label: "Rose", swatch: "bg-rose-500", brand: "oklch(0.58 0.19 15)" },
  { value: "slate", label: "Slate", swatch: "bg-slate-500", brand: "oklch(0.48 0.03 255)" },
]

export function pageThemeStyle(value?: string): CSSProperties {
  const theme = PAGE_THEMES.find((item) => item.value === value) ?? PAGE_THEMES[0]
  return {
    "--brand": theme.brand,
    "--brand-soft": `color-mix(in oklch, ${theme.brand} 14%, transparent)`,
    "--brand-two": theme.brand,
  } as CSSProperties
}
