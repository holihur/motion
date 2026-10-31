import type { Block, Page } from "./types"
import { inlineMarkdown } from "./richtext"

function blockToMarkdown(block: Block, number: number): string {
  const inline = inlineMarkdown(block.rich, block.text).trim()
  const text = inline
  switch (block.type) {
    case "heading1":
      return `# ${text}`
    case "heading2":
      return `## ${text}`
    case "heading3":
      return `### ${text}`
    case "bulleted":
      return `- ${text}`
    case "numbered":
      return `${number}. ${text}`
    case "todo":
      return `- [${block.checked ? "x" : " "}] ${text}`
    case "quote":
      return `> ${text.replace(/\n/g, "\n> ")}`
    case "callout":
      return `> 💡 ${text.replace(/\n/g, "\n> ")}`
    case "code":
      return `\`\`\`${block.language ?? ""}\n${block.text}\n\`\`\``
    case "divider":
      return "---"
    case "image":
      return block.url ? `![${block.caption ?? ""}](${block.url})` : ""
    case "table": {
      const table = block.table
      if (!table) return ""
      const header = `| ${table.columns.join(" | ")} |`
      const divider = `| ${table.columns.map(() => "---").join(" | ")} |`
      const rows = table.rows.map((row) => `| ${table.columns.map((_, index) => row[index] ?? "").join(" | ")} |`)
      return [header, divider, ...rows].join("\n")
    }
    case "diagram":
      return `\`\`\`mermaid\n${block.text}\n\`\`\``
    case "poll": {
      const poll = block.poll
      if (!poll) return text
      const lines = [`**${poll.question || "Poll"}**`]
      const total = poll.options.reduce((sum, o) => sum + (o.votes?.length ?? 0), 0)
      for (const opt of poll.options) {
        lines.push(`- [ ] ${opt.text} (${opt.votes?.length ?? 0}/${total})`)
      }
      return lines.join("\n")
    }
    default:
      return text
  }
}

export function blocksToMarkdown(blocks: Block[]): string {
  let number = 0
  const parts: string[] = []
  for (const block of blocks) {
    if (block.type === "numbered") number += 1
    else number = 0
    const value = blockToMarkdown(block, number)
    if (value) parts.push(value)
  }
  return parts.join("\n\n").trim()
}

export function pageToMarkdown(page: Page): string {
  const body = blocksToMarkdown(page.blocks)
  return [`# ${page.title.trim() || "Untitled"}`, body].filter(Boolean).join("\n\n").trim() + "\n"
}

export function downloadMarkdown(page: Page) {
  const blob = new Blob([pageToMarkdown(page)], { type: "text/markdown;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  const filename = (page.title.trim() || "Untitled").replace(/[\\/:*?"<>|]+/g, "-")
  link.href = url
  link.download = `${filename}.md`
  document.body.appendChild(link)
  link.click()
  link.remove()
  URL.revokeObjectURL(url)
}
