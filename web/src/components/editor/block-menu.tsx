import { useState } from "react"
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowDown,
  ArrowRight,
  ArrowUp,
  Check,
  ChevronRight,
  ClipboardCopy,
  Copy,
  Flag,
  Globe,
  ImageIcon,
  Languages,
  Link2,
  List,
  ListOrdered,
  LockKeyhole,
  LockOpen,
  Maximize2,
  MessageSquare,
  Minus,
  Palette,
  Plus,
  QrCode,
  Sigma,
  RefreshCw,
  Rows3,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import type { Block, BlockType } from "@/lib/types"
import { BLOCK_LABELS, SLASH_COMMANDS } from "@/components/editor/commands"
import { CALLOUT_COLORS, CALLOUT_EMOJI } from "@/lib/covers"
import { cn } from "@/lib/utils"
import { ALIGN_STYLE_TYPES, BACKGROUND_COLORS, TEXT_COLORS, TEXT_STYLE_TYPES } from "@/lib/block-style"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Textarea } from "@/components/ui/textarea"
import { ColorGrid } from "@/components/ui/color-grid"
import { tr } from "@/lib/i18n"
import { TRANSLATE_LANGS, translateText } from "@/lib/translate"

const QR_COLORS = [
  { value: "", label: "Dark", swatch: "#0f172a" },
  { value: "#7c5cff", label: "Purple", swatch: "#7c5cff" },
  { value: "#0ea5e9", label: "Blue", swatch: "#0ea5e9" },
  { value: "#16a34a", label: "Green", swatch: "#16a34a" },
  { value: "#dc2626", label: "Red", swatch: "#dc2626" },
] as const

const QR_SIZE_OPTIONS = [["200", "Small"], ["280", "Medium"], ["360", "Large"]] as const

