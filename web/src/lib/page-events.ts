/** Cross-tab notification that a page's blocks were saved. */
const CHANNEL_NAME = "motion-page-events"

type SavedDetail = { pageId: string }

const channel: BroadcastChannel | null =
  typeof window !== "undefined" && typeof BroadcastChannel !== "undefined"
    ? new BroadcastChannel(CHANNEL_NAME)
    : null

export function broadcastPageSaved(pageId: string) {
  if (typeof window === "undefined" || !pageId) return
  window.dispatchEvent(new CustomEvent<SavedDetail>("motion:page-saved", { detail: { pageId } }))
  try {
    channel?.postMessage({ type: "page-saved", pageId })
  } catch {
    /* channel may be closed during teardown */
  }
}

export function onPageSaved(handler: (pageId: string) => void) {
  if (typeof window === "undefined") return () => undefined
  const onCustom = (event: Event) => {
    const detail = (event as CustomEvent<SavedDetail>).detail
    if (detail?.pageId) handler(detail.pageId)
  }
  const onMessage = (event: MessageEvent) => {
    const data = event.data as { type?: string; pageId?: string } | null
    if (data?.type === "page-saved" && data.pageId) handler(data.pageId)
  }
  window.addEventListener("motion:page-saved", onCustom)
  channel?.addEventListener("message", onMessage)
  return () => {
    window.removeEventListener("motion:page-saved", onCustom)
    channel?.removeEventListener("message", onMessage)
  }
}
