import { create } from "zustand"
import { api } from "@/lib/api"
import type { Page, PageSummary, Workspace } from "@/lib/types"

const ACTIVE_KEY = "motion.workspace"

interface WorkspaceState {
  workspaces: Workspace[]
  activeId: string | null
  pages: PageSummary[]
  trash: PageSummary[]
  loading: boolean
  pagesLoading: boolean
  ready: boolean
  error: string | null
  boot: () => Promise<void>
  reset: () => void
  refreshWorkspaces: () => Promise<void>
  refreshPages: (workspaceId?: string) => Promise<void>
  fetchTrash: () => Promise<void>
  setActive: (id: string) => Promise<void>
  createWorkspace: (name: string, icon?: string) => Promise<Workspace>
  updateWorkspace: (id: string, patch: { name?: string; icon?: string }) => Promise<void>
  deleteWorkspace: (id: string) => Promise<void>
  createPage: (parentId?: string | null) => Promise<Page>
  toggleFavorite: (id: string) => Promise<boolean>
  patchSummary: (id: string, patch: Partial<PageSummary>) => void
  archivePage: (id: string) => Promise<void>
  restorePage: (id: string) => Promise<void>
  deletePageForever: (id: string) => Promise<void>
  duplicatePage: (id: string) => Promise<Page>
}

let bootPromise: Promise<void> | null = null

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: [],
  activeId: null,
  pages: [],
  trash: [],
  loading: false,
  pagesLoading: false,
  ready: false,
  error: null,

  boot: () => {
    if (bootPromise) return bootPromise
    bootPromise = (async () => {
      set({ loading: true, error: null })
      try {
        const workspaces = await api.workspaces.list()
        const stored = localStorage.getItem(ACTIVE_KEY)
        const active =
          workspaces.find((w) => w.id === stored) ??
          workspaces[0] ??
          null
        set({ workspaces, activeId: active?.id ?? null })
        if (active) {
          localStorage.setItem(ACTIVE_KEY, active.id)
          const pages = await api.pages.list(active.id)
          set({ pages })
        }
        set({ ready: true })
      } catch (error) {
        set({ error: error instanceof Error ? error.message : "加载失败", ready: true })
      } finally {
        set({ loading: false })
      }
    })()
    return bootPromise
  },

  reset: () => {
    bootPromise = null
    set({
      workspaces: [],
      activeId: null,
      pages: [],
      trash: [],
      loading: false,
      pagesLoading: false,
      ready: false,
      error: null,
    })
  },

  refreshWorkspaces: async () => {
    const workspaces = await api.workspaces.list()
    set({ workspaces })
    const activeId = get().activeId
    if (!activeId && workspaces[0]) {
      await get().setActive(workspaces[0].id)
    }
  },

  refreshPages: async (workspaceId) => {
    const id = workspaceId ?? get().activeId
    if (!id) return
    set({ pagesLoading: true })
    try {
      const pages = await api.pages.list(id)
      if (get().activeId === id) set({ pages })
    } finally {
      set({ pagesLoading: false })
    }
  },

  fetchTrash: async () => {
    const id = get().activeId
    if (!id) return
    const trash = await api.pages.trash(id)
    set({ trash })
  },

  setActive: async (id) => {
    localStorage.setItem(ACTIVE_KEY, id)
    set({ activeId: id, pages: [], trash: [] })
    if (id) {
      set({ pagesLoading: true })
      try {
        const pages = await api.pages.list(id)
        if (get().activeId === id) set({ pages })
      } finally {
        set({ pagesLoading: false })
      }
    }
  },

  createWorkspace: async (name, icon) => {
    const workspace = await api.workspaces.create(name, icon)
    set({ workspaces: [...get().workspaces, workspace] })
    await get().setActive(workspace.id)
    return workspace
  },

  updateWorkspace: async (id, patch) => {
    const updated = await api.workspaces.update(id, patch)
    set({ workspaces: get().workspaces.map((w) => (w.id === id ? updated : w)) })
  },

  deleteWorkspace: async (id) => {
    await api.workspaces.remove(id)
    const workspaces = get().workspaces.filter((w) => w.id !== id)
    set({ workspaces })
    if (get().activeId === id) {
      if (workspaces[0]) await get().setActive(workspaces[0].id)
      else {
        localStorage.removeItem(ACTIVE_KEY)
        set({ activeId: null, pages: [], trash: [], ready: true })
      }
    }
  },

  createPage: async (parentId) => {
    let activeId = get().activeId
    if (!activeId) {
      const workspace = await get().createWorkspace("My Workspace", "🧭")
      activeId = workspace.id
    }
    const page = await api.pages.create({
      workspaceId: activeId,
      parentId: parentId ?? null,
      title: "",
    })
    await get().refreshPages(activeId)
    return page
  },

  toggleFavorite: async (id) => {
    const page = get().pages.find((p) => p.id === id)
    const favorite = !(page?.favorite ?? false)
    await api.pages.update(id, { favorite })
    set({
      pages: get().pages.map((p) => (p.id === id ? { ...p, favorite } : p)),
    })
    return favorite
  },

  patchSummary: (id, patch) => {
    set({ pages: get().pages.map((p) => (p.id === id ? { ...p, ...patch } : p)) })
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("motion:page-meta", { detail: { id, patch } }))
    }
  },

  archivePage: async (id) => {
    await api.pages.update(id, { archived: true })
    await get().refreshPages()
  },

  restorePage: async (id) => {
    await api.pages.update(id, { archived: false })
    await get().refreshPages()
    await get().fetchTrash()
  },

  deletePageForever: async (id) => {
    await api.pages.remove(id)
    set({ trash: get().trash.filter((p) => p.id !== id) })
  },

  duplicatePage: async (id) => {
    const copy = await api.pages.duplicate(id)
    await get().refreshPages()
    return copy
  },
}))
