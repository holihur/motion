import { Suspense, lazy } from "react"
import type { BlockRenderProps } from "@/components/editor/block-renderers/types"
import { BookmarkBlock, EmbedBlock, FileBlock, TocBlock, VideoBlock } from "@/components/editor/rich-blocks"
import { BreadcrumbBlock, ColumnsBlock, PageLinkBlock } from "@/components/editor/link-blocks"
import { CurlBlock } from "@/components/editor/curl-block"
import { FormBlock } from "@/components/editor/form-block"
import { ImageBlock } from "@/components/editor/image-block"
import { RadioGroupBlock } from "@/components/editor/input-blocks"
import { JsonVisualBlock } from "@/components/editor/json-visual-block"
import { MapBlock } from "@/components/editor/map-block"
import { PasswordBlock } from "@/components/editor/password-block"
import { PollBlock } from "@/components/editor/poll-block"

const CodeBlock = lazy(() => import("@/components/editor/code-block").then((module) => ({ default: module.CodeBlock })))
const EquationBlock = lazy(() => import("@/components/editor/equation-block").then((module) => ({ default: module.EquationBlock })))
const QRCodeBlock = lazy(() => import("@/components/editor/code-image-blocks").then((module) => ({ default: module.QRCodeBlock })))
const BarcodeBlock = lazy(() => import("@/components/editor/code-image-blocks").then((module) => ({ default: module.BarcodeBlock })))
const LayoutBlock = lazy(() => import("@/components/editor/layout-block").then((module) => ({ default: module.LayoutBlock })))

function LazyBlockFallback() {
  return <div className="my-2 h-20 animate-pulse rounded-lg border border-border/60 bg-muted/20" />
}

export function CodeBlockRenderer({
  block,
  index,
  placeholder,
  readOnly,
  autoFocus,
  onInput,
  onKeyDown,
  onFocusBlock,
  onUpdate,
}: BlockRenderProps) {
  return (
    <Suspense fallback={<LazyBlockFallback />}>
      <CodeBlock
        block={block}
        index={index}
        readOnly={readOnly}
        placeholder={placeholder}
        autoFocus={autoFocus}
        onInput={(text, el) => onInput(text, el)}
        onKeyDown={(event, rowIndex) => onKeyDown(event, rowIndex)}
        onFocus={() => onFocusBlock?.(block.id)}
        onUpdate={onUpdate}
      />
    </Suspense>
  )
}

export function CurlBlockRenderer({ block, readOnly, autoFocus, onUpdate }: BlockRenderProps) {
  return <CurlBlock block={block} readOnly={readOnly} autoFocus={autoFocus} onUpdate={onUpdate} />
}

export function EquationBlockRenderer({ block, readOnly, autoFocus, onUpdate }: BlockRenderProps) {
  return <Suspense fallback={<LazyBlockFallback />}><EquationBlock block={block} readOnly={readOnly} autoFocus={autoFocus} onUpdate={onUpdate} /></Suspense>
}

export function PasswordBlockRenderer({ block, readOnly, autoFocus, onUpdate, onFocusBlock }: BlockRenderProps) {
  return (
    <PasswordBlock
      block={block}
      readOnly={readOnly}
      autoFocus={autoFocus}
      onUpdate={onUpdate}
      onFocus={() => onFocusBlock?.(block.id)}
    />
  )
}

export function BookmarkBlockRenderer({ block, readOnly, autoFocus, onUpdate }: BlockRenderProps) {
  return <BookmarkBlock block={block} readOnly={readOnly} autoFocus={autoFocus} onUpdate={onUpdate} />
}

export function VideoBlockRenderer({ block, readOnly, autoFocus, onUpdate }: BlockRenderProps) {
  return <VideoBlock block={block} readOnly={readOnly} autoFocus={autoFocus} onUpdate={onUpdate} />
}

export function EmbedBlockRenderer({ block, readOnly, autoFocus, onUpdate }: BlockRenderProps) {
  return <EmbedBlock block={block} readOnly={readOnly} autoFocus={autoFocus} onUpdate={onUpdate} />
}

export function FileBlockRenderer({ block, readOnly, autoFocus, workspaceId, onUpdate }: BlockRenderProps) {
  return <FileBlock block={block} readOnly={readOnly} autoFocus={autoFocus} workspaceId={workspaceId} onUpdate={onUpdate} />
}

