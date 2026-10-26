import type { Block } from "@/lib/types"

export interface BlockSync {
  baseRev: number
  order: string[]
  upserts: Block[]
  deletes: string[]
}

export function diffBlocks(base: Block[], next: Block[]): Omit<BlockSync, "baseRev"> {
  const baseById = new Map(base.map((block) => [block.id, block]))
  const nextIds = new Set(next.map((block) => block.id))
  const upserts: Block[] = []
  for (const block of next) {
    const before = baseById.get(block.id)
    if (!before || JSON.stringify(before) !== JSON.stringify(block)) upserts.push(block)
  }
  const deletes = base.filter((block) => !nextIds.has(block.id)).map((block) => block.id)
  return { order: next.map((block) => block.id), upserts, deletes }
}

export function applyBlockSync(
  blocks: Block[],
  order: string[],
  upserts: Block[],
  deletes: string[],
): Block[] {
  const byId = new Map(blocks.map((block) => [block.id, block]))
  for (const id of deletes) byId.delete(id)
  for (const block of upserts) byId.set(block.id, block)
  const next: Block[] = []
  const used = new Set<string>()
  for (const id of order) {
    const block = byId.get(id)
    if (block && !used.has(id)) {
      next.push(block)
      used.add(id)
    }
  }
  // Preserve blocks that arrived from another source but are not in this order yet.
  for (const block of blocks) {
    if (!used.has(block.id) && byId.has(block.id)) {
      next.push(byId.get(block.id)!)
      used.add(block.id)
    }
  }
  for (const block of upserts) {
    if (!used.has(block.id)) {
      next.push(block)
      used.add(block.id)
    }
  }
  return next
}

export function sameBlockContent(a: Block[], b: Block[]) {
  return JSON.stringify(a) === JSON.stringify(b)
}
