import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronRight, FileText, Plus, Star } from "lucide-react"
import { toast } from "sonner"
import { buildTree, pageTitle, type TreeNode } from "@/lib/tree"
import { allAncestorIds } from "@/lib/tree"
import { tr } from "@/lib/i18n"
import type { PageSummary } from "@/lib/types"
import { useWorkspaceStore } from "@/stores/workspace"
import { PageActionsMenu } from "@/components/app/page-actions"
import { cn } from "@/lib/utils"

export function PageTree({ pages, activeId }: { pages: PageSummary[]; activeId: string | null }) {
  const roots = useMemo(() => buildTree(pages), [pages])
  const [expanded, setExpanded] = useState<Set<string>>(new Set())
  const initialized = useRef(false)
  const navigate = useNavigate()
  const createPage = useWorkspaceStore((state) => state.createPage)

  useEffect(() => {
    if (initialized.current || pages.length === 0) return
    initialized.current = true
    setExpanded(
      new Set(pages.filter((page) => page.parentId).map((page) => page.parentId as string)),
    )
  }, [pages])

  useEffect(() => {
    if (!activeId) return
    const chain = allAncestorIds(pages, activeId)
    if (chain.length === 0) return
    setExpanded((previous) => {
      const next = new Set(previous)
      chain.forEach((id) => next.add(id))
      return next
    })
  }, [activeId, pages])

  useEffect(() => {
    function onExpand(event: Event) {
      const id = (event as CustomEvent<{ id: string }>).detail?.id
      if (!id) return
      setExpanded((previous) => new Set(previous).add(id))
    }
    window.addEventListener("motion:expand-page", onExpand)
    return () => window.removeEventListener("motion:expand-page", onExpand)
  }, [])

  function toggle(id: string) {
    setExpanded((previous) => {
      const next = new Set(previous)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function createFirstPage() {
    try {
      const page = await createPage(null)
      navigate(`/page/${page.id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not create page"))
    }
  }

  if (roots.length === 0) {
    return (
      <div className="px-2 py-2">
        <button
          type="button"
          onClick={() => void createFirstPage()}
          className="flex w-full items-center gap-2 rounded-lg border border-dashed border-sidebar-border/90 px-2.5 py-2 text-left text-[13px] text-muted-foreground transition hover:border-brand/40 hover:bg-sidebar-accent/50 hover:text-foreground"
        >
          <Plus className="size-3.5" />
          {tr("Create your first page")}
        </button>
      </div>
    )
  }

  return (
    <div className="space-y-px">
      {roots.map((node) => (
        <TreeItem
          key={node.id}
          node={node}
          depth={0}
          expanded={expanded}
          toggle={toggle}
          activeId={activeId}
        />
      ))}
    </div>
  )
}

function TreeItem({
  node,
  depth,
  expanded,
  toggle,
  activeId,
}: {
  node: TreeNode
  depth: number
  expanded: Set<string>
  toggle: (id: string) => void
  activeId: string | null
}) {
  const navigate = useNavigate()
  const isActive = activeId === node.id
  const hasChildren = node.children.length > 0
  const isOpen = expanded.has(node.id)
  const rowRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isActive) rowRef.current?.scrollIntoView({ block: "nearest" })
  }, [isActive])

  return (
    <>
      <div
        ref={rowRef}
        data-page-id={node.id}
        className={cn(
          "group/tree relative flex h-[29px] items-center rounded-md pr-1 text-[13px] transition-colors",
          isActive
            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-accent/65",
        )}
        style={{ paddingLeft: 4 + depth * 13 }}
      >
        <button
          type="button"
          tabIndex={-1}
          aria-label={isOpen ? tr("Collapse") : tr("Expand")}
          onClick={(event) => {
            event.stopPropagation()
            if (hasChildren) toggle(node.id)
          }}
          className={cn(
            "flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/80 transition hover:bg-sidebar-border/70",
            !hasChildren && "pointer-events-none opacity-0",
          )}
        >
          <ChevronRight className={cn("size-3.5 transition-transform", isOpen && "rotate-90")} />
        </button>

        <button
          type="button"
          onClick={() => navigate(`/page/${node.id}`)}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded py-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
        >
          {node.icon ? (
            <span className="w-4 shrink-0 text-center text-[14px] leading-none">{node.icon}</span>
          ) : (
            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate">{pageTitle(node.title)}</span>
          {node.favorite && <Star className="size-3 shrink-0 fill-amber-400 text-amber-400" />}
        </button>

        <div
          className={cn(
            "flex shrink-0 items-center opacity-0 transition-opacity group-hover/tree:opacity-100 has-[[data-state=open]]:opacity-100 focus-within:opacity-100",
          )}
        >
          <PageActionsMenu
            page={node}
            align="start"
            trigger={
              <button
                type="button"
                aria-label={tr("Page options")}
                className="flex size-6 items-center justify-center rounded-md text-muted-foreground transition hover:bg-sidebar-border/70 hover:text-foreground data-[state=open]:bg-sidebar-border/70"
              >
                <MoreHorizontalIcon />
              </button>
            }
          />
        </div>
      </div>

      {hasChildren && isOpen && (
        <div>
          {node.children.map((child) => (
            <TreeItem
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              toggle={toggle}
              activeId={activeId}
            />
          ))}
        </div>
      )}
    </>
  )
}

function MoreHorizontalIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </svg>
  )
}
