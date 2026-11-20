import type { ComponentType, KeyboardEvent, ReactNode } from "react"
import type { Block, Comment, Member } from "@/lib/types"
import type { HeadingItem } from "@/components/editor/rich-blocks"

export interface BlockBreadcrumbItem {
  id: string
  title: string
  icon: string
}

/**
 * Everything a block renderer may need. Keeping this in one place means new
 * renderers do not have to thread dozens of props through intermediate
 * components, and `BlockRow` stays focused on layout, selection and menus.
 */
export interface BlockRenderProps {
  block: Block
  index: number
  number: number
  placeholder: string
  readOnly: boolean
  allowVote: boolean
  isLayout: boolean
  hasContentPlaceholder: boolean
  resetKey: number
  autoFocus: boolean
  autoFocusWhere?: "start" | "end"
  autoFocusOffset?: number
  hasChildren: boolean
  headings: HeadingItem[]
  breadcrumb: BlockBreadcrumbItem[]
  workspaceId: string
  pageId: string
  members: Member[]
  comments: Comment[]
  onInput: (text: string, el: HTMLElement, rich?: string) => void
  onKeyDown: (event: KeyboardEvent<HTMLElement>, index: number) => void
  onPaste: (text: string) => void
  onToggle: () => void
  onUpdate: (patch: Partial<Block>) => void
  onDelete: () => void
  onFocusBlock?: (blockId: string) => void
  onOpenComments?: () => void
  onCommentsChanged?: () => void
  onToggleCollapsed?: () => void
  renderEditable: (className: string) => ReactNode
}

export type BlockRenderer = ComponentType<BlockRenderProps>
