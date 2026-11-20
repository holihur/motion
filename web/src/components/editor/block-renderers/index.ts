import type { BlockType } from "@/lib/types"
import { registerBlockRenderer } from "./registry"
import { PdfBlockRenderer } from "@/components/editor/pdf-block"
import type { BlockRenderer } from "./types"
import {
  BulletedBlock,
  CalloutBlock,
  CheckboxBlock,
  ContentPlaceholderBlock,
  DividerBlock,
  HeadingBlock,
  NumberedBlock,
  ParagraphBlock,
  QuoteBlock,
  TodoBlock,
  ToggleBlock,
} from "./text-blocks"
import {
  BarcodeBlockRenderer,
  BookmarkBlockRenderer,
  BreadcrumbBlockRenderer,
  CodeBlockRenderer,
  ColumnsBlockRenderer,
  CurlBlockRenderer,
  EmbedBlockRenderer,
  EquationBlockRenderer,
  FileBlockRenderer,
  FormBlockRenderer,
  ImageBlockRenderer,
  JsonVisualBlockRenderer,
  LayoutBlockRenderer,
  MapBlockRenderer,
  PageLinkBlockRenderer,
  PasswordBlockRenderer,
  PollBlockRenderer,
  QRCodeBlockRenderer,
  RadioGroupBlockRenderer,
  TocBlockRenderer,
  VideoBlockRenderer,
} from "./content-blocks"
import {
  CalendarBlockRenderer,
  ChartBlockRenderer,
  DatabaseBlockRenderer,
  DiagramBlockRenderer,
  GanttBlockRenderer,
  TableBlockRenderer,
} from "./data-blocks"

// Record<BlockType, …> makes this list exhaustive: adding a BlockType without a
// renderer is a compile error, and removing a type leaves an invalid key.
const builtInRenderers: Record<BlockType, BlockRenderer> = {
  paragraph: ParagraphBlock,
  heading1: HeadingBlock,
  heading2: HeadingBlock,
  heading3: HeadingBlock,
  bulleted: BulletedBlock,
  numbered: NumberedBlock,
  todo: TodoBlock,
  quote: QuoteBlock,
  callout: CalloutBlock,
  toggle: ToggleBlock,
  toggleHeading1: ToggleBlock,
  toggleHeading2: ToggleBlock,
  toggleHeading3: ToggleBlock,
  checkbox: CheckboxBlock,
  radio: CheckboxBlock,
  switch: CheckboxBlock,
  divider: DividerBlock,
  content: ContentPlaceholderBlock,

  code: CodeBlockRenderer,
  curl: CurlBlockRenderer,
  equation: EquationBlockRenderer,
  password: PasswordBlockRenderer,
  bookmark: BookmarkBlockRenderer,
  video: VideoBlockRenderer,
  embed: EmbedBlockRenderer,
  file: FileBlockRenderer,
  pdf: PdfBlockRenderer,
  toc: TocBlockRenderer,
  jsonVisual: JsonVisualBlockRenderer,
  pageLink: PageLinkBlockRenderer,
  breadcrumb: BreadcrumbBlockRenderer,
  columns: ColumnsBlockRenderer,
  layout: LayoutBlockRenderer,
  qrcode: QRCodeBlockRenderer,
  barcode: BarcodeBlockRenderer,
  radioGroup: RadioGroupBlockRenderer,
  form: FormBlockRenderer,
  poll: PollBlockRenderer,
  map: MapBlockRenderer,
  image: ImageBlockRenderer,

  table: TableBlockRenderer,
  diagram: DiagramBlockRenderer,
  database: DatabaseBlockRenderer,
  gantt: GanttBlockRenderer,
  chart: ChartBlockRenderer,
  calendar: CalendarBlockRenderer,
}

for (const [type, renderer] of Object.entries(builtInRenderers)) {
  registerBlockRenderer(type, renderer)
}

export { getBlockRenderer, registerBlockRenderer, registeredBlockTypes } from "./registry"
export type { BlockRenderer, BlockRenderProps } from "./types"
