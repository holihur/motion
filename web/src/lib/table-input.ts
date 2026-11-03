import type { TableColumnType, TableData } from "@/lib/types"

export const TABLE_COLUMN_TYPES: { value: TableColumnType; label: string }[] = [
  { value: "text", label: "Text" },
  { value: "checkbox", label: "Checkbox" },
  { value: "switch", label: "Switch" },
  { value: "select", label: "Select" },
]

const TRUE_VALUES = new Set(["true", "1", "yes", "on", "done", "checked", "x", "✓", "✔", "☑"])

export function isCheckedTableCell(value: string): boolean {
  return TRUE_VALUES.has(value.trim().toLowerCase())
}

export function tableColumnType(table: TableData, index: number): TableColumnType {
  const value = table.columnTypes?.[index]
  return value === "checkbox" || value === "switch" || value === "select" ? value : "text"
}

export function tableColumnOptions(table: TableData, index: number): string[] {
  return table.columnOptions?.[index] ?? []
}

// Checkbox/switch cells store "true" or ""; other types store their text.
export function normalizeTableCell(value: string, type: TableColumnType): string {
  if (type === "checkbox" || type === "switch") return isCheckedTableCell(value) ? "true" : ""
  return value
}

export function tableCellExportValue(value: string, type: TableColumnType): string {
  if (type === "checkbox" || type === "switch") return isCheckedTableCell(value) ? "true" : "false"
  return value
}

export function tableTypesOrUndefined(types: TableColumnType[]): TableColumnType[] | undefined {
  return types.some((type) => type !== "text") ? types : undefined
}

export function tableOptionsOrUndefined(options: (string[] | null)[]): (string[] | null)[] | undefined {
  return options.some((list) => list && list.length > 0) ? options : undefined
}
