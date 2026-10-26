import { create } from "zustand"

const COLLAPSE_KEY = "motion.sidebar.collapsed"

interface UIState {
  searchOpen: boolean
  settingsOpen: boolean
  sidebarOpen: boolean
  sidebarCollapsed: boolean
  setSearchOpen: (open: boolean) => void
  setSettingsOpen: (open: boolean) => void
  setSidebarOpen: (open: boolean) => void
  toggleSidebarCollapsed: () => void
}

export const useUIStore = create<UIState>((set, get) => ({
  searchOpen: false,
  settingsOpen: false,
  sidebarOpen: false,
  sidebarCollapsed: localStorage.getItem(COLLAPSE_KEY) === "1",
  setSearchOpen: (searchOpen) => set({ searchOpen }),
  setSettingsOpen: (settingsOpen) => set({ settingsOpen }),
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  toggleSidebarCollapsed: () => {
    const sidebarCollapsed = !get().sidebarCollapsed
    localStorage.setItem(COLLAPSE_KEY, sidebarCollapsed ? "1" : "0")
    set({ sidebarCollapsed })
  },
}))