export function BlockMenu({
  block,
  locked = false,
  selected = false,
  isLayout = false,
  hasContentPlaceholder = false,
  onToggleLock,
  trigger,
  onConvert,
  onUpdate,
  onSelectBlock,
  onDuplicate,
  onDelete,
  onInsertAbove,
  onInsertBelow,
  onMoveUp,
  onMoveDown,
  canMoveUp = false,
  canMoveDown = false,
  onComment,
  onCopyLink,
  collapsed = false,
  onToggleCollapsed,
  align = "start",
}: {
  block: Block
  locked?: boolean
  selected?: boolean
  isLayout?: boolean
  hasContentPlaceholder?: boolean
  onToggleLock?: () => void
  trigger: React.ReactNode
  onConvert: (type: BlockType) => void
  onUpdate: (patch: Partial<Block>) => void
  onSelectBlock?: () => void
  onDuplicate: () => void
  onDelete: () => void
  onInsertAbove?: () => void
  onInsertBelow?: () => void
  onMoveUp?: () => void
  onMoveDown?: () => void
  canMoveUp?: boolean
  canMoveDown?: boolean
  onComment?: () => void
  onCopyLink?: () => void
  collapsed?: boolean
  onToggleCollapsed?: () => void
  align?: "start" | "end"
}) {
  const canColor = TEXT_STYLE_TYPES.has(block.type)
  const canAlign = ALIGN_STYLE_TYPES.has(block.type) || block.type === "image"
  const alignValue = block.align || (block.type === "image" ? "center" : "left")
  const [customLanguage, setCustomLanguage] = useState("")
  const [translating, setTranslating] = useState(false)
  const [qrEditOpen, setQrEditOpen] = useState(false)
  const [qrText, setQrText] = useState(block.text)
  const [qrCaption, setQrCaption] = useState(block.caption ?? "")
  const copyText = () => {
    void navigator.clipboard.writeText(block.text).then(
      () => toast.success(tr("Copied to clipboard")),
      () => toast.error(tr("Could not copy text")),
    )
  }
  async function translateBlock(label: string, key: string) {
    if (translating) return
    setTranslating(true)
    toast.info(tr("Translating..."))
    try {
      const out = await translateText(block.text || block.caption || "", label)
      if (!out) {
        toast.error(tr("Could not translate this block. Configure AI in Settings first."))
        return
      }
      const next = { ...(block.translations ?? {}), [key]: out }
      onUpdate({ translations: next })
      toast.success(`${label} ✓`)
    } finally {
      setTranslating(false)
    }
  }
  return (
    <>
      <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        sideOffset={6}
        className="w-52"
        onCloseAutoFocus={(event) => event.preventDefault()}
      >
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <RefreshCw /> Turn into
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-48">
            {SLASH_COMMANDS.filter((command) =>
              command.type !== "content" || (isLayout && (!hasContentPlaceholder || block.type === "content")),
            ).map((command) => (
              <DropdownMenuItem key={command.type} onSelect={() => onConvert(command.type)}>
                <command.icon />
                {BLOCK_LABELS[command.type]}
                {block.type === command.type && (
                  <Check className="ml-auto size-3.5 text-brand" />
                )}
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        {onSelectBlock && (
          <DropdownMenuItem onSelect={onSelectBlock}>
            <span className={cn(
              "flex size-3.5 items-center justify-center rounded-[3px] border",
              selected ? "border-brand bg-brand text-white" : "border-muted-foreground/45",
            )}>
              {selected && <Check className="size-2.5" strokeWidth={3.4} />}
            </span>
            {tr("Select block")}
          </DropdownMenuItem>
        )}
        {["heading1", "heading2", "heading3"].includes(block.type) && onToggleCollapsed && (
          <DropdownMenuItem onSelect={onToggleCollapsed}>
            <ChevronRight className={cn("size-4 transition-transform", !collapsed && "rotate-90")} />
            {collapsed ? tr("Expand section") : tr("Collapse section")}
          </DropdownMenuItem>
        )}
        {block.type === "callout" && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette /> {tr("Callout color")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-48 p-1.5">
              {Object.keys(CALLOUT_COLORS).map((value) => (
                <DropdownMenuItem key={value} onSelect={() => onUpdate({ color: value })}>
                  <span className={cn("flex size-5 items-center justify-center rounded-md border text-[11px]", CALLOUT_COLORS[value])}>
                    {CALLOUT_EMOJI[value]}
                  </span>
                  {tr(value === "neutral" ? "Gray" : value[0].toUpperCase() + value.slice(1))}
                  {(block.color || "amber") === value && <Check className="ml-auto size-3.5 text-brand" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {canColor && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette /> {tr("Color")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-[min(92vw,22rem)] p-2.5">
              <ColorGrid
                label={tr("Text color")}
                options={TEXT_COLORS}
                value={block.textColor}
                onChange={(value) => onUpdate({ textColor: value === "default" ? "" : value })}
              />
              {block.type !== "callout" && (
                <div className="mt-3 border-t pt-2.5">
                  <ColorGrid
                    label={tr("Background")}
                    options={BACKGROUND_COLORS}
                    value={block.bgColor}
                    onChange={(value) => onUpdate({ bgColor: value === "default" ? "" : value })}
                  />
                </div>
              )}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {canAlign && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              {alignValue === "center" ? <AlignCenter /> : alignValue === "right" ? <AlignRight /> : <AlignLeft />}
              {tr("Align")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-40">
              <DropdownMenuItem onSelect={() => onUpdate({ align: "left" })}>
                <AlignLeft /> {tr("Left")}
                {alignValue === "left" && <Check className="ml-auto size-3.5" />}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onUpdate({ align: "center" })}>
                <AlignCenter /> {tr("Center")}
                {alignValue === "center" && <Check className="ml-auto size-3.5" />}
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => onUpdate({ align: "right" })}>
                <AlignRight /> {tr("Right")}
                {alignValue === "right" && <Check className="ml-auto size-3.5" />}
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {block.type === "quote" && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Palette /> {tr("Quote color")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-40">
              {[["", "Default"], ["brand", "Brand"], ["green", "Green"], ["red", "Red"], ["sky", "Sky"]].map(([value, label]) => (
                <DropdownMenuItem key={label} onSelect={() => onUpdate({ color: value })}>
                  <span className={cn("size-3 rounded-full border", !value ? "border-foreground/50" : value === "brand" ? "bg-brand" : value === "green" ? "bg-emerald-500" : value === "red" ? "bg-red-500" : "bg-sky-500")} />
                  {tr(label)}
                  {(block.color || "") === value && <Check className="ml-auto size-3.5" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {block.type === "paragraph" && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Rows3 /> {tr("Line spacing")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-40">
              {[["comfortable", "Comfortable"], ["compact", "Compact"]].map(([value, label]) => (
                <DropdownMenuItem key={value} onSelect={() => onUpdate({ language: value === "comfortable" ? "" : value })}>
                  {tr(label)}
                  {(block.language || "comfortable") === value && <Check className="ml-auto size-3.5" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {block.type === "todo" && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Flag /> {tr("Priority")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-40">
              {[["", "None"], ["low", "Low"], ["med", "Medium"], ["high", "High"]].map(([value, label]) => (
                <DropdownMenuItem key={label} onSelect={() => onUpdate({ language: value })}>
                  {value && <span className={cn("size-2 rounded-full", value === "high" ? "bg-red-500" : value === "med" ? "bg-amber-500" : "bg-sky-500")} />}
                  {tr(label)}
                  {(block.language || "") === value && <Check className="ml-auto size-3.5" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {block.type === "bulleted" && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <List /> {tr("Bullet style")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-40">
              {[["", "●  Dot"], ["square", "■  Square"]].map(([value, label]) => (
                <DropdownMenuItem key={label} onSelect={() => onUpdate({ language: value })}>
                  <span className="text-[11px]">{label}</span>
                  {(block.language || "") === value && <Check className="ml-auto size-3.5" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {block.type === "numbered" && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ListOrdered /> {tr("Number style")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-40">
              {[["", "1. 2. 3."], ["alpha", "a. b. c."], ["roman", "i. ii. iii."]].map(([value, label]) => (
                <DropdownMenuItem key={label} onSelect={() => onUpdate({ language: value })}>
                  <span className="font-mono text-[11px]">{label}</span>
                  {(block.language || "") === value && <Check className="ml-auto size-3.5" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {block.type === "divider" && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <Minus /> {tr("Thickness")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-40">
              {[["", "Thin"], ["thick", "Thick"]].map(([value, label]) => (
                <DropdownMenuItem key={label} onSelect={() => onUpdate({ width: value })}>
                  {tr(label)}
                  {(block.width || "") === value && <Check className="ml-auto size-3.5" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {block.type === "image" && (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <ImageIcon /> {tr("Image size")}
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent className="w-40">
              {[
                ["small", "Small"],
                ["medium", "Medium"],
                ["full", "Full width"],
              ].map(([value, label]) => (
                <DropdownMenuItem key={value} onSelect={() => onUpdate({ width: value })}>
                  {tr(label)}
                  {(block.width || "full") === value && <Check className="ml-auto size-3.5" />}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        )}
        {block.type === "qrcode" && (
          <>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger><Palette /> {tr("QR color")}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-40">
                {QR_COLORS.map((color) => (
                  <DropdownMenuItem key={color.swatch} onSelect={() => onUpdate({ color: color.value })}>
                    <span className="size-4 rounded-full border" style={{ background: color.swatch }} />
                    {tr(color.label)}
                    {(block.color || "#0f172a") === color.swatch && <Check className="ml-auto size-3.5 text-brand" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger><Maximize2 /> {tr("QR size")}</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-40">
                {QR_SIZE_OPTIONS.map(([value, label]) => (
                  <DropdownMenuItem key={value} onSelect={() => onUpdate({ language: value })}>
                    {tr(label)}
                    {(block.language || "280") === value && <Check className="ml-auto size-3.5 text-brand" />}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem
              onSelect={() => {
                setQrText(block.text)
                setQrCaption(block.caption ?? "")
                setQrEditOpen(true)
              }}
            >
              <QrCode /> {tr("Edit content")}
            </DropdownMenuItem>
          </>
        )}
        {block.height ? (
          <DropdownMenuItem onSelect={() => onUpdate({ height: undefined })}>
            <Rows3 /> {tr("Reset height")}
          </DropdownMenuItem>
        ) : null}
        {(onInsertAbove || onInsertBelow) && <DropdownMenuSeparator />}
        {onInsertAbove && (
          <DropdownMenuItem onSelect={onInsertAbove}>
            <Plus /> {tr("Insert above")}
          </DropdownMenuItem>
        )}
        {onInsertBelow && (
          <DropdownMenuItem onSelect={onInsertBelow}>
            <Plus /> {tr("Insert below")}
          </DropdownMenuItem>
        )}
        {(onMoveUp || onMoveDown) && <DropdownMenuSeparator />}
        {onMoveUp && (
          <DropdownMenuItem disabled={!canMoveUp} onSelect={onMoveUp}>
            <ArrowUp /> {tr("Move up")}
          </DropdownMenuItem>
        )}
        {onMoveDown && (
          <DropdownMenuItem disabled={!canMoveDown} onSelect={onMoveDown}>
            <ArrowDown /> {tr("Move down")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSub>
          <DropdownMenuSubTrigger><Languages /> {tr("Translate")}</DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-44">
            {TRANSLATE_LANGS.map((l) => (
              <DropdownMenuItem key={l.code} onSelect={() => void translateBlock(l.label, l.code)}>
                <Globe className="size-3" /> {l.label} <span className="ml-auto text-[10px] text-muted-foreground">{l.code}</span>
                {block.translations?.[l.code] && <Check className="ml-1 size-3 text-brand" />}
              </DropdownMenuItem>
            ))}
            <div className="mt-1 flex items-center gap-1 border-t border-border/60 p-1.5">
              <input
                value={customLanguage}
                onChange={(event) => setCustomLanguage(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key !== "Enter") return
                  event.preventDefault()
                  const label = customLanguage.trim()
                  if (!label) return
                  setCustomLanguage("")
                  void translateBlock(label, label.slice(0, 40))
                }}
                placeholder={tr("Custom language…")}
                className="h-7 min-w-0 flex-1 rounded border bg-background px-2 text-[11px] outline-none placeholder:text-muted-foreground/60 focus:border-brand/40"
              />
              <button
                type="button"
                aria-label={tr("Apply")}
                disabled={!customLanguage.trim() || translating}
                onClick={() => {
                  const label = customLanguage.trim()
                  if (!label) return
                  setCustomLanguage("")
                  void translateBlock(label, label.slice(0, 40))
                }}
                className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground disabled:opacity-40"
              >
                <ArrowRight className="size-3" />
              </button>
            </div>
            {block.translations && Object.keys(block.translations).length > 0 && (
              <DropdownMenuItem variant="destructive" onSelect={() => onUpdate({ translations: {} })}><Trash2 /> {tr("Clear translations")}</DropdownMenuItem>
            )}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuItem
          onSelect={() => {
            window.dispatchEvent(new CustomEvent("motion:insert-inline-equation", { detail: { blockId: block.id } }))
          }}
        >
          <Sigma /> {tr("Inline equation")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={onDuplicate}>
          <Copy /> {tr("Duplicate")}
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={copyText}>
          <ClipboardCopy /> {tr("Copy text")}
        </DropdownMenuItem>
        {onCopyLink && (
          <DropdownMenuItem onSelect={onCopyLink}>
            <Link2 /> {tr("Copy link to block")}
          </DropdownMenuItem>
        )}
        {onToggleLock && (
          <DropdownMenuItem onSelect={onToggleLock}>
            {locked ? <LockOpen /> : <LockKeyhole />}
            {locked ? tr("Unlock block") : tr("Lock block")}
          </DropdownMenuItem>
        )}
        {onComment && (
          <DropdownMenuItem onSelect={onComment}>
            <MessageSquare /> {tr("Comment")}
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem variant="destructive" onSelect={onDelete}>
          <Trash2 /> {tr("Delete")}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
    <Dialog open={qrEditOpen} onOpenChange={setQrEditOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{tr("QR code")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <label className="block space-y-1">
            <span className="text-xs font-medium">{tr("URL or text")}</span>
            <Textarea
              value={qrText}
              onChange={(event) => setQrText(event.target.value)}
              placeholder={tr("URL or text to encode…")}
              rows={3}
              className="min-h-20 text-xs"
            />
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium">{tr("Caption (optional)")}</span>
            <input
              value={qrCaption}
              onChange={(event) => setQrCaption(event.target.value)}
              placeholder={tr("Caption (optional)")}
              className="h-8 w-full rounded-md border bg-background px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setQrEditOpen(false)}>{tr("Cancel")}</Button>
          <Button
            onClick={() => {
              onUpdate({ text: qrText, caption: qrCaption.trim() })
              setQrEditOpen(false)
            }}
          >
            {tr("Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
    </>
  )
}
