import type { LucideIcon } from "lucide-react"
import {
  Bookmark,
  ChartColumn,
  ChartGantt,
  CheckSquare,
  ClipboardList,
  Columns2,
  Code2,
  FileText,
  Frame,
  Heading1,
  Heading2,
  Heading3,
  Image,
  Map,
  KeyRound,
  List,
  ListCollapse,
  ListTree,
  Link2,
  PanelTop,
  Sigma,
  Video,
  ListOrdered,
  MessageSquareQuote,
  Minus,
  RectangleHorizontal,
  Quote,
  Table2,
  Network,
  QrCode,
  ScanBarcode,
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
  { type: "map", title: "Map", description: "Embed an interactive map", icon: Map, keywords: "map location address google amap baidu mapbox" },
  { type: "content", title: "Content placeholder", description: "Where page content appears in a layout", icon: RectangleHorizontal, keywords: "layout placeholder content slot" },
  { type: "password", title: "Password area", description: "Hide secrets behind a password", icon: KeyRound, keywords: "password lock secret encrypted credentials area" },
  { type: "bookmark", title: "Bookmark", description: "Save a link as a visual card", icon: Bookmark, keywords: "link url bookmark web" },
  { type: "video", title: "Video", description: "Embed a YouTube or Vimeo video", icon: Video, keywords: "video youtube vimeo movie embed" },
  { type: "embed", title: "Embed", description: "Embed any web page inline", icon: Frame, keywords: "iframe embed website frame" },
  { type: "file", title: "File", description: "Link to a downloadable file", icon: FileText, keywords: "file attachment download pdf" },
  { type: "equation", title: "Equation", description: "Write math with LaTeX", icon: Sigma, keywords: "math latex formula equation katex" },
  { type: "toc", title: "Table of contents", description: "Link to every heading on the page", icon: ListTree, keywords: "toc contents outline headings index" },
  { type: "gantt", title: "Gantt", description: "Plan tasks on a timeline", icon: ChartGantt, keywords: "gantt timeline project schedule tasks plan" },
  { type: "chart", title: "Chart", description: "Visualize data as bar, line or pie", icon: ChartColumn, keywords: "chart graph bar line pie data visualize" },
  { type: "toggle", title: "Toggle", description: "Collapsible text section", icon: ListCollapse, keywords: "toggle collapse fold details" },
  { type: "toggleHeading1", title: "Toggle heading 1", description: "Collapsible large heading", icon: Heading1, keywords: "toggle heading h1 fold" },
  { type: "toggleHeading2", title: "Toggle heading 2", description: "Collapsible medium heading", icon: Heading2, keywords: "toggle heading h2 fold" },
  { type: "toggleHeading3", title: "Toggle heading 3", description: "Collapsible small heading", icon: Heading3, keywords: "toggle heading h3 fold" },
  { type: "pageLink", title: "Page link", description: "Mention another page", icon: Link2, keywords: "page mention link reference backlink" },
  { type: "breadcrumb", title: "Breadcrumb", description: "Show this page's path", icon: PanelTop, keywords: "breadcrumb path parent navigation" },
  { type: "columns", title: "Columns", description: "Place text side by side", icon: Columns2, keywords: "columns layout grid side" },
  { type: "qrcode", title: "QR code", description: "Generate a QR code from text or a URL", icon: QrCode, keywords: "qr code url scan barcode" },
  { type: "barcode", title: "Barcode", description: "Generate a CODE128 or retail barcode", icon: ScanBarcode, keywords: "barcode code128 ean upc scan" },
  { type: "form", title: "Form", description: "Collect responses with a simple form", icon: ClipboardList, keywords: "form survey input response collect" },
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
  map: "Map",
  content: "Content placeholder",
  table: "Table",
  diagram: "Diagram",
  password: "Password area",
  bookmark: "Bookmark",
  video: "Video",
  embed: "Embed",
  file: "File",
  equation: "Equation",
  toc: "Table of contents",
  gantt: "Gantt",
  chart: "Chart",
  toggle: "Toggle",
  toggleHeading1: "Toggle heading 1",
  toggleHeading2: "Toggle heading 2",
  toggleHeading3: "Toggle heading 3",
  pageLink: "Page link",
  breadcrumb: "Breadcrumb",
  columns: "Columns",
  qrcode: "QR code",
  barcode: "Barcode",
  form: "Form",
}

export function filterCommands(query: string) {
  const value = query.trim().toLowerCase()
  if (!value) return SLASH_COMMANDS
  return SLASH_COMMANDS.filter((command) =>
    `${command.title} ${command.description} ${command.keywords}`.toLowerCase().includes(value),
  )
}
