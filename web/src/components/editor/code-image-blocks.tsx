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
  const [dataURLs, setDataURLs] = useState<string[]>([])
  const [error, setError] = useState("")
  const inputRef = useRef<HTMLInputElement>(null)
  const size = Number(block.language) || 280
  const value = block.text
  const values = value.split("\n").map((v) => v.trim()).filter(Boolean)
  const isBatch = values.length > 1

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    let alive = true
    if (!value) {
      setDataURLs([])
      setError("")
      return
    }
    const dark = /^#[0-9a-fA-F]{6}$/.test(block.color ?? "") ? block.color! : "#0f172a"
    Promise.all(values.map((v) => QRCode.toDataURL(v, {
      width: size, margin: 2, errorCorrectionLevel: "M",
      color: { dark, light: "#ffffff" },
    }))).then((urls) => {
      if (alive) { setDataURLs(urls); setError("") }
    }).catch((err) => {
      if (alive) setError(err instanceof Error ? err.message : "Could not generate QR code")
    })
    return () => { alive = false }
  }, [value, size, values.join("|"), block.color])
  const dataURL = dataURLs[0] ?? ""

  return (
    <div id={`block-input-${block.id}`} data-block-input tabIndex={0} className="my-2 overflow-hidden rounded-xl border border-border/80 bg-card">
      <div className="flex items-center gap-2 border-b border-border/60 px-3 py-2">
        <QrCode className="size-3.5 text-brand" />
        <span className="flex-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{tr("QR code")}</span>
        {!readOnly && (
          <>
            <span className="flex items-center gap-1">
              {["#0f172a", "#7c5cff", "#0ea5e9", "#16a34a", "#dc2626"].map((c) => (
                <button
                  key={c}
                  type="button"
                  title={tr("QR color")}
                  onClick={() => onUpdate({ color: c === "#0f172a" ? "" : c })}
                  className={`size-4 rounded-full border ${((block.color || "#0f172a") === c) ? "ring-2 ring-brand ring-offset-1" : ""}`}
                  style={{ background: c }}
                />
              ))}
            </span>
            <select value={String(size)} onChange={(event) => onUpdate({ language: event.target.value })} aria-label={tr("QR size")} className="h-6 rounded border bg-background px-1 text-[10px] outline-none">
              {QR_SIZES.map(([value, label]) => <option key={value} value={value}>{tr(label)}</option>)}
            </select>
          </>
        )}
      </div>
      <div className="space-y-3 p-3">
        {!readOnly && (
          <div className="grid gap-2 sm:grid-cols-[1fr_180px]">
            <input ref={inputRef} value={value} onChange={(event) => onUpdate({ text: event.target.value })} placeholder={tr("URL or text to encode…")} className="h-8 rounded-md border bg-background px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/25" />
            <input value={block.caption ?? ""} onChange={(event) => onUpdate({ caption: event.target.value })} placeholder={tr("Caption (optional)")} className="h-8 rounded-md border bg-background px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/25" />
          </div>
        )}
        {!value && <div className="rounded-lg border border-dashed px-4 py-8 text-center text-xs text-muted-foreground">{readOnly ? tr("No QR code content.") : tr("Enter text or a URL to generate a QR code.")}</div>}
        {value && dataURLs.length > 0 && (
          <div className={isBatch ? "grid gap-3 sm:grid-cols-2" : "flex flex-col items-center gap-2"}>
            {dataURLs.map((url, i) => (
              <div key={i} className="flex flex-col items-center gap-1 rounded-lg border bg-white p-2">
                <img src={url} width={Math.min(size, 180)} height={Math.min(size, 180)} alt={values[i] || "QR code"} className="max-w-full rounded-lg bg-white" />
                <div className="truncate text-[10px] text-muted-foreground">{values[i]}</div>
                <button type="button" onClick={() => { const link = document.createElement("a"); link.href = url; link.download = `qr-${i+1}.png`; link.click() }} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground">
                  <ImageDown className="size-3" /> {tr("Download PNG")}
                </button>
              </div>
            ))}
            {block.caption && !isBatch && <div className="text-center text-[11px] text-muted-foreground">{block.caption}</div>}
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
        {!value && <div className="rounded-lg border border-dashed px-4 py-8 text-center text-xs text-muted-foreground">{readOnly ? tr("No barcode content.") : tr("Enter a value to generate a barcode.")}</div>}
        <div className={value ? "overflow-x-auto rounded-lg bg-white p-2" : "hidden"}>
          <svg ref={svgRef} className="mx-auto max-w-full" />
        </div>
        {value && !error && (
          <div className="flex justify-center">
            <button
              type="button"
              onClick={() => {
                const el = svgRef.current
                if (!el) return
                const clone = el.cloneNode(true) as SVGSVGElement
                clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")
                const href = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" }))
                const img = new Image()
                img.onload = () => {
                  const canvas = document.createElement("canvas")
                  canvas.width = img.width * 2 || 600
                  canvas.height = img.height * 2 || 200
                  const ctx = canvas.getContext("2d")
                  if (ctx) {
                    ctx.fillStyle = "#ffffff"
                    ctx.fillRect(0, 0, canvas.width, canvas.height)
                    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
                    canvas.toBlob((blob) => {
                      if (!blob) return
                      const link = document.createElement("a")
                      link.href = URL.createObjectURL(blob)
                      link.download = "barcode.png"
                      link.click()
                    }, "image/png")
                  }
                  URL.revokeObjectURL(href)
                }
                img.src = href
              }}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              <ImageDown className="size-3" /> {tr("Download PNG")}
            </button>
          </div>
        )}
        {block.caption && value && <div className="text-center text-[11px] text-muted-foreground">{block.caption}</div>}
        {error && <p className="text-[11px] text-destructive">{error}</p>}
      </div>
    </div>
  )
}
