interface LexicalNode {
  type?: string
  text?: string
  url?: string
  format?: number
  children?: LexicalNode[]
}

const FORMAT_BOLD = 1
const FORMAT_ITALIC = 2
const FORMAT_STRIKETHROUGH = 4
const FORMAT_UNDERLINE = 8
const FORMAT_CODE = 16

function parse(rich?: string): LexicalNode | null {
  if (!rich?.trim()) return null
  try {
    const value = JSON.parse(rich) as { root?: LexicalNode }
    return value.root ?? null
  } catch {
    return null
  }
}

function markdownText(value: string, format = 0) {
  let text = value
  if (format & FORMAT_CODE) {
    const ticks = text.includes("`") ? "``" : "`"
    text = `${ticks}${text}${ticks}`
  }
  if (format & FORMAT_BOLD) text = `**${text}**`
  if (format & FORMAT_ITALIC) text = `*${text}*`
  if (format & FORMAT_UNDERLINE) text = `<u>${text}</u>`
  if (format & FORMAT_STRIKETHROUGH) text = `~~${text}~~`
  return text
}

function nodeMarkdown(node: LexicalNode): string {
  switch (node.type) {
    case "text":
    case "mention":
      return markdownText(node.text ?? "", node.format)
    case "linebreak":
      return "\n"
    case "link":
      return `[${childrenMarkdown(node)}](${node.url ?? ""})`
    default:
      return childrenMarkdown(node)
  }
}

function childrenMarkdown(node: LexicalNode): string {
  return (node.children ?? []).map(nodeMarkdown).join("")
}

export function inlineMarkdown(rich: string | undefined, fallback: string): string {
  const root = parse(rich)
  if (!root) return fallback
  const value = (root.children ?? []).map(nodeMarkdown).join("\n")
  return value || fallback
}
