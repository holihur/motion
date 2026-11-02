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