export function TocBlockRenderer({ block, headings, readOnly, onUpdate }: BlockRenderProps) {
  return <TocBlock block={block} headings={headings} readOnly={readOnly} onUpdate={readOnly ? undefined : onUpdate} />
}

export function JsonVisualBlockRenderer({ block, readOnly, onUpdate }: BlockRenderProps) {
  return <JsonVisualBlock block={block} readOnly={readOnly} onUpdate={onUpdate} />
}

export function PageLinkBlockRenderer({ block, readOnly, onUpdate }: BlockRenderProps) {
  return <PageLinkBlock block={block} readOnly={readOnly} onUpdate={onUpdate} />
}

export function BreadcrumbBlockRenderer({ block, breadcrumb, readOnly, onUpdate }: BlockRenderProps) {
  return <BreadcrumbBlock block={block} breadcrumb={breadcrumb} onUpdate={readOnly ? undefined : onUpdate} />
}

export function ColumnsBlockRenderer({ block, readOnly, onUpdate }: BlockRenderProps) {
  return <ColumnsBlock block={block} readOnly={readOnly} onUpdate={onUpdate} />
}

export function LayoutBlockRenderer({ block, readOnly, pageId, workspaceId, members, onFocusBlock, onUpdate }: BlockRenderProps) {
  return (
    <Suspense fallback={<LazyBlockFallback />}>
      <LayoutBlock
        block={block}
        readOnly={readOnly}
        onUpdate={onUpdate}
        pageId={pageId}
        workspaceId={workspaceId}
        members={members}
        onFocusBlock={onFocusBlock}
      />
    </Suspense>
  )
}

export function QRCodeBlockRenderer({ block, readOnly, autoFocus }: BlockRenderProps) {
  return <Suspense fallback={<LazyBlockFallback />}><QRCodeBlock block={block} readOnly={readOnly} autoFocus={autoFocus} /></Suspense>
}

export function BarcodeBlockRenderer({ block, readOnly, autoFocus, onUpdate }: BlockRenderProps) {
  return <Suspense fallback={<LazyBlockFallback />}><BarcodeBlock block={block} readOnly={readOnly} autoFocus={autoFocus} onUpdate={onUpdate} /></Suspense>
}

export function RadioGroupBlockRenderer({ block, readOnly, onUpdate }: BlockRenderProps) {
  return <RadioGroupBlock block={block} readOnly={readOnly} onUpdate={onUpdate} />
}

export function FormBlockRenderer({ block, pageId, readOnly, autoFocus, onUpdate }: BlockRenderProps) {
  return <FormBlock block={block} pageId={pageId} readOnly={readOnly} autoFocus={autoFocus} onUpdate={onUpdate} />
}

export function PollBlockRenderer({ block, pageId, readOnly, allowVote, autoFocus, onUpdate }: BlockRenderProps) {
  return <PollBlock block={block} pageId={pageId} readOnly={readOnly} allowVote={allowVote} autoFocus={autoFocus} onUpdate={onUpdate} />
}

export function MapBlockRenderer({ block, readOnly, index, onKeyDown, onFocusBlock, onUpdate }: BlockRenderProps) {
  return <MapBlock block={block} readOnly={readOnly} onUpdate={onUpdate} onKeyDown={(event) => onKeyDown(event, index)} onFocus={() => onFocusBlock?.(block.id)} />
}

export function ImageBlockRenderer({
  block,
  pageId,
  readOnly,
  workspaceId,
  autoFocus,
  comments,
  index,
  onKeyDown,
  onFocusBlock,
  onUpdate,
  onOpenComments,
  onCommentsChanged,
}: BlockRenderProps) {
  return (
    <ImageBlock
      block={block}
      pageId={pageId}
      readOnly={readOnly}
      workspaceId={workspaceId}
      autoFocus={autoFocus}
      comments={comments}
      onUpdate={onUpdate}
      onKeyDown={(event) => onKeyDown(event, index)}
      onFocus={() => onFocusBlock?.(block.id)}
      onOpenComments={onOpenComments}
      onCommentsChanged={onCommentsChanged}
    />
  )
}
