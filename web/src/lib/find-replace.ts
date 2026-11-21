import type { Block } from "@/lib/types"

export interface Match {
  blockIndex: number
  start: number
  end: number
}

/** Case-insensitive, literal matches of `query` across plain block text. */
export function findMatches(blocks: Block[], query: string): Match[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  const out: Match[] = []
  blocks.forEach((block, blockIndex) => {
    const text = block.text ?? ""
    const hay = text.toLowerCase()
    let from = 0
    while (from <= hay.length) {
      const at = hay.indexOf(needle, from)
      if (at < 0) break
      out.push({ blockIndex, start: at, end: at + needle.length })
      from = at + Math.max(1, needle.length)
    }
  })
  return out
}

/** Replace only the k-th occurrence (0-based) of `query` inside a Lexical JSON string. */
export function replaceInRich(
  rich: string | undefined,
  query: string,
  replacement: string,
  onlyOccurrence?: number,
): string | undefined {
  if (!rich?.trim()) return undefined
  let json: { root?: { children?: unknown[] } }
  try {
    json = JSON.parse(rich)
  } catch {
    return undefined
  }
  const needle = query.toLowerCase()
  let counter = 0
  let changed = false

  const walk = (node: unknown): void => {
    if (!node || typeof node !== "object") return
    const record = node as { type?: string; text?: string; children?: unknown[] }
    if (record.type === "text" && typeof record.text === "string") {
      const hay = record.text.toLowerCase()
      let next = ""
      let pos = 0
      let from = 0
      while (from <= hay.length) {
        const at = hay.indexOf(needle, from)
        if (at < 0) break
        const occurrence = counter++
        const use = onlyOccurrence === undefined || occurrence === onlyOccurrence
        next += record.text.slice(pos, at)
        next += use ? replacement : record.text.slice(at, at + needle.length)
        pos = at + needle.length
        from = pos
        if (use) changed = true
      }
      next += record.text.slice(pos)
      if (next !== record.text) {
        record.text = next
        changed = true
      }
      return
    }
    for (const child of record.children ?? []) walk(child)
  }

  walk(json.root)
  return changed ? JSON.stringify(json) : undefined
}

/**
 * Replace the given matches. Offsets are computed per block so callers can
 * replace a single hit ("replace") or every hit ("replace all").
 */
export function replaceMatches(blocks: Block[], query: string, replacement: string, targets: Match[]): Block[] {
  if (!query.trim() || targets.length === 0) return blocks
  const startsByBlock = new Map<number, number[]>()
  for (const match of targets) {
    startsByBlock.set(match.blockIndex, [...(startsByBlock.get(match.blockIndex) ?? []), match.start])
  }

  return blocks.map((block, index) => {
    const starts = startsByBlock.get(index)
    if (!starts?.length) return block

    const local = findMatches([block], query)
    const occurrences = starts
      .map((start) => local.findIndex((match) => match.start === start))
      .filter((occurrence) => occurrence >= 0)

    let text = block.text ?? ""
    for (const occurrence of [...occurrences].sort((a, b) => b - a)) {
      const match = local[occurrence]
      text = text.slice(0, match.start) + replacement + text.slice(match.end)
    }

    let rich = block.rich
    if (rich) {
      for (const occurrence of [...occurrences].sort((a, b) => b - a)) {
        const next = replaceInRich(rich, query, replacement, occurrence)
        if (next) rich = next
      }
    }

    return { ...block, text, rich }
  })
}
