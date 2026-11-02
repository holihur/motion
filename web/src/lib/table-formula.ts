import type { TableData } from "@/lib/types"

// A deliberately small spreadsheet engine: no eval, no network, no DOM.
// Formulas live in `table.formulas` keyed by "<row>:<column>" (0-based data
// row and column). `table.rows` always stores the computed display value so
// read-only views, exports and static publishing need no evaluator.
//
// References use spreadsheet notation and point at data rows only:
// A1 is the first cell of the first data row (headers are excluded).

export const FORMULA_ERRORS = {
  parse: "#ERROR!",
  ref: "#REF!",
  div: "#DIV/0!",
  name: "#NAME?",
  cycle: "#CYCLE!",
  value: "#VALUE!",
  num: "#NUM!",
} as const

export type FormulaValue = number | string | boolean

const ERROR_VALUES = new Set<string>(Object.values(FORMULA_ERRORS))

export function isFormulaError(value: FormulaValue): value is string {
  return typeof value === "string" && ERROR_VALUES.has(value)
}

export function isFormulaInput(text: string): boolean {
  return text.trimStart().startsWith("=")
}

export function formulaCellKey(row: number, column: number): string {
  return `${row}:${column}`
}

export function parseFormulaCellKey(key: string): { row: number; column: number } | null {
  const match = /^(\d+):(\d+)$/.exec(key)
  if (!match) return null
  return { row: Number(match[1]), column: Number(match[2]) }
}

// Shift formula keys after rows/columns are inserted, removed or reordered.
export function remapFormulas(
  formulas: Record<string, string> | undefined,
  map: (row: number, column: number) => { row: number; column: number } | null,
): Record<string, string> | undefined {
  if (!formulas) return undefined
  const next: Record<string, string> = {}
  let changed = false
  for (const [key, formula] of Object.entries(formulas)) {
    const position = parseFormulaCellKey(key)
    if (!position) { changed = true; continue }
    const mapped = map(position.row, position.column)
    if (!mapped) { changed = true; continue }
    if (mapped.row !== position.row || mapped.column !== position.column) changed = true
    next[formulaCellKey(mapped.row, mapped.column)] = formula
  }
  return changed ? (Object.keys(next).length ? next : undefined) : formulas
}

export function formatFormulaValue(value: FormulaValue): string {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return FORMULA_ERRORS.num
    if (Number.isInteger(value) && Math.abs(value) < 1e15) return String(value)
    return String(Number(value.toFixed(10)))
  }
  if (typeof value === "boolean") return value ? "TRUE" : "FALSE"
  return value
}

function parseCellText(text: string): FormulaValue {
  const trimmed = text.trim()
  if (trimmed === "") return ""
  if (/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) return Number(trimmed)
  const percent = /^(-?(?:\d+(?:\.\d*)?|\.\d+))%$/.exec(trimmed)
  if (percent) return Number(percent[1]) / 100
  return text
}

function isTruthy(value: FormulaValue): boolean {
  if (typeof value === "boolean") return value
  if (typeof value === "number") return value !== 0
  return value !== "" && value.toUpperCase() !== "FALSE"
}

function toNumber(value: FormulaValue): number | string {
  if (typeof value === "number") return value
  if (typeof value === "boolean") return value ? 1 : 0
  if (value.trim() === "") return 0
  const parsed = Number(value.trim().replace(/,/g, ""))
  if (Number.isFinite(parsed)) return parsed
  return FORMULA_ERRORS.value
}

function toText(value: FormulaValue): string {
  return formatFormulaValue(value)
}

function compareValues(left: FormulaValue, right: FormulaValue): number {
  const ln = toNumber(left)
  const rn = toNumber(right)
  if (typeof ln === "number" && typeof rn === "number") return ln - rn
  return toText(left).localeCompare(toText(right), undefined, { numeric: true, sensitivity: "base" })
}

function isEqual(left: FormulaValue, right: FormulaValue): boolean {
  if (left === right) return true
  const ln = toNumber(left)
  const rn = toNumber(right)
  if (typeof ln === "number" && typeof rn === "number") return ln === rn
  return toText(left).toLowerCase() === toText(right).toLowerCase()
}

type FormulaArg = FormulaValue | FormulaValue[]

