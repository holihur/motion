import type { Block, TableData } from "@/lib/types"
import { uid } from "@/lib/utils"
import { inlineMarkdownToRich } from "@/lib/inline-markdown"

export function markdownBlock(type: Block["type"], text: string, extra: Partial<Block> = {}): Block {
  const parsed = type === "code" ? { plain: text } : inlineMarkdownToRich(text)
  return {
    id: uid(),
    type,
    text: clampText(parsed.plain),
    ...(parsed.rich ? { rich: parsed.rich } : {}),
    ...extra,
  }
}

function indentOf(line: string) {
  const leading = line.match(/^[\t ]*/)?.[0] ?? ""
  const spaces = [...leading].reduce((sum, char) => sum + (char === "\t" ? 2 : 1), 0)
  return Math.min(8, Math.floor(spaces / 2))
}

function clampText(value: string, limit = 50_000) {
  const runes = [...value]
  return runes.length > limit ? runes.slice(0, limit).join("") : value
}

function isTableSeparator(line: string) {
  return /^\s*\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(line)
}

function cells(line: string) {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim())
}

export function hasMarkdownSyntax(text: string) {
  return /(^|\n)(#{1,6}\s|```|>\s?|[-*+]\s|\d+[.)]\s|\|.+\||!\[[^\]]*\]\([^)]+\)|---+\s*$)/m.test(text) ||
    /(`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_)/.test(text)
}

/** Parses the Markdown subset used by Motion's importer and paste handler. */
export function parseMarkdownToBlocks(markdown: string): Block[] {
  const lines = markdown.replace(/\r\n?/g, "\n").split("\n")
  const out: Block[] = []
  let index = 0

  while (index < lines.length) {
    const line = lines[index]
    if (!line.trim()) {
      index += 1
      continue
    }

    // Fenced code
    const fence = /^\s*```([\w+#.-]*)\s*$/.exec(line)
    if (fence) {
      const language = fence[1] || "auto"
      const code: string[] = []
      index += 1
      while (index < lines.length && !/^\s*```\s*$/.test(lines[index])) {
        code.push(lines[index])
        index += 1
      }
      index += 1
      out.push(markdownBlock("code", code.join("\n"), { language }))
      continue
    }

    // Table
    if (line.includes("|") && index + 1 < lines.length && isTableSeparator(lines[index + 1])) {
      const columns = cells(line).slice(0, 20).map((cell) => clampText(cell, 1000))
      const rows: string[][] = []
      index += 2
      while (index < lines.length && rows.length < 200 && lines[index].includes("|") && lines[index].trim()) {
        rows.push(columns.map((_, cellIndex) => clampText(cells(lines[index])[cellIndex] ?? "", 1000)))
        index += 1
      }
      const table: TableData = { columns, rows, header: true }
      out.push(markdownBlock("table", "", { table }))
      continue
    }

    if (/^\s*(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      out.push(markdownBlock("divider", ""))
      index += 1
      continue
    }

    const image = /^\s*!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)\s*$/.exec(line)
    if (image) {
      out.push(markdownBlock("image", "", { url: image[2], caption: image[1] }))
      index += 1
      continue
    }

    const heading = /^\s*(#{1,6})\s+(.*)$/.exec(line)
    if (heading) {
      const level = Math.min(3, heading[1].length) as 1 | 2 | 3
      out.push(markdownBlock(`heading${level}` as Block["type"], heading[2].trim(), { indent: indentOf(line) }))
      index += 1
      continue
    }

    const todo = /^\s*[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(line)
    if (todo) {
      out.push(markdownBlock("todo", todo[2].trim(), { checked: todo[1].toLowerCase() === "x", indent: indentOf(line) }))
      index += 1
      continue
    }

    const bullet = /^\s*[-*+]\s+(.*)$/.exec(line)
    if (bullet) {
      out.push(markdownBlock("bulleted", bullet[1].trim(), { indent: indentOf(line) }))
      index += 1
      continue
    }

    const numbered = /^\s*\d+[.)]\s+(.*)$/.exec(line)
    if (numbered) {
      out.push(markdownBlock("numbered", numbered[1].trim(), { indent: indentOf(line) }))
      index += 1
      continue
    }

    const quote = /^\s*>\s?(.*)$/.exec(line)
    if (quote) {
      let text = quote[1].trim()
      let color = "amber"
      if (/^\[!NOTE\]/i.test(text)) { text = text.replace(/^\[!NOTE\]\s*/i, ""); color = "sky" }
      else if (/^\[!WARNING\]/i.test(text)) { text = text.replace(/^\[!WARNING\]\s*/i, ""); color = "red" }
      else if (/^\[!TIP\]/i.test(text)) { text = text.replace(/^\[!TIP\]\s*/i, ""); color = "green" }
      const callout = color !== "amber"
      out.push(markdownBlock(callout ? "callout" : "quote", text, callout ? { color } : { indent: indentOf(line) }))
      index += 1
      continue
    }

    // Paragraph: collect until blank or the next block-level construct.
    const paragraph: string[] = [line.trim()]
    index += 1
    while (index < lines.length && lines[index].trim()) {
      const next = lines[index]
      if (/^\s*(#{1,6}\s|```|>\s?|[-*+]\s|\d+[.)]\s|\|.+\||!\[[^\]]*\]\()/.test(next)) break
      paragraph.push(next.trim())
      index += 1
    }
    out.push(markdownBlock("paragraph", paragraph.join("\n")))
  }

  return out
}
