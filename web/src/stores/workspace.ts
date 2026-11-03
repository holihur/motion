import { create } from "zustand"
import { api } from "@/lib/api"
import { markOnboardingStep } from "@/lib/onboarding"
import { tr } from "@/lib/i18n"
import type { Page, PageSummary, Workspace } from "@/lib/types"

const ACTIVE_KEY = "motion.workspace"
const CACHE_KEY = "motion.workspace.cache"

function readCache(): { workspaces: Workspace[]; activeId: string | null; pages: PageSummary[] } | null {
  if (typeof window === "undefined") return null
  try {
    const raw = localStorage.getItem(CACHE_KEY)
    if (!raw) return null
    const cached = JSON.parse(raw) as { workspaces?: Workspace[]; activeId?: string | null; pages?: PageSummary[] }
    if (!Array.isArray(cached.workspaces) || !Array.isArray(cached.pages)) return null
    return { workspaces: cached.workspaces, activeId: cached.activeId ?? null, pages: cached.pages }
  } catch {
    return null
  }
}

function writeCache(workspaces: Workspace[], activeId: string | null, pages: PageSummary[]) {
  if (typeof window === "undefined") return
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ workspaces, activeId, pages }))
  } catch { /* ignore */ }
}

const cachedState = readCache()

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
  updateWorkspace: (id: string, patch: { name?: string; icon?: string; variables?: Record<string, string> }) => Promise<void>
  deleteWorkspace: (id: string) => Promise<void>
  createPage: (parentId?: string | null, options?: { deferRefresh?: boolean }) => Promise<Page>
  toggleFavorite: (id: string) => Promise<boolean>
  patchSummary: (id: string, patch: Partial<PageSummary>) => void
  archivePage: (id: string) => Promise<void>
  restorePage: (id: string) => Promise<void>
  deletePageForever: (id: string) => Promise<void>
  duplicatePage: (id: string) => Promise<Page>
}

let bootPromise: Promise<void> | null = null

export const useWorkspaceStore = create<WorkspaceState>((set, get) => ({
  workspaces: cachedState?.workspaces ?? [],
  activeId: cachedState?.activeId ?? null,
  pages: cachedState?.pages ?? [],
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
        let pages: PageSummary[] = []
        if (active) {
          localStorage.setItem(ACTIVE_KEY, active.id)
          pages = await api.pages.list(active.id)
          set({ pages })
        }
        writeCache(workspaces, active?.id ?? null, pages)
        set({ ready: true })
      } catch (error) {
        const cached = readCache()
        if (cached) {
          set({ workspaces: cached.workspaces, activeId: cached.activeId, pages: cached.pages, ready: true, error: null })
        } else {
          set({ error: error instanceof Error ? error.message : tr("Could not load workspace"), ready: true })
        }
        bootPromise = null
      } finally {
        set({ loading: false })
      }
    })()
    return bootPromise
  },

  reset: () => {
    bootPromise = null
    try {
      localStorage.removeItem(CACHE_KEY)
    } catch { /* ignore */ }
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
    set({ workspaces, error: null })
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
      if (get().activeId === id) {
        set({ pages, error: null })
        writeCache(get().workspaces, id, pages)
      }
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
        if (get().activeId === id) {
          set({ pages })
          writeCache(get().workspaces, id, pages)
        }
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

  createPage: async (parentId, options) => {
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
    markOnboardingStep("page")
    if (!options?.deferRefresh) {
      // Show the page immediately and refresh the tree in the background; the
      // navigation must not wait for a second workspace request.
      set({ pages: [...get().pages, page] })
      void get().refreshPages(activeId).catch(() => {})
    }
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
