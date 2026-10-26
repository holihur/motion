import type { PageSummary, Workspace } from "./types"
import { tr } from "./i18n"

export interface TreeNode extends PageSummary {
  children: TreeNode[]
}

export function buildTree(pages: PageSummary[]): TreeNode[] {
  const nodes = new Map<string, TreeNode>()
  for (const page of pages) nodes.set(page.id, { ...page, children: [] })
  const roots: TreeNode[] = []
  for (const node of nodes.values()) {
    if (node.parentId && nodes.has(node.parentId)) {
      nodes.get(node.parentId)!.children.push(node)
    } else {
      roots.push(node)
    }
  }
  const sort = (items: TreeNode[]) => {
    items.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title))
    items.forEach((item) => sort(item.children))
  }
  sort(roots)
  return roots
}

export function ancestorChain(pages: PageSummary[], id: string): PageSummary[] {
  const byId = new Map(pages.map((p) => [p.id, p]))
  const chain: PageSummary[] = []
  let current = byId.get(id)
  const guard = new Set<string>()
  while (current && !guard.has(current.id)) {
    chain.unshift(current)
    guard.add(current.id)
    current = current.parentId ? byId.get(current.parentId) : undefined
  }
  return chain
}

export function allAncestorIds(pages: PageSummary[], id: string): string[] {
  return ancestorChain(pages, id)
    .map((page) => page.id)
    .filter((pageId) => pageId !== id)
}

export function roleInWorkspace(workspace: Workspace | undefined, userId: string | undefined) {
  if (!workspace || !userId) return ""
  if (workspace.ownerId === userId) return "owner"
  return workspace.members?.find((member) => member.userId === userId)?.role ?? ""
}

export function pageTitle(title: string) {
  return title.trim() || tr("Untitled")
}

export function countChildren(pages: PageSummary[], id: string) {
  return pages.filter((page) => page.parentId === id).length
}
