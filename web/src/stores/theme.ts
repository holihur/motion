import { create } from "zustand"

export type Theme = "light" | "dark" | "system"

const THEME_KEY = "motion.theme"

function systemDark() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches
}

function apply(theme: Theme) {
  const dark = theme === "dark" || (theme === "system" && systemDark())
  document.documentElement.classList.toggle("dark", dark)
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute("content", dark ? "#161618" : "#fafafa")
  return dark
}

interface ThemeState {
  theme: Theme
  isDark: boolean
  setTheme: (theme: Theme) => void
  toggle: () => void
}

const initial = (localStorage.getItem(THEME_KEY) as Theme | null) ?? "system"

export const useThemeStore = create<ThemeState>((set, get) => ({
  theme: initial,
  isDark: apply(initial),
  setTheme: (theme) => {
    localStorage.setItem(THEME_KEY, theme)
    set({ theme, isDark: apply(theme) })
  },
  toggle: () => {
    const isDark = get().isDark
    get().setTheme(isDark ? "light" : "dark")
  },
}))

if (typeof window !== "undefined") {
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
    if (getTheme() === "system") {
      useThemeStore.setState({ isDark: apply("system") })
    }
  })
}

function getTheme() {
  return useThemeStore.getState().theme
}
