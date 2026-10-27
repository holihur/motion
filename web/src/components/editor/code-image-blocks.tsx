import { useEffect, useRef, useState } from "react"
import QRCode from "qrcode"
import JsBarcode from "jsbarcode"
import { Barcode, QrCode, ImageDown } from "lucide-react"
import type { Block } from "@/lib/types"
import { tr } from "@/lib/i18n"

const QR_SIZES = [["200", "Small"], ["280", "Medium"], ["360", "Large"]] as const
const BARCODE_FORMATS = ["CODE128", "EAN13", "EAN8", "UPC", "CODE39", "ITF14", "MSI", "pharmacode"]

export function QRCodeBlock({
  block, readOnly, autoFocus, onUpdate,
}: {
  block: Block; readOnly: boolean; autoFocus?: boolean; onUpdate: (patch: Partial<Block>) => void
}) {
  const [dataURL, setDataURL] = useState("")
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const size = Number(block.language) || 280
  const value = block.text

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    let alive = true
    if (!value) {
      setDataURL("")
      setError("")
      return
    }
    QRCode.toDataURL(value, {
      width: size, margin: 2, errorCorrectionLevel: "M",
      color: { dark: "#0f172a", light: "#ffffff" },
    }).then((url) => {
      if (alive) { setDataURL(url); setError("") }
    }).catch((err) => {
      if (alive) setError(err instanceof Error ? err.message : "Could not generate QR code")
    })
    return () => { alive = false }
  }, [value, size])

  return (
    <div id={`block-input-${block.id}`} data-block-input tabIndex={0} className="my-2 overflow-hidden rounded-xl border border-border/80 bg-card">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <QrCode className="size-3.5 text-brand" />
        <span className="flex-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{tr("QR code")}</span>
        {!readOnly && (
          <select value={String(size)} onChange={(event) => onUpdate({ language: event.target.value })} aria-label={tr("QR size")} className="h-6 rounded border bg-background px-1 text-[10px] outline-none">
            {QR_SIZES.map(([value, label]) => <option key={value} value={value}>{tr(label)}</option>)}
          </select>
        )}
      </div>
      <div className="space-y-3 p-3">
        {!readOnly && (
          <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
            <input ref={inputRef} value={value} onChange={(event) => onUpdate({ text: event.target.value })} placeholder={tr("URL or text to encode…")} className="h-8 rounded-md border bg-background px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/25" />
            <input value={block.caption ?? ""} onChange={(event) => onUpdate({ caption: event.target.value })} placeholder={tr("Caption (optional)")} className="h-8 rounded-md border bg-background px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/25" />
          </div>
        )}
        {!value && <div className="rounded-lg border border-dashed px-4 py-8 text-center text-xs text-muted-foreground">{tr("Enter text or a URL to generate a QR code.")}</div>}
        {value && dataURL && (
          <div className="flex flex-col items-center gap-2">
            <img src={dataURL} width={size} height={size} alt={block.caption || "QR code"} className="max-w-full rounded-lg bg-white" />
            {block.caption && <div className="text-center text-[11px] text-muted-foreground">{block.caption}</div>}
            <button type="button" onClick={() => {
              const link = document.createElement("a")
              link.href = dataURL
              link.download = "qr-code.png"
              link.click()
            }} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground">
              <ImageDown className="size-3" /> {tr("Download PNG")}
            </button>
          </div>
        )}
        {error && <p className="text-[11px] text-destructive">{error}</p>}
      </div>
    </div>
  )
}

export function BarcodeBlock({
  block, readOnly, autoFocus, onUpdate,
}: {
  block: Block; readOnly: boolean; autoFocus?: boolean; onUpdate: (patch: Partial<Block>) => void
}) {
  const svgRef = useRef<SVGSVGElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const [error, setError] = useState("")
  const format = block.language || "CODE128"
  const value = block.text

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    if (!svgRef.current) return
    if (!value) {
      svgRef.current.innerHTML = ""
      setError("")
      return
    }
    try {
      JsBarcode(svgRef.current, value, {
        format, width: 2, height: 72, displayValue: true, fontSize: 14, margin: 8,
        background: "#ffffff", lineColor: "#0f172a",
      })
      setError("")
    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid barcode value")
    }
  }, [value, format])

  return (
    <div id={`block-input-${block.id}`} data-block-input tabIndex={0} className="my-2 overflow-hidden rounded-xl border border-border/80 bg-card">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <Barcode className="size-3.5 text-brand" />
        <span className="flex-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{tr("Barcode")}</span>
        {!readOnly && (
          <select value={format} onChange={(event) => onUpdate({ language: event.target.value })} aria-label={tr("Barcode format")} className="h-6 rounded border bg-background px-1 text-[10px] outline-none">
            {BARCODE_FORMATS.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        )}
      </div>
      <div className="space-y-3 p-3">
        {!readOnly && (
          <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
            <input ref={inputRef} value={value} onChange={(event) => onUpdate({ text: event.target.value })} placeholder={tr("Value to encode…")} className="h-8 rounded-md border bg-background px-2.5 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/25" />
            <input value={block.caption ?? ""} onChange={(event) => onUpdate({ caption: event.target.value })} placeholder={tr("Caption (optional)")} className="h-8 rounded-md border bg-background px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/25" />
          </div>
        )}
        {!value && <div className="rounded-lg border border-dashed px-4 py-8 text-center text-xs text-muted-foreground">{tr("Enter a value to generate a barcode.")}</div>}
        <div className={value ? "overflow-x-auto rounded-lg bg-white p-2" : "hidden"}>
          <svg ref={svgRef} className="mx-auto max-w-full" />
        </div>
        {block.caption && value && <div className="text-center text-[11px] text-muted-foreground">{block.caption}</div>}
        {error && <p className="text-[11px] text-destructive">{error}</p>}
      </div>
    </div>
  )
}
