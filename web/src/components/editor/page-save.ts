import { useCallback, useRef } from "react"

export type SaveState = "saved" | "saving" | "error"

export function usePageSave(
  saveFn: () => Promise<void>,
  delay = 600,
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
      } finally {
        savingRef.current = false
        if (pendingRef.current) {
          pendingRef.current = false
          schedule()
        }
      }
    }, delay)
  }, [saveFn, delay])

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
    } finally {
      savingRef.current = false
      if (pendingRef.current) {
        pendingRef.current = false
        schedule()
      }
    }
  }, [saveFn, schedule])

  const cancel = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }, [])

  return { schedule, flush, cancel }
}
