import { Check } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { tr } from "@/lib/i18n"
import { PAGE_THEMES } from "@/lib/page-theme"
import type { PageSummary } from "@/lib/types"
import { useWorkspaceStore } from "@/stores/workspace"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"

export function PageThemeDialog({ page, open, onOpenChange }: { page: PageSummary; open: boolean; onOpenChange: (open: boolean) => void }) {
  async function choose(value: string) {
    try {
      await api.pages.update(page.id, { theme: value === "default" ? "" : value })
      useWorkspaceStore.getState().patchSummary(page.id, { theme: value === "default" ? "" : value })
      window.dispatchEvent(new CustomEvent("motion:page-meta", { detail: { id: page.id, patch: { theme: value === "default" ? "" : value } } }))
      onOpenChange(false)
      toast.success(tr("Page color updated"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not update page color"))
    }
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{tr("Page color")}</DialogTitle>
          <DialogDescription>{tr("Choose an accent color for this page. It applies to links, buttons and highlights.")}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
          {PAGE_THEMES.map((theme) => {
            const selected = (page.theme || "default") === theme.value
            return (
              <button key={theme.value} type="button" onClick={() => void choose(theme.value)} aria-pressed={selected} className="flex flex-col items-center gap-1.5 rounded-lg border p-2 text-[10px] transition hover:bg-accent">
                <span className="relative flex size-7 items-center justify-center rounded-full text-white" style={{ backgroundColor: theme.brand }}>
                  {selected && <Check className="size-4" strokeWidth={3} />}
                </span>
                <span className="text-muted-foreground">{tr(theme.label)}</span>
              </button>
            )
          })}
        </div>
        <DialogFooter><Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{tr("Cancel")}</Button></DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
