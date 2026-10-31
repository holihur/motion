import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { tr } from "@/lib/i18n"
import { modKey } from "@/lib/utils"

const GROUPS: { title: string; items: [string, string][] }[] = [
  {
    title: tr("Global"),
    items: [
      [`${modKey()} K`, tr("Search")],
      [`${modKey()} J`, tr("Go home")],
      [`${modKey()} ,`, tr("Settings")],
      ["?", tr("Open this sheet")],
      ["Esc", tr("Close dialogs / sidebar")],
    ],
  },
  {
    title: tr("Editor"),
    items: [
      ["/", tr("Insert block")],
      ["# / ## / ### + 空格", tr("Headings 1 / 2 / 3")],
      ["- / * + 空格", tr("Bulleted list")],
      ["1. + 空格", tr("Numbered list")],
      ["[] + 空格", tr("Todo")],
      ["> + 空格", tr("Quote")],
      ["``` + 空格", tr("Code block")],
      [`${modKey()} + Enter`, tr("Send comment / AI")],
    ],
  },
]

export function ShortcutsDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{tr("Keyboard shortcuts")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          {GROUPS.map((g) => (
            <div key={g.title}>
              <div className="mb-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{g.title}</div>
              <div className="space-y-1">
                {g.items.map(([key, desc]) => (
                  <div key={key} className="flex items-center justify-between gap-3 text-xs">
                    <span className="text-muted-foreground">{desc}</span>
                    <kbd className="shrink-0 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">{key}</kbd>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
