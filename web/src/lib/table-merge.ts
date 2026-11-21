import type { TableCellMerge, TableData } from "@/lib/types"

/** Cell key used by the render/focus helpers. */
export function cellKey(row: number, col: number): string {
  return `${row}:${col}`
}

/** Returns the merge that contains (row, col), if any. */
export function mergeAt(merges: TableCellMerge[] | undefined, row: number, col: number): TableCellMerge | undefined {
  return merges?.find((merge) => row >= merge.row && row < merge.row + merge.rowSpan && col >= merge.col && col < merge.col + merge.colSpan)
}

/** Cells hidden by a merge (everything except the anchor). */
export function coveredCells(merges: TableCellMerge[] | undefined): Set<string> {
  const covered = new Set<string>()
  for (const merge of merges ?? []) {
    for (let row = merge.row; row < merge.row + merge.rowSpan; row++) {
      for (let col = merge.col; col < merge.col + merge.colSpan; col++) {
        if (row === merge.row && col === merge.col) continue
        covered.add(cellKey(row, col))
      }
    }
  }
  return covered
}

function overlaps(a: TableCellMerge, b: TableCellMerge): boolean {
  return !(
    a.row + a.rowSpan <= b.row ||
    b.row + b.rowSpan <= a.row ||
    a.col + a.colSpan <= b.col ||
    b.col + b.colSpan <= a.col
  )
}

/** Drops out-of-bounds, 1x1 and overlapping merges. */
export function normalizeMerges(merges: TableCellMerge[] | undefined, rows: number, cols: number): TableCellMerge[] | undefined {
  if (!merges?.length || rows <= 0 || cols <= 0) return undefined
  const accepted: TableCellMerge[] = []
  for (const raw of merges) {
    const row = Math.max(0, Math.min(rows - 1, Math.trunc(raw.row)))
    const col = Math.max(0, Math.min(cols - 1, Math.trunc(raw.col)))
    const rowSpan = Math.max(1, Math.min(rows - row, Math.trunc(raw.rowSpan)))
    const colSpan = Math.max(1, Math.min(cols - col, Math.trunc(raw.colSpan)))
    if (rowSpan === 1 && colSpan === 1) continue
    const merge = { row, col, rowSpan, colSpan }
    if (accepted.some((item) => overlaps(item, merge))) continue
    accepted.push(merge)
    if (accepted.length >= 200) break
  }
  return accepted.length ? accepted : undefined
}

function withMerges(table: TableData, merges: TableCellMerge[] | undefined): TableData {
  const next = normalizeMerges(merges, table.rows.length, table.columns.length)
  return { ...table, merges: next }
}

/** Merge the active cell with the next column (absorbs an existing merge there). */
export function mergeRight(table: TableData, row: number, col: number): TableData | null {
  const merges = table.merges ?? []
  const current = mergeAt(merges, row, col) ?? { row, col, rowSpan: 1, colSpan: 1 }
  const targetCol = current.col + current.colSpan
  if (targetCol >= table.columns.length) return null
  const target = mergeAt(merges, row, targetCol)
  if (target && (target.row !== current.row || target.rowSpan !== current.rowSpan)) return null
  const colSpan = current.colSpan + (target?.colSpan ?? 1)
  const next = merges.filter((merge) => merge !== target)
  const anchorIndex = next.indexOf(current)
  const merged = { ...current, colSpan }
  if (anchorIndex >= 0) next[anchorIndex] = merged
  else next.push(merged)
  return withMerges(table, next)
}