function flatten(args: FormulaArg[]): FormulaValue[] {
  const out: FormulaValue[] = []
  for (const arg of args) {
    if (Array.isArray(arg)) out.push(...flatten(arg))
    else out.push(arg)
  }
  return out
}

function numbersOf(args: FormulaArg[]): number[] | string {
  const out: number[] = []
  for (const value of flatten(args)) {
    if (isFormulaError(value)) return value
    if (typeof value === "number") out.push(value)
  }
  return out
}

function firstError(args: FormulaArg[]): string | null {
  for (const value of flatten(args)) {
    if (isFormulaError(value)) return value
  }
  return null
}

function columnLabelToIndex(label: string): number {
  let index = 0
  for (const char of label.toUpperCase()) {
    index = index * 26 + (char.charCodeAt(0) - 64)
  }
  return index - 1
}

function columnIndexToLabel(index: number): string {
  let label = ""
  let value = index + 1
  while (value > 0) {
    const remainder = (value - 1) % 26
    label = String.fromCharCode(65 + remainder) + label
    value = Math.floor((value - 1) / 26)
  }
  return label
}

type Token =
  | { kind: "number"; value: number }
  | { kind: "string"; value: string }
  | { kind: "ref"; row: number; column: number }
  | { kind: "name"; value: string }
  | { kind: "op"; value: string }
  | { kind: "lparen" }
  | { kind: "rparen" }
  | { kind: "comma" }
  | { kind: "colon" }

function tokenize(source: string): Token[] {
  const tokens: Token[] = []
  let index = 0
  while (index < source.length) {
    const char = source[index]
    if (/\s/.test(char)) { index += 1; continue }
    if (char === '"') {
      let value = ""
      index += 1
      while (index < source.length) {
        if (source[index] === '"') {
          if (source[index + 1] === '"') { value += '"'; index += 2; continue }
          index += 1
          break
        }
        value += source[index]
        index += 1
      }
      tokens.push({ kind: "string", value })
      continue
    }
    const rest = source.slice(index)
    const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/.exec(rest)
    if (number) {
      tokens.push({ kind: "number", value: Number(number[0]) })
      index += number[0].length
      continue
    }
    const ref = /^\$?([A-Za-z]{1,3})\$?(\d+)(?![A-Za-z0-9_])/.exec(rest)
    if (ref) {
      tokens.push({ kind: "ref", row: Number(ref[2]) - 1, column: columnLabelToIndex(ref[1]) })
      index += ref[0].length
      continue
    }
    const name = /^[A-Za-z_][A-Za-z0-9_.]*/.exec(rest)
    if (name) {
      tokens.push({ kind: "name", value: name[0].toUpperCase() })
      index += name[0].length
      continue
    }
    if (rest.startsWith("<=") || rest.startsWith(">=") || rest.startsWith("<>")) {
      tokens.push({ kind: "op", value: rest.slice(0, 2) })
      index += 2
      continue
    }
    if ("+-*/%^&=<>".includes(char)) {
      tokens.push({ kind: "op", value: char })
      index += 1
      continue
    }
    if (char === "(") { tokens.push({ kind: "lparen" }); index += 1; continue }
    if (char === ")") { tokens.push({ kind: "rparen" }); index += 1; continue }
    if (char === ",") { tokens.push({ kind: "comma" }); index += 1; continue }
    if (char === ":") { tokens.push({ kind: "colon" }); index += 1; continue }
    throw new FormulaParseError(`Unexpected character ${char}`)
  }
  return tokens
}

class FormulaParseError extends Error {}

export interface FormulaContext {
  columns: number
  rows: number
  read: (row: number, column: number) => FormulaValue
}

type EvalResult = FormulaArg

interface Parser {
  source: string
  tokens: Token[]
  index: number
  context: FormulaContext
}

function peek(parser: Parser): Token | undefined {
  return parser.tokens[parser.index]
}

function next(parser: Parser): Token | undefined {
  return parser.tokens[parser.index++]
}

function expect(parser: Parser, kind: Token["kind"]): Token {
  const token = next(parser)
  if (!token || token.kind !== kind) throw new FormulaParseError(`Expected ${kind}`)
  return token
}

