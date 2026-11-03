import type { Page } from "@/lib/types"

// A page returned by POST /pages already contains everything the editor needs.
// Handing it straight to the editor avoids a second round-trip on the critical
// path of "New page" while keeping the cache ephemeral.
const cache = new Map<string, Page>()

export function cacheCreatedPage(page: Page) {
  cache.set(page.id, page)
  if (cache.size > 10) {
    const oldest = cache.keys().next().value
    if (oldest) cache.delete(oldest)
  }
}

export function takeCreatedPage(id: string): Page | undefined {
  const page = cache.get(id)
  cache.delete(id)
  return page
}
