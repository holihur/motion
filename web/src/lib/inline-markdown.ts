type SerializedNode = Record<string, unknown>

const FORMAT_BOLD = 1
const FORMAT_ITALIC = 2
const FORMAT_STRIKETHROUGH = 4
const FORMAT_CODE = 16

const TOKEN = /(`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+(?:\s+"[^"]*")?\)|https?:\/\/[^\s<>"']+|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_)/g
const INLINE_MARKDOWN = /(`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+|https?:\/\/[^\s<>"']+|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_)/

function trimBareURL(value: string): { url: string; suffix: string } {
  let url = value
  let suffix = ""
  while (/[.,;:!?]$/.test(url)) {
    suffix = url.slice(-1) + suffix
    url = url.slice(0, -1)
  }
  while (url.endsWith(")") && (url.match(/\(/g)?.length ?? 0) < (url.match(/\)/g)?.length ?? 0)) {
    suffix = ")" + suffix
    url = url.slice(0, -1)
  }
  while (url.endsWith("]") && (url.match(/\[/g)?.length ?? 0) < (url.match(/\]/g)?.length ?? 0)) {
    suffix = "]" + suffix
    url = url.slice(0, -1)
  }
  return { url, suffix }
}

function escapeHTML(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char] ?? char))
}

function safeLink(url: string): string | null {
  const value = url.trim()
  if (!value) return null
  if (value.startsWith("/") || value.startsWith("#")) return escapeHTML(value)
  try {
    const parsed = new URL(value)
    return ["http:", "https:", "mailto:"].includes(parsed.protocol) ? escapeHTML(parsed.toString()) : null
  } catch {
    return null
  }
}

function renderInlineNodes(nodes: SerializedNode[]): string {
  return nodes.map((node) => {
    if (node.type === "linebreak") return "<br>"
    if (node.type === "link") {
      const href = safeLink(String(node.url ?? ""))
      const children = renderInlineNodes((node.children as SerializedNode[]) ?? [])
      return href ? `<a href="${href}" rel="noreferrer noopener" target="_blank">${children}</a>` : children
    }
    if (typeof node.text !== "string") {
      if (Array.isArray(node.children)) return renderInlineNodes(node.children as SerializedNode[])
      return ""
    }
    let html = escapeHTML(node.text)
    const format = Number(node.format ?? 0)
    if (format & FORMAT_CODE) html = `<code>${html}</code>`
    if (format & FORMAT_STRIKETHROUGH) html = `<s>${html}</s>`
    if (format & FORMAT_ITALIC) html = `<em>${html}</em>`
    if (format & FORMAT_BOLD) html = `<strong>${html}</strong>`
    return html
  }).join("")
}

/** Renders the inline Markdown subset to escaped HTML for lightweight previews. */
export function inlineMarkdownToHTML(value: string): string {
  if (!value) return ""
  if (!INLINE_MARKDOWN.test(value)) return escapeHTML(value)
  return renderInlineNodes(parseInline(value).nodes)
}

function textNode(text: string, format: number): SerializedNode {
  return {
    detail: 0,
    format,
    mode: "normal",
    style: "",
    text,
    type: "text",
    version: 1,
  }
}

function linebreakNode(): SerializedNode {
  return { type: "linebreak", version: 1 }
}

function linkNode(url: string, children: SerializedNode[]): SerializedNode {
  return {
    children,
    rel: null,
    target: null,
    title: null,
    url,
    direction: null,
    format: "",
    indent: 0,
    type: "link",
    version: 1,
  }
}

function applyFormat(nodes: SerializedNode[], bit: number): SerializedNode[] {
  return nodes.map((node) => {
    if (node.type === "text") return { ...node, format: Number(node.format ?? 0) | bit }
    if (Array.isArray(node.children)) {
      return { ...node, children: applyFormat(node.children as SerializedNode[], bit) }
    }
    return node
  })
}

function plain(nodes: SerializedNode[]): string {
  return nodes.map((node) => {
    if (node.type === "linebreak") return "\n"
    if (typeof node.text === "string") return node.text
    if (Array.isArray(node.children)) return plain(node.children as SerializedNode[])
    return ""
  }).join("")
}

function parseToken(token: string): SerializedNode[] {
  if (/^https?:\/\//i.test(token)) {
    const { url, suffix } = trimBareURL(token)
    if (url.length > "https://".length) {
      return [linkNode(url, [textNode(url, 0)]), ...(suffix ? [textNode(suffix, 0)] : [])]
    }
  }
  if (token.startsWith("`") && token.endsWith("`")) {
    return [textNode(token.slice(1, -1), FORMAT_CODE)]
  }
  if (token.startsWith("[")) {
    const match = /^\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)$/.exec(token)
    if (match) {
      const children = parseInline(match[1]).nodes
      return [linkNode(match[2], children.length > 0 ? children : [textNode(match[1], 0)])]
    }
  }
  if (token.startsWith("**") || token.startsWith("__")) {
    return applyFormat(parseInline(token.slice(2, -2)).nodes, FORMAT_BOLD)
  }
  if (token.startsWith("~~")) {
    return applyFormat(parseInline(token.slice(2, -2)).nodes, FORMAT_STRIKETHROUGH)
  }
  if (token.startsWith("*") || token.startsWith("_")) {
    return applyFormat(parseInline(token.slice(1, -1)).nodes, FORMAT_ITALIC)
  }
  return [textNode(token, 0)]
}

function parseInline(value: string): { nodes: SerializedNode[]; plain: string } {
  const nodes: SerializedNode[] = []
  let cursor = 0
  for (const match of value.matchAll(TOKEN)) {
    const index = match.index ?? 0
    if (index > cursor) nodes.push(...plainNodes(value.slice(cursor, index)))
    nodes.push(...parseToken(match[0]))
    cursor = index + match[0].length
  }
  if (cursor < value.length) nodes.push(...plainNodes(value.slice(cursor)))
  return { nodes, plain: plain(nodes) }
}

function plainNodes(value: string): SerializedNode[] {
  const parts = value.split("\n")
  const nodes: SerializedNode[] = []
  parts.forEach((part, index) => {
    if (part) nodes.push(textNode(part, 0))
    if (index < parts.length - 1) nodes.push(linebreakNode())
  })
  return nodes
}

/** Converts the inline Markdown subset into a Lexical editor state. */
export function inlineMarkdownToRich(value: string): { plain: string; rich?: string } {
  const parsed = parseInline(value)
  if (!INLINE_MARKDOWN.test(value)) {
    return { plain: value }
  }
  return {
    plain: parsed.plain,
    rich: JSON.stringify({
      root: {
        children: [{
          children: parsed.nodes,
          direction: null,
          format: "",
          indent: 0,
          type: "paragraph",
          version: 1,
        }],
        direction: null,
        format: "",
        indent: 0,
        type: "root",
        version: 1,
      },
    }),
  }
}