/** Merge the active cell with the row below (absorbs an existing merge there). */
export function mergeDown(table: TableData, row: number, col: number): TableData | null {
  const merges = table.merges ?? []
  const current = mergeAt(merges, row, col) ?? { row, col, rowSpan: 1, colSpan: 1 }
  const targetRow = current.row + current.rowSpan
  if (targetRow >= table.rows.length) return null
  const target = mergeAt(merges, targetRow, col)
  if (target && (target.col !== current.col || target.colSpan !== current.colSpan)) return null
  const rowSpan = current.rowSpan + (target?.rowSpan ?? 1)
  const next = merges.filter((merge) => merge !== target)
  const anchorIndex = next.indexOf(current)
  const merged = { ...current, rowSpan }
  if (anchorIndex >= 0) next[anchorIndex] = merged
  else next.push(merged)
  return withMerges(table, next)
}

/** Remove any merge covering the active cell. */
export function unmergeAt(table: TableData, row: number, col: number): TableData | null {
  const merges = table.merges ?? []
  const target = mergeAt(merges, row, col)
  if (!target) return null
  return withMerges(table, merges.filter((merge) => merge !== target))
}

/** Keep merges valid after a row or column is removed. */
export function remapMerges(merges: TableCellMerge[] | undefined, kind: "row" | "col", removedIndex: number): TableCellMerge[] | undefined {
  if (!merges?.length) return undefined
  const startKey = kind === "row" ? "row" : "col"
  const spanKey = kind === "row" ? "rowSpan" : "colSpan"
  const out: TableCellMerge[] = []
  for (const merge of merges) {
    let start = merge[startKey]
    let span = merge[spanKey]
    if (removedIndex < start) {
      start -= 1
    } else if (removedIndex < start + span) {
      // The removed index was inside the merge: shrink it.
      span -= 1
    }
    if (span <= 1 && (kind === "row" ? merge.colSpan : merge.rowSpan) <= 1) continue
    out.push({ ...merge, [startKey]: Math.max(0, start), [spanKey]: Math.max(1, span) })
  }
  return out.length ? out : undefined
}

export interface CellRange {
  top: number
  left: number
  bottom: number
  right: number
}

/** Normalizes two corners into an inclusive rectangle. */
export function cellRange(row1: number, col1: number, row2: number, col2: number): CellRange {
  return {
    top: Math.min(row1, row2),
    left: Math.min(col1, col2),
    bottom: Math.max(row1, row2),
    right: Math.max(col1, col2),
  }
}

export function rangeContains(range: CellRange, row: number, col: number): boolean {
  return row >= range.top && row <= range.bottom && col >= range.left && col <= range.right
}

/**
 * Merge a rectangular selection. Existing merges must sit fully inside or
 * fully outside; a merge that crosses the selection boundary is rejected.
 */
export function mergeSelection(table: TableData, range: CellRange): TableData | null {
  const rowSpan = range.bottom - range.top + 1
  const colSpan = range.right - range.left + 1
  if (rowSpan * colSpan <= 1) return null
  const merges = table.merges ?? []
  const inside: TableCellMerge[] = []
  const remaining: TableCellMerge[] = []
  for (const merge of merges) {
    const touches = !(
      merge.row + merge.rowSpan <= range.top ||
      range.bottom + 1 <= merge.row ||
      merge.col + merge.colSpan <= range.left ||
      range.right + 1 <= merge.col
    )
    if (!touches) {
      remaining.push(merge)
      continue
    }
    const fullyInside =
      merge.row >= range.top &&
      merge.col >= range.left &&
      merge.row + merge.rowSpan <= range.bottom + 1 &&
      merge.col + merge.colSpan <= range.right + 1
    if (!fullyInside) return null
    inside.push(merge)
  }
  const next = [...remaining, { row: range.top, col: range.left, rowSpan, colSpan }]
  return withMerges(table, next)
}

/** Remove every merge that intersects the range. */
export function unmergeSelection(table: TableData, range: CellRange): TableData | null {
  const merges = table.merges ?? []
  const remaining = merges.filter((merge) =>
    merge.row + merge.rowSpan <= range.top ||
    range.bottom + 1 <= merge.row ||
    merge.col + merge.colSpan <= range.left ||
    range.right + 1 <= merge.col,
  )
  if (remaining.length === merges.length) return null
  return withMerges(table, remaining)
}
