// Clipboard API is unavailable in insecure contexts (plain HTTP on a LAN IP)
// and in some embedded browsers. Install a synchronous fallback so copy buttons
// don't crash with "Cannot read properties of undefined (reading 'writeText')".
export function installClipboardFallback() {
  if (typeof navigator === "undefined" || typeof document === "undefined") return
  const existing = (navigator as unknown as { clipboard?: { writeText?: unknown } }).clipboard
  if (existing && typeof existing.writeText === "function") return

  const writeText = async (text: string): Promise<void> => {
    const textarea = document.createElement("textarea")
    textarea.value = text
    textarea.setAttribute("readonly", "")
    textarea.style.position = "fixed"
    textarea.style.left = "-9999px"
    textarea.style.top = "0"
    textarea.style.opacity = "0"
    textarea.style.pointerEvents = "none"
    document.body.appendChild(textarea)
    try {
      textarea.focus()
      textarea.select()
      textarea.setSelectionRange(0, text.length)
      if (!document.execCommand("copy")) throw new Error("copy command was rejected")
    } finally {
      textarea.remove()
    }
  }

  try {
    if (!existing) {
      Object.defineProperty(navigator, "clipboard", {
        value: { writeText },
        configurable: true,
      })
    } else {
      Object.defineProperty(existing, "writeText", {
        value: writeText,
        configurable: true,
      })
    }
  } catch {
    // Some browsers expose a non-configurable clipboard object; there is no
    // safe fallback in that case, but the original error is still avoided.
  }
}
