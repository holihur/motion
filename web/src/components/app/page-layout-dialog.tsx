import { useEffect, useState } from "react"
import { ExternalLink, LayoutTemplate, Loader2, Plus, Unlink } from "lucide-react"
import { useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { tr } from "@/lib/i18n"
import type { Block, Page, PageSummary } from "@/lib/types"
import { uid } from "@/lib/utils"
import { useWorkspaceStore } from "@/stores/workspace"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

function contentBlock(): Block {
  return { id: uid(), type: "content", text: "", checked: false }
}

export function PageLayoutDialog({ page, open, onOpenChange }: { page: PageSummary; open: boolean; onOpenChange: (open: boolean) => void }) {
  const navigate = useNavigate()
  const activeId = useWorkspaceStore((state) => state.activeId)
  const pages = useWorkspaceStore((state) => state.pages)
  const refreshPages = useWorkspaceStore((state) => state.refreshPages)
  const [full, setFull] = useState<Page | null>(null)
  const [selected, setSelected] = useState("")
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const layouts = pages.filter((item) => item.isLayout && !item.archived && item.id !== page.id)

  useEffect(() => {
    if (!open) return
    setLoading(true)
    setSelected(page.layoutId ?? "")
    void refreshPages()
    api.pages.get(page.id).then(setFull).catch((error) => toast.error(error instanceof Error ? error.message : tr("Could not load page"))).finally(() => setLoading(false))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, page.id, page.layoutId])

  async function apply() {
    if (saving) return
    setSaving(true)
    try {
      await api.pages.update(page.id, { layoutId: selected })
      useWorkspaceStore.getState().patchSummary(page.id, { layoutId: selected })
      window.dispatchEvent(new CustomEvent("motion:page-meta", { detail: { id: page.id, patch: { layoutId: selected } } }))
      onOpenChange(false)
      toast.success(selected ? tr("Layout applied") : tr("Layout detached"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not apply layout"))
    } finally { setSaving(false) }
  }

  async function toggleLayoutPage() {
    if (!full || saving) return
    setSaving(true)
    try {
      const enable = !full.isLayout
      await api.pages.update(page.id, { isLayout: enable, ...(enable ? { layoutId: "" } : {}) })
      if (enable && !full.blocks.some((block) => block.type === "content")) {
        await api.pages.saveBlocks(page.id, [...full.blocks, contentBlock()])
        toast.success(tr("Layout page enabled with a content placeholder at the end."))
      } else {
        toast.success(enable ? tr("This page is now a layout.") : tr("This page is no longer a layout."))
      }
      await refreshPages()
      setFull({ ...full, isLayout: enable, layoutId: enable ? "" : full.layoutId })
      window.dispatchEvent(new CustomEvent("motion:page-meta", { detail: { id: page.id, patch: { isLayout: enable } } }))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not update layout page"))
    } finally { setSaving(false) }
  }

  async function createLayoutPage() {
    if (!full || saving) return
    setSaving(true)
    try {
      const created = await api.pages.create({ workspaceId: full.workspaceId, title: tr("New layout") })
      await api.pages.update(created.id, { isLayout: true })
      await api.pages.saveBlocks(created.id, [contentBlock()])
      await refreshPages()
      navigate(`/page/${created.id}`)
      onOpenChange(false)
      toast.success(tr("Layout page created. Add the shared header above the placeholder."))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not create layout page"))
    } finally { setSaving(false) }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><LayoutTemplate className="size-4 text-brand" /> {tr("Page layout")}</DialogTitle>
          <DialogDescription>
            {tr("A layout is a normal page with a Content placeholder. Blocks before it become the header; blocks after it become the footer.")}
          </DialogDescription>
        </DialogHeader>

        {loading ? <div className="flex justify-center py-10"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div> : (
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-medium">{full?.isLayout ? tr("This page is a layout") : tr("Use this page as a layout")}</div>
                  <p className="mt-0.5 text-[11px] leading-5 text-muted-foreground">
                    {tr("Insert a Content placeholder to choose where each page's body appears.")}
                  </p>
                </div>
                <Button type="button" size="sm" variant={full?.isLayout ? "outline" : "default"} onClick={() => void toggleLayoutPage()} disabled={saving}>
                  {full?.isLayout ? tr("Stop using as layout") : tr("Use as layout")}
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground">{tr("Use a layout page")}</div>
              <button type="button" onClick={() => setSelected("")} className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs ${selected === "" ? "border-brand bg-brand-soft text-brand" : "hover:bg-accent"}`}>
                <Unlink className="size-3.5" /> {tr("No layout")}
              </button>
              {layouts.length === 0 ? (
                <div className="flex items-center justify-between gap-2 rounded-lg border border-dashed px-3 py-4">
                  <span className="text-xs text-muted-foreground">{tr("No layout pages yet.")}</span>
                  <Button type="button" size="sm" variant="outline" className="gap-1" onClick={() => void createLayoutPage()} disabled={saving}><Plus className="size-3" /> {tr("Create layout page")}</Button>
                </div>
              ) : layouts.map((layout) => (
                <button key={layout.id} type="button" onClick={() => setSelected(layout.id)} className={`flex w-full items-center gap-2 rounded-lg border px-3 py-2 text-left text-xs ${selected === layout.id ? "border-brand bg-brand-soft text-brand" : "hover:bg-accent"}`}>
                  <span className="text-base leading-none">{layout.icon || "📄"}</span>
                  <span className="min-w-0 flex-1 truncate">{layout.title.trim() || tr("Untitled")}</span>
                  <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{tr("Layout")}</span>
                </button>
              ))}
            </div>
            {selected && <button type="button" onClick={() => navigate(`/page/${selected}`)} className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground"><ExternalLink className="size-3" /> {tr("Open this layout page")}</button>}
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{tr("Cancel")}</Button>
          <Button type="button" onClick={() => void apply()} disabled={saving || loading}>{selected ? tr("Apply layout") : tr("Detach layout")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
