import { Check, Loader2, AlertCircle } from "lucide-react"
import { tr } from "@/lib/i18n"

export type SaveState = "saved" | "saving" | "error"

export function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state === "error") {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-destructive transition hover:bg-destructive/10"
      >
        <AlertCircle className="size-3.5" />
        <span className="hidden sm:inline">{tr("Couldn’t save · Retry")}</span>
      </button>
    )
  }
  return (
    <div className="hidden items-center gap-1.5 px-2 text-[11px] text-muted-foreground sm:flex">
      {state === "saving" ? <Loader2 className="size-3 animate-spin" /> : <Check className="size-3" />}
      <span>{state === "saving" ? tr("Saving…") : tr("Saved")}</span>
    </div>
  )
}

export function rangeFromOffsets(root: HTMLElement, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let position = 0
  let startNode: Text | null = null
  let startOffset = 0
  let endNode: Text | null = null
  let endOffset = 0
  let node = walker.nextNode() as Text | null
  while (node) {
    const length = node.textContent?.length ?? 0
    if (!startNode && start >= position && start <= position + length) {
      startNode = node
      startOffset = start - position
    }
    if (!endNode && end >= position && end <= position + length) {
      endNode = node
      endOffset = end - position
      break
    }
    position += length
    node = walker.nextNode() as Text | null
  }
  if (!startNode || !endNode) return null
  const range = document.createRange()
  try {
    range.setStart(startNode, startOffset)
    range.setEnd(endNode, endOffset)
    return range
  } catch {
    return null
  }
}
