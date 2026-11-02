export type ImportedTable = {
  columns: string[]
  rows: string[][]
}

const MAX_COLUMNS = 20
const MAX_ROWS = 200

function cleanCell(value: unknown): string {
  if (value == null) return ""
  if (typeof value === "string") return value
  if (typeof value === "number" || typeof value === "boolean") return String(value)
  try {
    return JSON.stringify(value)
  } catch {
    return String(value)
  }
}

function normalize(columns: string[], rows: string[][]): ImportedTable {
  const width = Math.min(MAX_COLUMNS, Math.max(1, columns.length))
  const outColumns = Array.from({ length: width }, (_, index) => cleanCell(columns[index]).trim() || `Column ${index + 1}`)
  const seen = new Map<string, number>()
  for (let index = 0; index < outColumns.length; index++) {
    const count = seen.get(outColumns[index]) ?? 0
    seen.set(outColumns[index], count + 1)
    if (count > 0) outColumns[index] = `${outColumns[index]} (${count + 1})`
  }
  const outRows = rows
    .slice(0, MAX_ROWS)
    .map((row) => Array.from({ length: width }, (_, index) => cleanCell(row[index])))
  return { columns: outColumns, rows: outRows }
}

function parseDelimited(text: string, delimiter: string): ImportedTable {
  const source = text.replace(/^\uFEFF/, "")
  const rows: string[][] = []
  let row: string[] = []
  let field = ""
  let quoted = false
  for (let index = 0; index < source.length; index++) {
    const char = source[index]
    if (quoted) {
      if (char === '"') {
        if (source[index + 1] === '"') {
          field += '"'
          index++
        } else {
          quoted = false
        }
      } else {
        field += char
      }
      continue
    }
    if (char === '"') {
      quoted = true
    } else if (char === delimiter) {
      row.push(field)
      field = ""
    } else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[index + 1] === "\n") index++
      row.push(field)
      if (row.some((cell) => cell.trim() !== "")) rows.push(row)
      row = []
      field = ""
    } else {
      field += char
    }
  }
  row.push(field)
  if (row.some((cell) => cell.trim() !== "")) rows.push(row)
  if (rows.length === 0) return { columns: ["Column 1"], rows: [] }
  const [columns, ...data] = rows
  return normalize(columns, data)
}

function parseJSON(text: string): ImportedTable {
  const value = JSON.parse(text.replace(/^\uFEFF/, "")) as unknown
  if (Array.isArray(value)) {
    if (value.length === 0) return { columns: ["Column 1"], rows: [] }
    if (Array.isArray(value[0])) {
      const [columns, ...rows] = value as unknown[][]
      return normalize((columns ?? []).map(cleanCell), rows.map((row) => (row as unknown[]).map(cleanCell)))
    }
    const columns: string[] = []
    const seen = new Set<string>()
    for (const item of value) {
      if (!item || typeof item !== "object" || Array.isArray(item)) continue
      for (const key of Object.keys(item)) {
        if (!seen.has(key)) {
          seen.add(key)
          columns.push(key)
        }
      }
    }
    if (columns.length === 0) return normalize(["Value"], value.map((item) => [cleanCell(item)]))
    return normalize(columns, value.map((item) => columns.map((key) => cleanCell((item as Record<string, unknown>)[key]))))
  }
  if (value && typeof value === "object") {
    const columns = Object.keys(value as Record<string, unknown>)
    return normalize(columns, [columns.map((key) => cleanCell((value as Record<string, unknown>)[key]))])
  }
  return normalize(["Value"], [[cleanCell(value)]])
}

