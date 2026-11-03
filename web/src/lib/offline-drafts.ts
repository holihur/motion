import { api } from "@/lib/api"
import type { Block, Page } from "@/lib/types"

const DRAFT_PREFIX = "motion:draft:"
const PAGE_CACHE_PREFIX = "motion:page-cache:"
const MAX_DRAFTS = 20
const MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

export interface PageDraft {
  version: 1
  userId: string
  page: Omit<Page, "blocks">
  blocks: Block[]
  baseBlocks: Block[]
  savedAt: number
}

interface CachedPage {
  version: 1
  userId: string
  page: Omit<Page, "blocks">
  blocks: Block[]
  savedAt: number
}

function storageAvailable() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined"
}

function draftKey(pageId: string) {
  return `${DRAFT_PREFIX}${pageId}`
}

function pageCacheKey(pageId: string) {
  return `${PAGE_CACHE_PREFIX}${pageId}`
}

function parseDraft(raw: string | null): PageDraft | null {
  if (!raw) return null
  try {
    const draft = JSON.parse(raw) as PageDraft
    if (draft?.version !== 1 || !draft.page?.id || !Array.isArray(draft.blocks)) return null
    return draft
  } catch {
    return null
  }
}

export function readDraft(pageId: string): PageDraft | null {
  if (!storageAvailable()) return null
  try {
    const draft = parseDraft(localStorage.getItem(draftKey(pageId)))
    if (!draft) return null
    if (Date.now() - (draft.savedAt ?? 0) > MAX_AGE_MS) {
      clearDraft(pageId)
      return null
    }
    return draft
  } catch {
    return null
  }
}

export function writeDraft(draft: PageDraft): boolean {
  if (!storageAvailable()) return false
  try {
    localStorage.setItem(draftKey(draft.page.id), JSON.stringify(draft))
    pruneDrafts()
    return true
  } catch {
    return false
  }
}

export function clearDraft(pageId: string, savedAt?: number) {
  if (!storageAvailable()) return
  try {
    if (savedAt !== undefined) {
      const current = readDraft(pageId)
      if (current && current.savedAt > savedAt) return
    }
    localStorage.removeItem(draftKey(pageId))
  } catch { /* ignore */ }
}

export function listDrafts(userId: string): PageDraft[] {
  if (!storageAvailable()) return []
  const drafts: PageDraft[] = []
  try {
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (!key?.startsWith(DRAFT_PREFIX)) continue
      const draft = parseDraft(localStorage.getItem(key))
      if (!draft || draft.userId !== userId) continue
      if (Date.now() - (draft.savedAt ?? 0) > MAX_AGE_MS) {
        clearDraft(draft.page.id)
        continue
      }
      drafts.push(draft)
    }
  } catch {
    return []
  }
  return drafts
}

function pruneDrafts() {
  if (!storageAvailable()) return
  try {
    const entries: { key: string; savedAt: number }[] = []
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (!key?.startsWith(DRAFT_PREFIX)) continue
      const draft = parseDraft(localStorage.getItem(key))
      if (!draft) {
        localStorage.removeItem(key)
        continue
      }
      entries.push({ key, savedAt: draft.savedAt ?? 0 })
    }
    entries.sort((a, b) => b.savedAt - a.savedAt)
    for (const entry of entries.slice(MAX_DRAFTS)) localStorage.removeItem(entry.key)
  } catch { /* ignore */ }
}

export function pageFromDraft(draft: PageDraft): Page {
  return { ...draft.page, blocks: draft.blocks }
}

export function readCachedPage(pageId: string, userId: string): Page | null {
  if (!storageAvailable() || !userId) return null
  try {
    const raw = localStorage.getItem(pageCacheKey(pageId))
    if (!raw) return null
    const cached = JSON.parse(raw) as CachedPage
    if (cached?.version !== 1 || cached.userId !== userId || cached.page?.id !== pageId || !Array.isArray(cached.blocks)) return null
    if (Date.now() - (cached.savedAt ?? 0) > MAX_AGE_MS) {
      localStorage.removeItem(pageCacheKey(pageId))
      return null
    }
    return { ...cached.page, blocks: cached.blocks }
  } catch {
    return null
  }
}

export function writeCachedPage(userId: string, page: Page, blocks: Block[]) {
  if (!storageAvailable() || !userId) return
  try {
    const cached: CachedPage = {
      version: 1,
      userId,
      page: pageMeta(page),
      blocks,
      savedAt: Date.now(),
    }
    localStorage.setItem(pageCacheKey(page.id), JSON.stringify(cached))
    prunePageCache()
  } catch { /* ignore */ }
}

function prunePageCache() {
  if (!storageAvailable()) return
  try {
    const entries: { key: string; savedAt: number }[] = []
    for (let index = 0; index < localStorage.length; index++) {
      const key = localStorage.key(index)
      if (!key?.startsWith(PAGE_CACHE_PREFIX)) continue
      try {
        const cached = JSON.parse(localStorage.getItem(key) ?? "") as CachedPage
        entries.push({ key, savedAt: cached.savedAt ?? 0 })
      } catch {
        localStorage.removeItem(key)
      }
    }
    entries.sort((a, b) => b.savedAt - a.savedAt)
    for (const entry of entries.slice(MAX_DRAFTS)) localStorage.removeItem(entry.key)
  } catch { /* ignore */ }
}

export function pageMeta(page: Page): Omit<Page, "blocks"> {
  const meta = { ...page }
  delete (meta as Partial<Page>).blocks
  return meta
}

let flushing = false

export async function flushOfflineDrafts(userId: string): Promise<{ synced: number; failed: number }> {
  if (!userId || flushing || typeof navigator === "undefined" || !navigator.onLine) {
    return { synced: 0, failed: 0 }
  }
  flushing = true
  let synced = 0
  let failed = 0
  try {
    const currentPageId = typeof window !== "undefined"
      ? /^\/page\/([^/?#]+)/.exec(window.location.pathname)?.[1]
      : undefined
    for (const draft of listDrafts(userId)) {
      if (draft.page.id === currentPageId) continue
      try {
        await api.pages.update(draft.page.id, {
          title: draft.page.title,
          icon: draft.page.icon,
          cover: draft.page.cover,
        })
        await api.pages.saveBlocks(draft.page.id, draft.blocks, draft.baseBlocks)
        clearDraft(draft.page.id, draft.savedAt)
        synced += 1
      } catch {
        failed += 1
      }
    }
  } finally {
    flushing = false
  }
  return { synced, failed }
}
