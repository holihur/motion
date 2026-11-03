// Route-level code splitting: keep the editor import in one place so the app
// shell can warm it during idle time, before the user opens a page.
export const loadPageEditor = () => import("@/components/editor/page-editor")

export function preloadPageEditor() {
  void loadPageEditor().catch(() => {
    // A failed preload must not surface; the lazy route will retry it.
  })
}
