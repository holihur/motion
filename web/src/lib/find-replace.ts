import type { Block } from "@/lib/types"

export type MatchTarget =
  | { kind: "text" }
  | { kind: "table"; row: number; col: number }
  | { kind: "database"; row: number; colId: string }

export interface Match {
  blockIndex: number
  start: number
  end: number
  target: MatchTarget
}

const TABLE_BLOCK_TYPES = new Set(["table", "gantt", "chart", "calendar"])

function indexesOf(value: string, query: string): number[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return []
  const hay = value.toLowerCase()
  const out: number[] = []
  let from = 0
  while (from <= hay.length) {
    const at = hay.indexOf(needle, from)
    if (at < 0) break
    out.push(at)
    from = at + Math.max(1, needle.length)
  }
  return out
}

/** Case-insensitive, literal matches across block text, table cells and database cells. */
export function findMatches(blocks: Block[], query: string): Match[] {
  if (!query.trim()) return []
  const out: Match[] = []
  blocks.forEach((block, blockIndex) => {
    for (const start of indexesOf(block.text ?? "", query)) {
      out.push({ blockIndex, start, end: start + query.trim().length, target: { kind: "text" } })
    }
    if (TABLE_BLOCK_TYPES.has(block.type) && block.table) {
      block.table.rows.forEach((row, rowIndex) => {
        row.forEach((cell, col) => {
          for (const start of indexesOf(cell ?? "", query)) {
            out.push({ blockIndex, start, end: start + query.trim().length, target: { kind: "table", row: rowIndex, col } })
          }
        })
      })
    }
    if (block.type === "database" && block.database) {
      block.database.rows.forEach((row, rowIndex) => {
        for (const column of block.database?.columns ?? []) {
          const value = row[column.id] ?? ""
          for (const start of indexesOf(value, query)) {
            out.push({ blockIndex, start, end: start + query.trim().length, target: { kind: "database", row: rowIndex, colId: column.id } })
          }
        }
      })
    }
  })
  return out
}

function replaceAt(value: string, start: number, length: number, replacement: string): string {
  return value.slice(0, start) + replacement + value.slice(start + length)
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
  const needle = query.trim().toLowerCase()
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
 * Replace the given matches. Offsets are computed per block/cell so callers can
 * replace a single hit ("replace") or every hit ("replace all").
 */
export function replaceMatches(blocks: Block[], query: string, replacement: string, targets: Match[]): Block[] {
  const needleLength = query.trim().length
  if (!needleLength || targets.length === 0) return blocks

  const textStarts = new Map<number, number[]>()
  const tableCells = new Map<string, { blockIndex: number; row: number; col: number; starts: number[] }>()
  const databaseCells = new Map<string, { blockIndex: number; row: number; colId: string; starts: number[] }>()

  for (const match of targets) {
    if (match.target.kind === "text") {
      textStarts.set(match.blockIndex, [...(textStarts.get(match.blockIndex) ?? []), match.start])
    } else if (match.target.kind === "table") {
      const key = `${match.blockIndex}:${match.target.row}:${match.target.col}`
      const existing = tableCells.get(key)
      if (existing) existing.starts.push(match.start)
      else tableCells.set(key, { blockIndex: match.blockIndex, row: match.target.row, col: match.target.col, starts: [match.start] })
    } else {
      const key = `${match.blockIndex}:${match.target.row}:${match.target.colId}`
      const existing = databaseCells.get(key)
      if (existing) existing.starts.push(match.start)
      else databaseCells.set(key, { blockIndex: match.blockIndex, row: match.target.row, colId: match.target.colId, starts: [match.start] })
    }
  }

  return blocks.map((block, index) => {
    let next = block

    const starts = textStarts.get(index)
    if (starts?.length) {
      const local = findMatches([block], query).filter((match) => match.target.kind === "text")
      const occurrences = starts
        .map((start) => local.findIndex((match) => match.start === start))
        .filter((occurrence) => occurrence >= 0)

      let text = block.text ?? ""
      for (const occurrence of [...occurrences].sort((a, b) => b - a)) {
        const match = local[occurrence]
        text = replaceAt(text, match.start, needleLength, replacement)
      }

      let rich = block.rich
      if (rich) {
        for (const occurrence of [...occurrences].sort((a, b) => b - a)) {
          const updated = replaceInRich(rich, query, replacement, occurrence)
          if (updated) rich = updated
        }
      }
      next = { ...next, text, rich }
    }

    const table = next.table
    if (table) {
      let changed = false
      const rows = table.rows.map((row, rowIndex) => {
        let nextRow = row
        row.forEach((cell, colIndex) => {
          const entry = tableCells.get(`${index}:${rowIndex}:${colIndex}`)
          if (!entry) return
          let value = cell ?? ""
          for (const start of [...entry.starts].sort((a, b) => b - a)) {
            value = replaceAt(value, start, needleLength, replacement)
          }
          if (!changed) nextRow = [...row]
          changed = true
          nextRow[colIndex] = value
        })
        return nextRow
      })
      if (changed) next = { ...next, table: { ...table, rows } }
    }

    const database = next.database
    if (database) {
      let changed = false
      const rows = database.rows.map((row, rowIndex) => {
        let nextRow = row
        for (const column of database.columns) {
          const entry = databaseCells.get(`${index}:${rowIndex}:${column.id}`)
          if (!entry) continue
          let value = row[column.id] ?? ""
          for (const start of [...entry.starts].sort((a, b) => b - a)) {
            value = replaceAt(value, start, needleLength, replacement)
          }
          if (!changed) nextRow = { ...row }
          changed = true
          nextRow[column.id] = value
        }
        return nextRow
      })
      if (changed) next = { ...next, database: { ...database, rows } }
    }

    return next
  })
}
