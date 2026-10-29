import type { Block, TableData } from "@/lib/types"
import { markdownBlock } from "@/lib/markdown-import"

const MAX_BLOCKS = 800

/** 行内 HTML → Markdown（复用现有行内富文本解析）。 */
function inlineToMarkdown(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? ""
  if (node.nodeType !== Node.ELEMENT_NODE) return ""
  const el = node as HTMLElement
  const tag = el.tagName.toLowerCase()
  if (tag === "br") return "\n"
  if (tag === "img") {
    const src = el.getAttribute("src")?.trim() ?? ""
    if (!src) return ""
    return `![${(el.getAttribute("alt") ?? "").replace(/[\[\]]/g, "")}](${src})`
  }
  const inner = [...el.childNodes].map(inlineToMarkdown).join("")
  switch (tag) {
    case "strong":
    case "b": return inner.trim() ? `**${inner}**` : inner
    case "em":
    case "i": return inner.trim() ? `*${inner}*` : inner
    case "code": return inner.includes("\n") ? `\`\`\`\n${inner}\n\`\`\`` : inner ? `\`${inner}\`` : inner
    case "s":
    case "del": return inner.trim() ? `~~${inner}~~` : inner
    case "a": {
      const href = el.getAttribute("href")?.trim() ?? ""
      const text = inner.trim() || href
      return href && text !== href ? `[${text}](${href})` : text || href
    }
    case "span":
    case "font":
    case "u":
    case "mark":
    case "small":
    case "abbr":
    case "time":
      return inner
    default:
      return inner
  }
}

/** 纯文本（含换行），忽略脚本样式。 */
function textOf(el: Element): string {
  if (["script", "style", "noscript", "template"].includes(el.tagName.toLowerCase())) return ""
  return (el.textContent ?? "").replace(/[ \t]+\n/g, "\n").trim()
}

