import { useEffect, useLayoutEffect, useRef, useState } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"
import type { Block } from "@/lib/types"

function estimatedHeight(block: Block): number {
  switch (block.type) {
    case "heading1":
      return 58
    case "heading2":
      return 50
    case "heading3":
      return 44
    case "code":
      return 160
    case "table":
      return 230
    case "diagram":
      return 280
    case "image":
      return block.url ? 320 : 120
    case "password":
      return 260
    case "bookmark":
    case "file":
      return 110
    case "video":
      return 300
    case "embed":
      return 420
    case "equation":
      return 150
    case "toc":
      return 180
    case "gantt":
      return 360
    case "chart":
      return 380
    case "toggleHeading1":
      return 58
    case "toggleHeading2":
      return 50
    case "toggleHeading3":
      return 44
    case "toggle":
      return 38
    case "pageLink":
      return 56
    case "breadcrumb":
      return 42
    case "columns":
      return 280
    case "qrcode":
      return 380
    case "barcode":
      return 220
    case "form":
      return 320
    case "divider":
      return 32
    case "callout":
    case "quote":
      return 54
    default:
      return 34
  }
}

export function VirtualBlockList({
  items,
  scrollParentRef,
  renderRow,
}: {
  items: { block: Block; index: number }[]
  scrollParentRef: React.RefObject<HTMLDivElement | null>
  renderRow: (block: Block, index: number) => React.ReactNode
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const [scrollMargin, setScrollMargin] = useState(0)

  useLayoutEffect(() => {
    const next = listRef.current?.offsetTop ?? 0
    setScrollMargin((current) => (current === next ? current : next))
  }, [items.length])

  const virtualizer = useVirtualizer({
    count: items.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: (index) => estimatedHeight(items[index].block),
    overscan: 10,
    scrollMargin,
    getItemKey: (index) => items[index].block.id,
  })

  useEffect(() => {
    function scrollTo(event: Event) {
      const detail = (event as CustomEvent<{ id?: string }>).detail
      if (!detail?.id) return
      const index = items.findIndex((item) => item.block.id === detail.id)
      if (index >= 0) virtualizer.scrollToIndex(index, { align: "auto" })
    }
    function focusTo(event: Event) {
      const detail = (event as CustomEvent<{ id?: string; replay?: boolean }>).detail
      if (!detail?.id || detail.replay) return
      const index = items.findIndex((item) => item.block.id === detail.id)
      if (index < 0) return
      virtualizer.scrollToIndex(index, { align: "auto" })
      window.setTimeout(() => {
        window.dispatchEvent(
          new CustomEvent("motion:focus-block", { detail: { ...detail, replay: true } }),
        )
      }, 90)
    }
    window.addEventListener("motion:scroll-block", scrollTo)
    window.addEventListener("motion:focus-block", focusTo)
    return () => {
      window.removeEventListener("motion:scroll-block", scrollTo)
      window.removeEventListener("motion:focus-block", focusTo)
    }
  }, [items, virtualizer])

  return (
    <div
      ref={listRef}
      style={{
        height: Math.max(0, virtualizer.getTotalSize() - scrollMargin),
        position: "relative",
      }}
    >
      {virtualizer.getVirtualItems().map((item) => {
        const entry = items[item.index]
        if (!entry) return null
        const { block, index } = entry
        return (
          <div
            key={block.id}
            data-index={item.index}
            ref={virtualizer.measureElement}
            className="absolute left-0 top-0 w-full"
            style={{ transform: `translateY(${item.start - scrollMargin}px)` }}
          >
            {renderRow(block, index)}
          </div>
        )
      })}
    </div>
  )
}