function evaluateFunction(parser: Parser, name: string): FormulaValue {
  expect(parser, "lparen")
  const args: FormulaArg[] = []
  if (peek(parser)?.kind !== "rparen") {
    for (;;) {
      const value = parseExpression(parser)
      if (Array.isArray(value)) args.push(...value)
      else args.push(value)
      if (peek(parser)?.kind === "comma") { next(parser); continue }
      break
    }
  }
  expect(parser, "rparen")
  return callFunction(name, args)
}

function callFunction(name: string, rawArgs: FormulaArg[]): FormulaValue {
  const error = firstError(rawArgs)
  const args = flatten(rawArgs)
  const needsNumbers = () => numbersOf(rawArgs)

  switch (name) {
    case "SUM": {
      const values = needsNumbers()
      if (typeof values === "string") return values
      return values.reduce((sum, value) => sum + value, 0)
    }
    case "PRODUCT": {
      const values = needsNumbers()
      if (typeof values === "string") return values
      if (values.length === 0) return 0
      return values.reduce((product, value) => product * value, 1)
    }
    case "AVERAGE":
    case "AVG": {
      const values = needsNumbers()
      if (typeof values === "string") return values
      if (values.length === 0) return FORMULA_ERRORS.div
      return values.reduce((sum, value) => sum + value, 0) / values.length
    }
    case "MIN": {
      const values = needsNumbers()
      if (typeof values === "string") return values
      return values.length === 0 ? 0 : Math.min(...values)
    }
    case "MAX": {
      const values = needsNumbers()
      if (typeof values === "string") return values
      return values.length === 0 ? 0 : Math.max(...values)
    }
    case "MEDIAN": {
      const values = needsNumbers()
      if (typeof values === "string") return values
      if (values.length === 0) return FORMULA_ERRORS.num
      const sorted = [...values].sort((a, b) => a - b)
      const middle = Math.floor(sorted.length / 2)
      return sorted.length % 2 ? (sorted[middle] ?? 0) : ((sorted[middle - 1] ?? 0) + (sorted[middle] ?? 0)) / 2
    }
    case "COUNT": {
      const values = needsNumbers()
      if (typeof values === "string") return values
      return values.length
    }
    case "COUNTA":
      return args.filter((value) => toText(value) !== "").length
    case "COUNTBLANK":
      return args.filter((value) => toText(value) === "").length
    case "ABS": {
      const value = toNumber(args[0] ?? 0)
      return typeof value === "string" ? value : Math.abs(value)
    }
    case "INT": {
      const value = toNumber(args[0] ?? 0)
      return typeof value === "string" ? value : Math.floor(value)
    }
    case "SQRT": {
      const value = toNumber(args[0] ?? 0)
      if (typeof value === "string") return value
      return value < 0 ? FORMULA_ERRORS.num : Math.sqrt(value)
    }
    case "POWER": {
      const base = toNumber(args[0] ?? 0)
      if (typeof base === "string") return base
      const exponent = toNumber(args[1] ?? 0)
      if (typeof exponent === "string") return exponent
      const result = Math.pow(base, exponent)
      return Number.isFinite(result) ? result : FORMULA_ERRORS.num
    }
    case "ROUND":
    case "ROUNDUP":
    case "ROUNDDOWN": {
      const value = toNumber(args[0] ?? 0)
      if (typeof value === "string") return value
      const digitsValue = toNumber(args[1] ?? 0)
      if (typeof digitsValue === "string") return digitsValue
      const digits = Math.trunc(digitsValue)
      const factor = Math.pow(10, digits)
      const scaled = value * factor
      const rounded = name === "ROUNDUP" ? Math.ceil(scaled) : name === "ROUNDDOWN" ? Math.trunc(scaled) : Math.round(scaled)
      return rounded / factor
    }
    case "IF": {
      if (args.length < 2) return FORMULA_ERRORS.parse
      const condition = args[0]
      if (isFormulaError(condition)) return condition
      return isTruthy(condition) ? args[1] : (args[2] ?? "")
    }
    case "IFERROR": {
      const value = args[0] ?? ""
      return isFormulaError(value) ? (args[1] ?? "") : value
    }
    case "AND":
      return args.every((value) => isTruthy(value))
    case "OR":
      return args.some((value) => isTruthy(value))
    case "NOT":
      return !isTruthy(args[0] ?? "")
    case "CONCAT":
    case "CONCATENATE": {
      let text = ""
      const append = (value: FormulaArg) => {
        if (Array.isArray(value)) value.forEach(append)
        else text += toText(value)
      }
      rawArgs.forEach(append)
      return text
    }
    case "LEN":
      return toText(args[0] ?? "").length
    case "UPPER":
      return toText(args[0] ?? "").toUpperCase()
    case "LOWER":
      return toText(args[0] ?? "").toLowerCase()
    case "TRIM":
      return toText(args[0] ?? "").trim()
    case "TEXT":
      return toText(args[0] ?? "")
    case "TRUE":
      return true
    case "FALSE":
      return false
    default:
      if (error) return error
      return FORMULA_ERRORS.name
  }
}

