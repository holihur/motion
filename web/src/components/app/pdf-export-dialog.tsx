import { FileText } from "lucide-react"
import { tr } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

export type PdfExportOptions = {
  paper: "a4" | "letter"
  landscape: boolean
  cover: boolean
  contents: boolean
}

export const DEFAULT_PDF_OPTIONS: PdfExportOptions = {
  paper: "a4",
  landscape: false,
  cover: false,
  contents: false,
}

export function PdfExportDialog({
  open,
  onOpenChange,
  options,
  onOptionsChange,
  onExport,
  busy = false,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  options: PdfExportOptions
  onOptionsChange: (options: PdfExportOptions) => void
  onExport: () => void
  busy?: boolean
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="size-4 text-brand" /> {tr("PDF options")}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="pdf-paper">{tr("Page size")}</Label>
              <select
                id="pdf-paper"
                value={options.paper}
                onChange={(event) => onOptionsChange({ ...options, paper: event.target.value as PdfExportOptions["paper"] })}
                className="h-9 w-full rounded-lg border-0 bg-muted/50 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
              >
                <option value="a4">{tr("A4")}</option>
                <option value="letter">{tr("Letter")}</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pdf-orientation">{tr("Orientation")}</Label>
              <select
                id="pdf-orientation"
                value={options.landscape ? "landscape" : "portrait"}
                onChange={(event) => onOptionsChange({ ...options, landscape: event.target.value === "landscape" })}
                className="h-9 w-full rounded-lg border-0 bg-muted/50 px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
              >
                <option value="portrait">{tr("Portrait")}</option>
                <option value="landscape">{tr("Landscape")}</option>
              </select>
            </div>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/35 px-3.5 py-3 text-sm">
              <span>{tr("Cover page")}</span>
              <Switch aria-label={tr("Cover page")} checked={options.cover} onCheckedChange={(checked) => onOptionsChange({ ...options, cover: checked })} />
            </div>
            <div className="flex items-center justify-between gap-4 rounded-xl bg-muted/35 px-3.5 py-3 text-sm">
              <span>{tr("Table of contents")}</span>
              <Switch aria-label={tr("Table of contents")} checked={options.contents} onCheckedChange={(checked) => onOptionsChange({ ...options, contents: checked })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{tr("Cancel")}</Button>
          <Button type="button" onClick={onExport} disabled={busy}>
            {busy ? null : <FileText className="size-4" />} {tr("Export as PDF")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
