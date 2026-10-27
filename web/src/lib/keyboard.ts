/**
 * Browsers report IME confirmation differently. During Chinese/Japanese/Korean
 * composition, Enter commits the candidate instead of inserting a newline.
 * `isComposing` is ignored by some older Chromium/Safari versions, so keyCode
 * 229 is kept as a fallback.
 */
type KeyEventLike = {
  nativeEvent?: { isComposing?: boolean; keyCode?: number }
  isComposing?: boolean
  keyCode?: number
}

export function isImeKeyEvent(event: KeyEventLike): boolean {
  return Boolean(
    event.nativeEvent?.isComposing ||
      event.nativeEvent?.keyCode === 229 ||
      event.isComposing ||
      event.keyCode === 229,
  )
}