function parsePrimary(parser: Parser): EvalResult {
  const token = next(parser)
  if (!token) throw new FormulaParseError("Unexpected end of formula")
  if (token.kind === "number") return token.value
  if (token.kind === "string") return token.value
  if (token.kind === "lparen") {
    const value = parseExpression(parser)
    expect(parser, "rparen")
    return value
  }
  if (token.kind === "ref") {
    if (peek(parser)?.kind === "colon") {
      next(parser)
      const end = expect(parser, "ref")
      if (end.kind !== "ref") throw new FormulaParseError("Expected range end")
      const startRow = Math.min(token.row, end.row)
      const endRow = Math.max(token.row, end.row)
      const startColumn = Math.min(token.column, end.column)
      const endColumn = Math.max(token.column, end.column)
      const values: FormulaValue[] = []
      for (let row = startRow; row <= endRow; row++) {
        for (let column = startColumn; column <= endColumn; column++) {
          values.push(parser.context.read(row, column))
        }
      }
      return values
    }
    return parser.context.read(token.row, token.column)
  }
  if (token.kind === "name") {
    if (peek(parser)?.kind === "lparen") return evaluateFunction(parser, token.value)
    if (token.value === "TRUE") return true
    if (token.value === "FALSE") return false
    return FORMULA_ERRORS.name
  }
  throw new FormulaParseError("Unexpected token")
}

function parseUnary(parser: Parser): EvalResult {
  const token = peek(parser)
  if (token?.kind === "op" && (token.value === "-" || token.value === "+")) {
    next(parser)
    const value = parseUnary(parser)
    if (Array.isArray(value)) return FORMULA_ERRORS.value
    if (isFormulaError(value)) return value
    const numeric = toNumber(value)
    if (typeof numeric === "string") return numeric
    return token.value === "-" ? -numeric : numeric
  }
  return parsePower(parser)
}

function parsePower(parser: Parser): EvalResult {
  const base = parsePrimary(parser)
  const token = peek(parser)
  if (token?.kind === "op" && token.value === "^") {
    next(parser)
    const exponent = parseUnary(parser)
    if (Array.isArray(base)) return FORMULA_ERRORS.value
    if (Array.isArray(exponent)) return FORMULA_ERRORS.value
    if (isFormulaError(base)) return base
    if (isFormulaError(exponent)) return exponent
    const left = toNumber(base)
    if (typeof left === "string") return left
    const right = toNumber(exponent)
    if (typeof right === "string") return right
    const result = Math.pow(left, right)
    return Number.isFinite(result) ? result : FORMULA_ERRORS.num
  }
  return base
}

function parseMultiplicative(parser: Parser): EvalResult {
  let value = parseUnary(parser)
  for (;;) {
    const token = peek(parser)
    if (token?.kind !== "op" || !"*/%".includes(token.value)) return value
    next(parser)
    const right = parseUnary(parser)
    if (Array.isArray(value) || Array.isArray(right)) { value = FORMULA_ERRORS.value; continue }
    if (isFormulaError(value)) continue
    if (isFormulaError(right)) { value = right; continue }
    const left = toNumber(value)
    if (typeof left === "string") { value = left; continue }
    const divisor = toNumber(right)
    if (typeof divisor === "string") { value = divisor; continue }
    if ((token.value === "/" || token.value === "%") && divisor === 0) { value = FORMULA_ERRORS.div; continue }
    const result = token.value === "*" ? left * divisor : token.value === "/" ? left / divisor : left % divisor
    value = Number.isFinite(result) ? result : FORMULA_ERRORS.num
  }
}