function parseJSONL(text: string): ImportedTable {
  const items = text
    .replace(/^\uFEFF/, "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown)
  if (items.length === 0) return { columns: ["Column 1"], rows: [] }
  const columns: string[] = []
  const seen = new Set<string>()
  for (const item of items) {
    if (!item || typeof item !== "object" || Array.isArray(item)) continue
    for (const key of Object.keys(item)) {
      if (!seen.has(key)) {
        seen.add(key)
        columns.push(key)
      }
    }
  }
  if (columns.length === 0) return normalize(["Value"], items.map((item) => [cleanCell(item)]))
  return normalize(columns, items.map((item) => columns.map((key) => cleanCell((item as Record<string, unknown>)[key]))))
}

function xmlText(element: Element | null | undefined): string {
  return element?.textContent ?? ""
}

function parseSpreadsheetXML(text: string): ImportedTable {
  const doc = new DOMParser().parseFromString(text, "application/xml")
  const rowNodes = Array.from(doc.getElementsByTagName("Row"))
  const rows: string[][] = []
  for (const rowNode of rowNodes) {
    const cells: string[] = []
    for (const cell of Array.from(rowNode.getElementsByTagName("Cell"))) {
      const data = cell.getElementsByTagName("Data")[0]
      cells.push(xmlText(data))
    }
    if (cells.some((cell) => cell.trim() !== "")) rows.push(cells)
  }
  const [columns = [], ...data] = rows
  return normalize(columns, data)
}

function parseHTMLTable(text: string): ImportedTable {
  const doc = new DOMParser().parseFromString(text, "text/html")
  const table = doc.querySelector("table")
  if (!table) throw new Error("No table found")
  const rows = Array.from(table.querySelectorAll("tr")).map((tr) =>
    Array.from(tr.querySelectorAll("th,td")).map((cell) => cell.textContent ?? ""),
  ).filter((row) => row.some((cell) => cell.trim() !== ""))
  const [columns = [], ...data] = rows
  return normalize(columns, data)
}

function columnIndex(ref: string, fallback: number): number {
  const letters = ref.match(/^[A-Z]+/i)?.[0]?.toUpperCase()
  if (!letters) return fallback
  let value = 0
  for (const char of letters) value = value * 26 + (char.charCodeAt(0) - 64)
  return Math.max(0, value - 1)
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === "undefined") throw new Error("This browser cannot read .xlsx files")
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

async function readZip(buffer: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  let eocd = -1
  for (let offset = bytes.length - 22; offset >= Math.max(0, bytes.length - 65557); offset--) {
    if (view.getUint32(offset, true) === 0x06054b50) {
      eocd = offset
      break
    }
  }
  if (eocd < 0) throw new Error("Invalid .xlsx file")
  const count = view.getUint16(eocd + 10, true)
  let cursor = view.getUint32(eocd + 16, true)
  const files = new Map<string, Uint8Array>()
  const decoder = new TextDecoder()
  for (let index = 0; index < count; index++) {
    if (view.getUint32(cursor, true) !== 0x02014b50) throw new Error("Invalid .xlsx directory")
    const method = view.getUint16(cursor + 10, true)
    const compressedSize = view.getUint32(cursor + 20, true)
    const nameLength = view.getUint16(cursor + 28, true)
    const extraLength = view.getUint16(cursor + 30, true)
    const commentLength = view.getUint16(cursor + 32, true)
    const localOffset = view.getUint32(cursor + 42, true)
    const name = decoder.decode(bytes.slice(cursor + 46, cursor + 46 + nameLength))
    const localNameLength = view.getUint16(localOffset + 26, true)
    const localExtraLength = view.getUint16(localOffset + 28, true)
    const start = localOffset + 30 + localNameLength + localExtraLength
    const compressed = bytes.slice(start, start + compressedSize)
    let content: Uint8Array
    if (method === 0) content = compressed
    else if (method === 8) content = await inflateRaw(compressed)
    else throw new Error("Unsupported .xlsx compression")
    files.set(name.replace(/\\/g, "/"), content)
    cursor += 46 + nameLength + extraLength + commentLength
  }
  return files
}

function parseSharedStrings(text: string): string[] {
  const doc = new DOMParser().parseFromString(text, "application/xml")
  return Array.from(doc.getElementsByTagName("si")).map((item) => Array.from(item.getElementsByTagName("t")).map((t) => t.textContent ?? "").join(""))
}

function parseSheet(text: string, shared: string[]): ImportedTable {
  const doc = new DOMParser().parseFromString(text, "application/xml")
  const rows: string[][] = []
  for (const rowNode of Array.from(doc.getElementsByTagName("row"))) {
    const cells: string[] = []
    let nextColumn = 0
    for (const cell of Array.from(rowNode.getElementsByTagName("c"))) {
      const target = columnIndex(cell.getAttribute("r") ?? "", nextColumn)
      nextColumn = target + 1
      const type = cell.getAttribute("t")
      const value = cell.getElementsByTagName("v")[0]?.textContent ?? ""
      const inline = Array.from(cell.getElementsByTagName("is")[0]?.getElementsByTagName("t") ?? []).map((t) => t.textContent ?? "").join("")
      cells[target] = type === "s" ? shared[Number(value)] ?? "" : type === "inlineStr" ? inline : value
    }
    if (cells.some((cell) => (cell ?? "").trim() !== "")) rows.push(cells)
  }
  const [columns = [], ...data] = rows
  return normalize(columns, data)
}

async function parseXLSX(file: File): Promise<ImportedTable> {
  const files = await readZip(await file.arrayBuffer())
  const decoder = new TextDecoder()
  const sharedFile = files.get("xl/sharedStrings.xml")
  const shared = sharedFile ? parseSharedStrings(decoder.decode(sharedFile)) : []
  const sheets = [...files.keys()].filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name)).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }))
  const sheet = sheets[0]
  if (!sheet) throw new Error("No worksheet found")
  return parseSheet(decoder.decode(files.get(sheet)!), shared)
}

export async function parseTableImport(file: File): Promise<ImportedTable> {
  if (file.size > 20 * 1024 * 1024) throw new Error("File is too large (max 20 MB)")
  const name = file.name.toLowerCase()
  if (name.endsWith(".xlsx")) return parseXLSX(file)
  const text = await file.text()
  if (name.endsWith(".jsonl") || name.endsWith(".ndjson")) return parseJSONL(text)
  if (name.endsWith(".json")) return parseJSON(text)
  if (name.endsWith(".tsv") || name.endsWith(".tab")) return parseDelimited(text, "\t")
  if (name.endsWith(".xls")) {
    return /^\s*</.test(text) && /<Workbook/i.test(text) ? parseSpreadsheetXML(text) : parseHTMLTable(text)
  }
  if (name.endsWith(".xlsm")) return parseXLSX(file)
  return parseDelimited(text, ",")
}
