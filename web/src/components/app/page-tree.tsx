import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronRight, FileText, LockKeyhole, Plus, Star } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { buildTree, pageTitle, type TreeNode } from "@/lib/tree"
import { allAncestorIds } from "@/lib/tree"
import { tr } from "@/lib/i18n"
import type { PageSummary } from "@/lib/types"
import { useWorkspaceStore } from "@/stores/workspace"
import { PageActionsMenu } from "@/components/app/page-actions"
import { cn } from "@/lib/utils"

const EXPANDED_KEY = "motion.tree.expanded"

function readExpanded(): Set<string> | null {
  try {
    const raw = localStorage.getItem(EXPANDED_KEY)
    if (raw === null) return null
    const parsed = JSON.parse(raw) as unknown
    return Array.isArray(parsed)
      ? new Set(parsed.filter((item): item is string => typeof item === "string"))
      : null
  } catch {
    return null
  }
}

function includeAncestors(pages: PageSummary[], query: string): PageSummary[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return pages
  const byId = new Map(pages.map((page) => [page.id, page]))
  const keep = new Set(
    pages
      .filter((page) => pageTitle(page.title).toLowerCase().includes(needle))
      .map((page) => page.id),
  )
  for (const id of [...keep]) {
    let current = byId.get(id)
    let guard = 0
    while (current?.parentId && guard < 100) {
      keep.add(current.parentId)
      current = byId.get(current.parentId)
      guard += 1
    }
  }
  return pages.filter((page) => keep.has(page.id))
}

