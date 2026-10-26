export function focusBlockById(
  id: string,
  where: "start" | "end" = "end",
  offset?: number,
) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent("motion:focus-block", { detail: { id, where, offset } }),
    )
  }
  const el = document.getElementById(`block-input-${id}`)
  if (!el) return
  // Lexical owns its selection. The event above is handled by FocusBridge;
  // touching the DOM selection here can move the caret to the start.
  if (el.hasAttribute("data-lexical-input")) return
  if (el instanceof HTMLTextAreaElement || el instanceof HTMLInputElement) {
    el.focus()
    const position = where === "end" ? el.value.length : 0
    try {
      el.setSelectionRange(position, position)
    } catch {
      // Some input types do not support selection ranges.
    }
    return
  }
  el.focus()
  setCaret(el, where === "end" ? Number.MAX_SAFE_INTEGER : 0)
}

export function setCaret(el: HTMLElement, offset: number) {
  const selection = window.getSelection()
  if (!selection) return
  const range = document.createRange()
  const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT)
  let remaining = offset
  let node = walker.nextNode()
  while (node) {
    const length = node.textContent?.length ?? 0
    if (remaining <= length) {
      range.setStart(node, Math.max(0, remaining))
      range.collapse(true)
      selection.removeAllRanges()
      selection.addRange(range)
      return
    }
    remaining -= length
    node = walker.nextNode()
  }
  range.selectNodeContents(el)
  range.collapse(false)
  selection.removeAllRanges()
  selection.addRange(range)
}

export function caretOffset(el: HTMLElement): number {
  const selection = window.getSelection()
  if (!selection || selection.rangeCount === 0) return 0
  const focus = selection.focusNode
  if (!focus || !el.contains(focus)) return 0
  const range = document.createRange()
  range.selectNodeContents(el)
  range.setEnd(focus, selection.focusOffset)
  return range.toString().length
}

export function caretRect(fallback?: HTMLElement | null): DOMRect | null {
  const selection = window.getSelection()
  if (selection && selection.rangeCount > 0) {
    const range = selection.getRangeAt(0).cloneRange()
    const rect = range.getBoundingClientRect()
    if (rect.width || rect.height || rect.top || rect.left) return rect
    const rects = range.getClientRects()
    if (rects.length > 0) return rects[rects.length - 1]
  }
  return fallback?.getBoundingClientRect() ?? null
}

export function htmlToPlainText(value: string) {
  const container = document.createElement("div")
  container.innerHTML = value
  return container.innerText.replace(/\u00a0/g, " ")
}
