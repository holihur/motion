import type { LucideIcon } from "lucide-react"
import {
  CheckSquare,
  Code2,
  Heading1,
  Heading2,
  Heading3,
  Image,
  List,
  ListOrdered,
  MessageSquareQuote,
  Minus,
  Quote,
  Table2,
  Network,
  Type,
} from "lucide-react"
import type { BlockType } from "@/lib/types"

export interface SlashCommand {
  type: BlockType
  title: string
  description: string
  icon: LucideIcon
  keywords: string
}

export const SLASH_COMMANDS: SlashCommand[] = [
  { type: "paragraph", title: "Text", description: "Just start writing", icon: Type, keywords: "paragraph plain body" },
  { type: "heading1", title: "Heading 1", description: "Big section heading", icon: Heading1, keywords: "h1 title" },
  { type: "heading2", title: "Heading 2", description: "Medium section heading", icon: Heading2, keywords: "h2 subtitle" },
  { type: "heading3", title: "Heading 3", description: "Small section heading", icon: Heading3, keywords: "h3" },
  { type: "bulleted", title: "Bulleted list", description: "Simple unordered list", icon: List, keywords: "bullet ul list" },
  { type: "numbered", title: "Numbered list", description: "List with numbers", icon: ListOrdered, keywords: "ordered ol number" },
  { type: "todo", title: "To-do list", description: "Track tasks with checkboxes", icon: CheckSquare, keywords: "task checkbox todo" },
  { type: "quote", title: "Quote", description: "Capture a quote", icon: Quote, keywords: "blockquote citation" },
  { type: "callout", title: "Callout", description: "Make writing stand out", icon: MessageSquareQuote, keywords: "note info tip box" },
  { type: "code", title: "Code", description: "Capture a code snippet", icon: Code2, keywords: "snippet pre monospace" },
  { type: "table", title: "Table", description: "Organize information in a grid", icon: Table2, keywords: "grid rows columns spreadsheet" },
  { type: "diagram", title: "Diagram", description: "Draw a flowchart with Mermaid", icon: Network, keywords: "mermaid flowchart graph chart" },
  { type: "divider", title: "Divider", description: "Visually divide blocks", icon: Minus, keywords: "line hr separator" },
  { type: "image", title: "Image", description: "Embed an image from a URL", icon: Image, keywords: "picture photo embed" },
]

export const BLOCK_LABELS: Record<BlockType, string> = {
  paragraph: "Text",
  heading1: "Heading 1",
  heading2: "Heading 2",
  heading3: "Heading 3",
  bulleted: "Bulleted list",
  numbered: "Numbered list",
  todo: "To-do list",
  quote: "Quote",
  callout: "Callout",
  code: "Code",
  divider: "Divider",
  image: "Image",
  table: "Table",
  diagram: "Diagram",
}

export function filterCommands(query: string) {
  const value = query.trim().toLowerCase()
  if (!value) return SLASH_COMMANDS
  return SLASH_COMMANDS.filter((command) =>
    `${command.title} ${command.description} ${command.keywords}`.toLowerCase().includes(value),
  )
}
