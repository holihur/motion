import type { TableData } from "@/lib/types"

export function tableColumnOrder(table: TableData): number[] {
  const count = table.columns.length
  const seen = new Set<number>()
  const order: number[] = []
  for (const index of table.columnOrder ?? []) {
    if (index >= 0 && index < count && !seen.has(index)) {
      seen.add(index)
      order.push(index)
    }
  }
  for (let index = 0; index < count; index++) {
    if (!seen.has(index)) order.push(index)
  }
  return order
}

export function tableVisibleColumnIndexes(table: TableData): number[] {
  const hidden = new Set(table.hiddenColumns ?? [])
  return tableColumnOrder(table).filter((index) => !hidden.has(index))
}

export function tableFrozenColumnIndexes(table: TableData): Set<number> {
  const visible = tableVisibleColumnIndexes(table)
  const frozen = new Set<number>()
  for (const index of table.frozenColumns ?? []) {
    if (visible.includes(index)) frozen.add(index)
  }
  if (table.freezeFirst && visible.length > 0) frozen.add(visible[0])
  return frozen
}

// Left offset (in px) for each frozen column, accounting for the row-number column.
export function tableFrozenOffsets(table: TableData, rowNumbers = false): Map<number, number> {
  const frozen = tableFrozenColumnIndexes(table)
  const offsets = new Map<number, number>()
  if (frozen.size === 0) return offsets
  let left = rowNumbers ? 40 : 0
  for (const index of tableVisibleColumnIndexes(table)) {
    if (!frozen.has(index)) continue
    offsets.set(index, left)
    left += table.widths?.[index] ?? 160
  }
  return offsets
}
