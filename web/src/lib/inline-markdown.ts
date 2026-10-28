type SerializedNode = Record<string, unknown>

const FORMAT_BOLD = 1
const FORMAT_ITALIC = 2
const FORMAT_STRIKETHROUGH = 4
const FORMAT_CODE = 16

const TOKEN = /(`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+(?:\s+"[^"]*")?\)|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_)/g

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
  if (!/(`[^`\n]+`|\[[^\]\n]+\]\([^)\s]+|\*\*[^*\n]+\*\*|__[^_\n]+__|~~[^~\n]+~~|\*[^*\n]+\*|_[^_\n]+_)/.test(value)) {
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