function parseAdditive(parser: Parser): EvalResult {
  let value = parseMultiplicative(parser)
  for (;;) {
    const token = peek(parser)
    if (token?.kind !== "op" || (token.value !== "+" && token.value !== "-" && token.value !== "&")) return value
    next(parser)
    const right = parseMultiplicative(parser)
    if (Array.isArray(value) || Array.isArray(right)) { value = FORMULA_ERRORS.value; continue }
    if (isFormulaError(value)) continue
    if (isFormulaError(right)) { value = right; continue }
    if (token.value === "&") { value = toText(value) + toText(right); continue }
    const left = toNumber(value)
    if (typeof left === "string") { value = left; continue }
    const operand = toNumber(right)
    if (typeof operand === "string") { value = operand; continue }
    const result = token.value === "+" ? left + operand : left - operand
    value = Number.isFinite(result) ? result : FORMULA_ERRORS.num
  }
}

function parseExpression(parser: Parser): EvalResult {
  let value = parseAdditive(parser)
  for (;;) {
    const token = peek(parser)
    if (token?.kind !== "op" || !["=", "<>", "<", ">", "<=", ">="].includes(token.value)) return value
    next(parser)
    const right = parseAdditive(parser)
    if (Array.isArray(value) || Array.isArray(right)) { value = FORMULA_ERRORS.value; continue }
    if (isFormulaError(value)) continue
    if (isFormulaError(right)) { value = right; continue }
    switch (token.value) {
      case "=": value = isEqual(value, right); break
      case "<>": value = !isEqual(value, right); break
      case "<": value = compareValues(value, right) < 0; break
      case ">": value = compareValues(value, right) > 0; break
      case "<=": value = compareValues(value, right) <= 0; break
      default: value = compareValues(value, right) >= 0; break
    }
  }
}

// Evaluate a single formula against a cell reader. Exposed for tests/tools.
export function evaluateFormula(formula: string, context: FormulaContext): FormulaValue {
  const source = formula.trim()
  if (!source.startsWith("=")) return source
  const body = source.slice(1)
  if (body.trim() === "") return ""
  try {
    const parser: Parser = { source: body, tokens: tokenize(body), index: 0, context }
    const value = parseExpression(parser)
    if (parser.index < parser.tokens.length) return FORMULA_ERRORS.parse
    if (Array.isArray(value)) return value.length === 1 ? (value[0] as FormulaValue) : FORMULA_ERRORS.value
    return value
  } catch {
    return FORMULA_ERRORS.parse
  }
}

export function columnLabel(index: number): string {
  return columnIndexToLabel(index)
}

// Recompute every formula cell and write the plain-text results into `rows`,
// so exports, read-only views and the server all read finished values.
export function computeTableFormulas(table: TableData): TableData {
  const formulas = table.formulas
  if (!formulas) return table
  const keys = Object.keys(formulas).filter((key) => {
    const position = parseFormulaCellKey(key)
    return Boolean(position && position.row >= 0 && position.row < table.rows.length && position.column >= 0 && position.column < table.columns.length && formulas[key].trim() !== "")
  })
  if (keys.length === 0) return table

  const values = new Map<string, FormulaValue>()
  const evaluating = new Set<string>()

  const readCell = (row: number, column: number): FormulaValue => {
    if (column < 0 || column >= table.columns.length) return FORMULA_ERRORS.ref
    if (row < 0) return FORMULA_ERRORS.ref
    const key = formulaCellKey(row, column)
    if (formulas[key]) return resolve(key)
    return parseCellText(table.rows[row]?.[column] ?? "")
  }

  const resolve = (key: string): FormulaValue => {
    const cached = values.get(key)
    if (cached !== undefined) return cached
    if (evaluating.has(key)) return FORMULA_ERRORS.cycle
    const formula = formulas[key]
    if (!formula) return ""
    evaluating.add(key)
    const result = evaluateFormula(formula, { columns: table.columns.length, rows: table.rows.length, read: readCell })
    evaluating.delete(key)
    values.set(key, result)
    return result
  }

  const rows = table.rows.map((row) => [...row])
  let changed = false
  for (const key of keys) {
    const position = parseFormulaCellKey(key)
    if (!position) continue
    const text = formatFormulaValue(resolve(key))
    if (rows[position.row][position.column] !== text) {
      rows[position.row][position.column] = text
      changed = true
    }
  }
  if (!changed) return table
  return { ...table, rows }
}
