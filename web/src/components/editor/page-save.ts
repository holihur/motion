import { useCallback, useRef } from "react"
import { clearDraft, enqueue, replayQueue, saveDraft } from "@/lib/offline-queue"

export type SaveState = "saved" | "saving" | "error"

export function usePageSave(
  saveFn: () => Promise<void>,
  delay = 600,
  pageId?: string,
) {
  const timerRef = useRef<number | null>(null)
  const savingRef = useRef(false)
  const pendingRef = useRef(false)

  const schedule = useCallback(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(async () => {
      if (savingRef.current) {
        pendingRef.current = true
        return
      }
      savingRef.current = true
      try {
        await saveFn()
        if (pageId) clearDraft(pageId)
        // replay any queued ops when back online
        void replayQueue(() => localStorage.getItem("motion:token"))
      } catch (e) {
        if (pageId && !navigator.onLine) {
          saveDraft(pageId, { at: Date.now(), error: String(e) })
          enqueue({ id: `${pageId}-${Date.now()}`, pageId, url: location.href, method: "PUT", body: "", createdAt: Date.now() })
        }
        throw e
      } finally {
        savingRef.current = false
        if (pendingRef.current) {
          pendingRef.current = false
          schedule()
        }
      }
    }, delay)
  }, [saveFn, delay, pageId])

  const flush = useCallback(async () => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (savingRef.current) {
      pendingRef.current = true
      return
    }
    savingRef.current = true
    try {
      await saveFn()
      if (pageId) clearDraft(pageId)
    } catch (e) {
      if (pageId && !navigator.onLine) saveDraft(pageId, { at: Date.now(), error: String(e) })
      throw e
    } finally {
      savingRef.current = false
      if (pendingRef.current) {
        pendingRef.current = false
        schedule()
      }
    }
  }, [saveFn, schedule, pageId])

  const cancel = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  return { schedule, flush, cancel }
}
