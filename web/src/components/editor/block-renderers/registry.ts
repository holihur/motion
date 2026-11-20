import type { BlockRenderer } from "./types"

const renderers = new Map<string, BlockRenderer>()

/**
 * Registers a renderer for a block type. Built-in blocks register themselves
 * from `block-renderers/index.ts`; plugins or experiments can call this to add
 * or replace a type without editing `BlockRow`.
 */
export function registerBlockRenderer(type: string, renderer: BlockRenderer) {
  renderers.set(type, renderer)
}

/**
 * Returns the renderer for a type, falling back to the paragraph renderer so
 * unknown or newly persisted types still render their text content.
 */
export function getBlockRenderer(type: string): BlockRenderer {
  const renderer = renderers.get(type) ?? renderers.get("paragraph")
  if (!renderer) {
    throw new Error(`No block renderer registered for "${type}"`)
  }
  return renderer
}

export function registeredBlockTypes(): string[] {
  return [...renderers.keys()]
}