export function PageTree({
  pages,
  activeId,
  query = "",
  readOnly = false,
}: {
  pages: PageSummary[]
  activeId: string | null
  query?: string
  readOnly?: boolean
}) {
  const visiblePages = useMemo(() => includeAncestors(pages, query), [pages, query])
  const layoutPages = useMemo(() => visiblePages.filter((page) => page.isLayout), [visiblePages])
  const contentPages = useMemo(() => visiblePages.filter((page) => !page.isLayout), [visiblePages])
  const roots = useMemo(() => buildTree(contentPages), [contentPages])
  const [expanded, setExpanded] = useState<Set<string>>(() => readExpanded() ?? new Set())
  const initialized = useRef(false)
  const lastActiveRef = useRef<string | null>(null)
  const preSearchExpandedRef = useRef<Set<string> | null>(null)
  const navigate = useNavigate()
  const createPage = useWorkspaceStore((state) => state.createPage)
  const refreshPages = useWorkspaceStore((state) => state.refreshPages)
  const [draggedId, setDraggedId] = useState<string | null>(null)
  const [dropTarget, setDropTarget] = useState<{ id: string; position: "before" | "after" | "inside" } | null>(null)

  useEffect(() => {
    if (initialized.current || pages.length === 0) return
    initialized.current = true
    if (localStorage.getItem(EXPANDED_KEY) !== null) return
    setExpanded(
      new Set(pages.filter((page) => page.parentId).map((page) => page.parentId as string)),
    )
  }, [pages])

  useEffect(() => {
    try {
      localStorage.setItem(EXPANDED_KEY, JSON.stringify([...expanded]))
    } catch {
      // Ignore storage quota errors; expansion is a convenience.
    }
  }, [expanded])

  useEffect(() => {
    if (query.trim()) {
      if (!preSearchExpandedRef.current) preSearchExpandedRef.current = new Set(expanded)
      setExpanded(new Set(visiblePages.filter((page) => page.parentId).map((page) => page.parentId as string)))
      return
    }
    if (preSearchExpandedRef.current) {
      setExpanded(preSearchExpandedRef.current)
      preSearchExpandedRef.current = null
    }
    // Only react to a new search term. Re-running this on every page refresh
    // would undo manual collapses while the user is editing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query])

  useEffect(() => {
    function collapseAll() {
      setExpanded(new Set())
    }
    window.addEventListener("motion:collapse-all", collapseAll)
    return () => window.removeEventListener("motion:collapse-all", collapseAll)
  }, [])

  useEffect(() => {
    if (!activeId || lastActiveRef.current === activeId) return
    const chain = allAncestorIds(pages, activeId)
    if (chain.length === 0) return
    lastActiveRef.current = activeId
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

  function descendantIDs(id: string) {
    const ids = new Set<string>()
    const walk = (parent: string) => {
      for (const page of pages) {
        if (page.parentId === parent && !ids.has(page.id)) {
          ids.add(page.id)
          walk(page.id)
        }
      }
    }
    walk(id)
    return ids
  }

  async function movePage(dragId: string, targetId: string, position: "before" | "after" | "inside") {
    if (readOnly || dragId === targetId) return
    const dragged = pages.find((page) => page.id === dragId)
    const target = pages.find((page) => page.id === targetId)
    if (!dragged || !target) return
    if (descendantIDs(dragId).has(targetId)) return
    const parentId = position === "inside" ? target.id : (target.parentId ?? null)
    const siblings = pages
      .filter((page) => (page.parentId ?? null) === parentId && page.id !== dragId)
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
    let order = 1024
    if (position === "inside") {
      order = (siblings.at(-1)?.order ?? 0) + 1024
    } else {
      const targetIndex = siblings.findIndex((page) => page.id === targetId)
      const insert = position === "before" ? targetIndex : targetIndex + 1
      const before = siblings[insert - 1]
      const after = siblings[insert]
      order = before && after ? (before.order + after.order) / 2 : before ? before.order + 1024 : after ? after.order - 1024 : 1024
    }
    try {
      await api.pages.move(dragId, { parentId, order })
      if (parentId) setExpanded((current) => new Set(current).add(parentId))
      await refreshPages()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not move page"))
    } finally {
      setDraggedId(null)
      setDropTarget(null)
    }
  }

  async function createFirstPage() {
    try {
      const page = await createPage(null)
      navigate(`/page/${page.id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not create page"))
    }
  }

  if (roots.length === 0 && layoutPages.length === 0) {
    if (query.trim()) {
      return <div className="px-3 py-3 text-xs text-muted-foreground">{tr("No pages match “{query}”.", { query })}</div>
    }
    return (
      <div className="px-2 py-4">
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed bg-muted/20 px-3 py-6 text-center">
          <div className="flex size-10 items-center justify-center rounded-xl bg-brand-soft text-brand">
            <FileText className="size-5" />
          </div>
          <div>
            <div className="text-sm font-medium">{tr("No pages yet")}</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">{tr("Your workspace is ready. Let’s put the first thought on the page.")}</div>
          </div>
          <button
            type="button"
            onClick={() => void createFirstPage()}
            className="mt-1 flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
          >
            <Plus className="size-3.5" />
            {tr("Create your first page")}
          </button>
        </div>
        <div className="mt-4 space-y-1.5">
          <div className="px-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">{tr("Start from a template")}</div>
          {[ 
            { id: "meeting", icon: "🗓️", title: tr("Meeting notes") },
            { id: "project", icon: "🚀", title: tr("Project brief") },
            { id: "weekly", icon: "🧭", title: tr("Weekly review") },
          ].map((tpl) => (
            <button
              key={tpl.id}
              type="button"
              onClick={async () => {
                try {
                  const mod = await import("@/lib/templates")
                  const template = mod.PAGE_TEMPLATES.find((t) => t.id === tpl.id)
                  if (!template) return
                  const page = await createPage(null)
                  const blocks = mod.templateBlocks(template)
                  await api.pages.update(page.id, { title: template.title })
                  await api.pages.saveBlocks(page.id, blocks)
                  await refreshPages()
                  navigate(`/page/${page.id}`)
                } catch (e) {
                  toast.error(e instanceof Error ? e.message : tr("Could not create page from template"))
                }
              }}
              className="flex w-full items-center gap-2 rounded-lg border bg-card px-2.5 py-2 text-left transition hover:border-brand/30 hover:bg-accent/40"
            >
              <span className="text-sm">{tpl.icon}</span>
              <span className="text-xs font-medium">{tpl.title}</span>
              <Plus className="ml-auto size-3 text-muted-foreground" />
            </button>
          ))}
        </div>
        <div className="mt-4 rounded-lg bg-brand-soft/30 px-2.5 py-2 text-[11px] leading-5 text-muted-foreground">
          <div className="font-medium text-foreground">{tr("A 60-second tour")}</div>
          <div>1. {tr("Type / to insert any block")}</div>
          <div>2. {tr("Select text to leave a comment")}</div>
          <div>3. {tr("Ask Motion AI to summarize or edit")}</div>
        </div>
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
          readOnly={readOnly}
          draggedId={draggedId}
          dropTarget={dropTarget}
          onDragStart={setDraggedId}
          onDragOver={(id, position) => setDropTarget({ id, position })}
          onDragLeave={(id) => setDropTarget((current) => current?.id === id ? null : current)}
          onDrop={(id, position) => void movePage(draggedId ?? "", id, position)}
          onDragEnd={() => { setDraggedId(null); setDropTarget(null) }}
        />
      ))}
      {layoutPages.length > 0 && (
        <div className="pt-3">
          <div className="px-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            {tr("Layouts")}
          </div>
          {layoutPages.map((page) => (
            <TreeItem
              key={page.id}
              node={{ ...page, children: [] }}
              depth={0}
              expanded={expanded}
              toggle={toggle}
              activeId={activeId}
              readOnly={readOnly}
              draggedId={draggedId}
              dropTarget={dropTarget}
              onDragStart={setDraggedId}
              onDragOver={(id, position) => setDropTarget({ id, position })}
              onDragLeave={(id) => setDropTarget((current) => current?.id === id ? null : current)}
              onDrop={(id, position) => void movePage(draggedId ?? "", id, position)}
              onDragEnd={() => { setDraggedId(null); setDropTarget(null) }}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function TreeItem({
  node,
  depth,
  expanded,
  toggle,
  activeId,
  readOnly,
  draggedId,
  dropTarget,
  onDragStart,
  onDragOver,
  onDragLeave,
  onDrop,
  onDragEnd,
}: {
  node: TreeNode
  depth: number
  expanded: Set<string>
  toggle: (id: string) => void
  activeId: string | null
  readOnly?: boolean
  draggedId: string | null
  dropTarget: { id: string; position: "before" | "after" | "inside" } | null
  onDragStart: (id: string) => void
  onDragOver: (id: string, position: "before" | "after" | "inside") => void
  onDragLeave: (id: string) => void
  onDrop: (id: string, position: "before" | "after" | "inside") => void
  onDragEnd: () => void
}) {
  const navigate = useNavigate()
  const pages = useWorkspaceStore((st) => st.pages)
  const refreshPages = useWorkspaceStore((st) => st.refreshPages)
  const isActive = activeId === node.id
  const hasChildren = node.children.length > 0

  async function moveVertical(dir: -1 | 1) {
    if (readOnly) return
    const siblings = pages
      .filter((p) => (p.parentId ?? null) === (node.parentId ?? null))
      .sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
    const idx = siblings.findIndex((p) => p.id === node.id)
    const target = siblings[idx + dir]
    if (!target) return
    const without = siblings.filter((p) => p.id !== node.id)
    const targetIdx = without.findIndex((p) => p.id === target.id)
    const insert = dir === -1 ? targetIdx : targetIdx + 1
    const before = without[insert - 1]
    const after = without[insert]
    const order = before && after ? (before.order + after.order) / 2 : before ? before.order + 1024 : after ? after.order - 1024 : 1024
    try {
      await api.pages.move(node.id, { parentId: node.parentId ?? null, order })
      await refreshPages()
    } catch {
      toast.error(tr("Could not move page"))
    }
  }
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
        style={{ paddingLeft: 4 + depth * 13 }}
        draggable={!readOnly}
        onDragStart={(event) => {
          event.dataTransfer.effectAllowed = "move"
          event.dataTransfer.setData("text/plain", node.id)
          onDragStart(node.id)
        }}
        onDragEnd={onDragEnd}
        onDragOver={(event) => {
          if (readOnly) return
          event.preventDefault()
          event.dataTransfer.dropEffect = "move"
          const rect = event.currentTarget.getBoundingClientRect()
          const ratio = (event.clientY - rect.top) / rect.height
          onDragOver(node.id, ratio < 0.28 ? "before" : ratio > 0.72 ? "after" : "inside")
        }}
        onDragLeave={() => onDragLeave(node.id)}
        onDrop={(event) => {
          if (readOnly) return
          event.preventDefault()
          event.stopPropagation()
          const rect = event.currentTarget.getBoundingClientRect()
          const ratio = (event.clientY - rect.top) / rect.height
          onDrop(node.id, ratio < 0.28 ? "before" : ratio > 0.72 ? "after" : "inside")
        }}
        className={cn(
          "group/tree relative flex h-[29px] items-center rounded-md pr-1 text-[13px] transition-colors",
          isActive
            ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
            : "text-sidebar-foreground hover:bg-sidebar-accent/65",
          draggedId === node.id && "opacity-40",
          dropTarget?.id === node.id && dropTarget.position === "inside" && "bg-brand-soft/60 ring-1 ring-inset ring-brand/30",
          dropTarget?.id === node.id && dropTarget.position === "before" && "before:absolute before:inset-x-1 before:top-0 before:h-0.5 before:bg-brand",
          dropTarget?.id === node.id && dropTarget.position === "after" && "after:absolute after:inset-x-1 after:bottom-0 after:h-0.5 after:bg-brand",
        )}
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
          draggable={!readOnly}
          onClick={() => navigate(`/page/${node.id}`)}
          onDragStart={(event) => {
            event.dataTransfer.effectAllowed = "move"
            event.dataTransfer.setData("text/plain", node.id)
            onDragStart(node.id)
          }}
          onDragEnd={onDragEnd}
          className="flex min-w-0 flex-1 items-center gap-1.5 rounded py-0.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring/40"
        >
          {node.icon ? (
            <span className="w-4 shrink-0 text-center text-[14px] leading-none">{node.icon}</span>
          ) : (
            <FileText className="size-3.5 shrink-0 text-muted-foreground" />
          )}
          <span className="truncate" title={pageTitle(node.title)}>{pageTitle(node.title)}</span>
          {node.isLayout && <span className="shrink-0 rounded bg-brand-soft px-1 text-[8px] font-semibold uppercase tracking-wider text-brand">{tr("Layout")}</span>}
          {node.locked && <LockKeyhole className="size-3 shrink-0 text-muted-foreground" />}
          {node.favorite && <Star className="size-3 shrink-0 fill-amber-400 text-amber-400" />}
        </button>

        <div
          className={cn(
            "flex shrink-0 items-center opacity-0 transition-opacity group-hover/tree:opacity-100 has-[[data-state=open]]:opacity-100 focus-within:opacity-100 max-md:opacity-100",
          )}
        >
          <PageActionsMenu
            page={node}
            readOnly={readOnly}
            onMoveUp={() => void moveVertical(-1)}
            onMoveDown={() => void moveVertical(1)}
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
              readOnly={readOnly}
              draggedId={draggedId}
              dropTarget={dropTarget}
              onDragStart={onDragStart}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onDragEnd={onDragEnd}
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