function langOf(pre: Element): string {
  const code = pre.querySelector("code")
  const cls = `${pre.className} ${code?.className ?? ""}`
  const m = /language-([\w+#.-]+)/.exec(cls) ?? /lang(?:uage)?-([\w+#.-]+)/.exec(cls)
  return m ? m[1] : "auto"
}

function isCheckboxInput(el: Element): boolean {
  return el.tagName === "INPUT" && (el.getAttribute("type") ?? "").toLowerCase() === "checkbox"
}

export function extractHTMLTitle(html: string): string {
  try {
    const doc = new DOMParser().parseFromString(html, "text/html")
    const h1 = doc.querySelector("article h1, .page-title, h1")
    const t = (h1?.textContent ?? doc.title ?? "").trim()
    return t.slice(0, 120)
  } catch {
    return ""
  }
}

/**
 * HTML（Notion / 语雀 / 印象笔记 / 飞书等导出的 HTML）→ Motion blocks。
 * 未知标签一律降级为段落，保证不丢字。
 */
export function parseHTMLToBlocks(html: string): Block[] {
  const out: Block[] = []
  let doc: Document
  try {
    doc = new DOMParser().parseFromString(html, "text/html")
  } catch {
    return out
  }
  const push = (b: Block) => { if (out.length < MAX_BLOCKS) out.push(b) }

  function walkList(list: Element, ordered: boolean, indent: number) {
    for (const li of [...list.children].filter((c) => c.tagName === "LI")) {
      if (out.length >= MAX_BLOCKS) return
      // 勾选框：Notion/语雀导出的 todo
      const box = [...li.children].find(isCheckboxInput) ?? (isCheckboxInput(li.firstElementChild as Element) ? li.firstElementChild as Element : null)
      // LI 自身行内内容（排除嵌套列表/代码块/表格）
      const inlineParts: string[] = []
      for (const child of [...li.childNodes]) {
        if (child.nodeType === Node.ELEMENT_NODE) {
          const t = (child as HTMLElement).tagName.toLowerCase()
          if (t === "ul" || t === "ol" || t === "pre" || t === "table" || t === "blockquote") continue
          if (isCheckboxInput(child as Element)) continue
        }
        inlineParts.push(inlineToMarkdown(child))
      }
      let text = inlineParts.join("").replace(/\s+\n/g, "\n").trim()
      // 纯字符式 todo：☐ ☑ ▢ ☒ [ ]
      let checked: boolean | null = box ? (box as HTMLInputElement).checked || box.hasAttribute("checked") : null
      if (checked === null) {
        const m = /^([☐▢□]\s*|\[ \]\s*)/.exec(text)
        if (m) { checked = false; text = text.slice(m[0].length).trim() }
        else {
          const m2 = /^([☑☒▣■]\s*|\[[xX]\]\s*)/.exec(text)
          if (m2) { checked = true; text = text.slice(m2[0].length).trim() }
        }
      }
      if (text || checked !== null) {
        push(checked !== null
          ? markdownBlock("todo", text, { checked: checked ?? false, indent })
          : markdownBlock(ordered ? "numbered" : "bulleted", text, { indent }))
      }
      // 嵌套块：列表 / 代码 / 引用挂到下一级
      for (const child of [...li.children]) {
        const t = child.tagName.toLowerCase()
        if (t === "ul") walkList(child, false, Math.min(8, indent + 1))
        else if (t === "ol") walkList(child, true, Math.min(8, indent + 1))
        else if (t === "pre" || t === "blockquote" || t === "table" || t === "img") walkNode(child, Math.min(8, indent + 1))
      }
    }
  }

  function walkTable(table: Element, indent: number) {
    const rows = [...table.querySelectorAll(":scope > thead > tr, :scope > tbody > tr, :scope > tr")]
    const body = rows.length ? rows : [...table.querySelectorAll("tr")].slice(0, 201)
    if (!body.length) return
    const headCells = [...body[0].querySelectorAll(":scope > th, :scope > td")].map((c) => textOf(c).slice(0, 1000))
    const columns = (headCells.length ? headCells : ["列 1"]).slice(0, 20)
    const start = headCells.length && body[0].querySelector("th") ? 1 : 0
    const data: string[][] = []
    for (const tr of body.slice(start, start + 200)) {
      const cells = [...tr.querySelectorAll(":scope > td, :scope > th")].map((c) => textOf(c).slice(0, 1000))
      data.push(columns.map((_, i) => cells[i] ?? ""))
    }
    const tableData: TableData = { columns, rows: data, header: true }
    push(markdownBlock("table", "", { table: tableData, indent }))
  }

  function walkNode(node: Node, indent: number) {
    if (out.length >= MAX_BLOCKS) return
    if (node.nodeType === Node.TEXT_NODE) {
      const t = (node.textContent ?? "").trim()
      if (t) push(markdownBlock("paragraph", t, { indent }))
      return
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return
    const el = node as HTMLElement
    const tag = el.tagName.toLowerCase()
    if (["script", "style", "noscript", "template", "head", "meta", "link"].includes(tag)) return

    switch (tag) {
      case "h1": push(markdownBlock("heading1", textOf(el), { indent })); return
      case "h2": push(markdownBlock("heading2", textOf(el), { indent })); return
      case "h3":
      case "h4":
      case "h5":
      case "h6": { const t = textOf(el); if (t) push(markdownBlock("heading3", t, { indent })); return }
      case "p":
      case "div":
      case "section":
      case "article":
      case "main":
      case "header":
      case "footer":
      case "figure":
      case "figcaption": {
        // 透明容器：有块级孩子就递归，否则当段落
        const hasBlock = [...el.children].some((c) => /^(h[1-6]|p|ul|ol|pre|blockquote|table|hr|img|figure|div|section|article|aside|details)$/i.test(c.tagName))
        if (tag === "p" || !hasBlock) {
          const md = inlineToMarkdown(el).replace(/[ \t]+\n/g, "\n").trim()
          if (md) {
            const imgOnly = /^\s*!\[([^\]]*)\]\(([^)\s]+)\)\s*$/.exec(md)
            if (imgOnly) push(markdownBlock("image", "", { url: imgOnly[2], caption: imgOnly[1], indent }))
            else push(markdownBlock("paragraph", md, { indent }))
          } else if (tag === "p") {
            const img = el.querySelector("img")
            if (img?.getAttribute("src")) push(markdownBlock("image", "", { url: img.getAttribute("src")!, caption: img.getAttribute("alt") ?? "", indent }))
          }
          return
        }
        for (const child of [...el.childNodes]) walkNode(child, indent)
        return
      }
      case "ul": walkList(el, false, indent); return
      case "ol": walkList(el, true, indent); return
      case "li": {
        // 游离 LI（容错）：包一层走列表逻辑
        const fake = document.createElement(indent ? "ul" : "ul")
        fake.appendChild(el.cloneNode(true))
        walkList(fake, false, indent)
        return
      }
      case "blockquote": {
        const t = inlineToMarkdown(el).trim()
        if (t) push(markdownBlock("quote", t, { indent }))
        return
      }
      case "aside": {
        const t = inlineToMarkdown(el).trim()
        if (t) push(markdownBlock("callout", t, { color: "amber", indent }))
        return
      }
      case "pre": {
        const code = el.textContent ?? ""
        push(markdownBlock("code", code.replace(/^\n+|\s+$/g, ""), { language: langOf(el), indent }))
        return
      }
      case "table": walkTable(el, indent); return
      case "img": {
        const src = el.getAttribute("src")?.trim() ?? ""
        if (src) push(markdownBlock("image", "", { url: src, caption: el.getAttribute("alt") ?? "", indent }))
        return
      }
      case "hr": push(markdownBlock("divider", "", { indent })); return
      case "details": {
        const summary = el.querySelector(":scope > summary")
        push(markdownBlock("toggle", summary ? textOf(summary) : "详情", { indent }))
        for (const child of [...el.childNodes]) {
          if (child === summary) continue
          walkNode(child, Math.min(8, indent + 1))
        }
        return
      }
      case "a": {
        const href = el.getAttribute("href")?.trim() ?? ""
        const t = textOf(el) || href
        if (t) push(markdownBlock("paragraph", href && t !== href ? `[${t}](${href})` : t, { indent }))
        return
      }
      case "br": return
      default: {
        // 未知标签：有块级孩子递归，否则取文本兜底
        if (el.children.length && [...el.children].some((c) => c.children.length || /^(ul|ol|table|pre|blockquote)$/i.test(c.tagName))) {
          for (const child of [...el.childNodes]) walkNode(child, indent)
        } else {
          const t = textOf(el)
          if (t) push(markdownBlock("paragraph", t.slice(0, 50000), { indent }))
        }
      }
    }
  }

  const body = doc.body ?? doc.documentElement
  // 跳过 Notion 导出外壳，直达内容区（有则用，没有就全文走）
  const content = body.querySelector(".page-body, article.page, .post-content, main") ?? body
  for (const child of [...content.childNodes]) {
    if (out.length >= MAX_BLOCKS) break
    walkNode(child, 0)
  }
  return out
}
