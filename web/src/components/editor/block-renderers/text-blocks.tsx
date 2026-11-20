import { useState } from "react"
import { Check, ChevronRight, Columns2 } from "lucide-react"
import type { BlockRenderProps } from "@/components/editor/block-renderers/types"
import { EmojiPicker } from "@/components/editor/emoji-picker"
import { CALLOUT_COLORS, CALLOUT_EMOJI } from "@/lib/covers"
import { cn } from "@/lib/utils"
import { tr } from "@/lib/i18n"
import { Switch } from "@/components/ui/switch"

export function ToggleBlock({
  block,
  hasChildren,
  onToggleCollapsed,
  renderEditable,
}: BlockRenderProps) {
  const headingClass =
    block.type === "toggleHeading1"
      ? "text-[30px] font-semibold leading-[1.25] tracking-[-0.02em] py-1.5 mt-5"
      : block.type === "toggleHeading2"
        ? "text-[24px] font-semibold leading-[1.3] tracking-[-0.015em] py-1 mt-4"
        : block.type === "toggleHeading3"
          ? "text-[19px] font-semibold leading-[1.4] py-1 mt-3"
          : "text-[15px] leading-[1.7] py-[3px]"
  return (
    <div className={cn("flex items-start gap-1", block.type !== "toggle" && "mt-0.5")}>
      <button
        type="button"
        aria-label={block.collapsed ? tr("Expand") : tr("Collapse")}
        aria-expanded={!block.collapsed}
        onClick={onToggleCollapsed}
        className={cn(
          "mt-[7px] flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/70 transition hover:bg-accent hover:text-foreground",
          !hasChildren && "opacity-30",
        )}
      >
        <ChevronRight className={cn("size-3.5 transition-transform", !block.collapsed && "rotate-90")} />
      </button>
      {renderEditable(headingClass)}
    </div>
  )
}

export function HeadingBlock({
  block,
  onToggleCollapsed,
  renderEditable,
}: BlockRenderProps) {
  const headingClass =
    block.type === "heading1"
      ? "text-[30px] font-semibold leading-[1.25] tracking-[-0.02em] py-1.5 mt-5"
      : block.type === "heading2"
        ? "text-[24px] font-semibold leading-[1.3] tracking-[-0.015em] py-1 mt-4"
        : "text-[19px] font-semibold leading-[1.4] py-1 mt-3"
  return block.collapsed ? (
    <div className="flex items-start gap-1">
      <button
        type="button"
        aria-label={tr("Expand section")}
        aria-expanded={false}
        title={tr("Expand section")}
        onClick={onToggleCollapsed}
        className="mt-[9px] flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground transition hover:bg-accent hover:text-foreground"
      >
        <ChevronRight className="size-3.5" />
      </button>
      <div className="min-w-0 flex-1">{renderEditable(headingClass)}</div>
    </div>
  ) : renderEditable(headingClass)
}

export function BulletedBlock({ block, renderEditable }: BlockRenderProps) {
  return (
    <div className="flex items-start gap-2.5">
      <span className="mt-[9px] flex h-4 w-4 shrink-0 items-center justify-center">
        <span className={cn("size-[5px] bg-foreground/70", block.language === "square" ? "rounded-[1px]" : "rounded-full")} />
      </span>
      {renderEditable("text-[15px] leading-[1.7] py-[3px]")}
    </div>
  )
}

function toRoman(n: number): string {
  const table: [number, string][] = [[1000, "m"], [900, "cm"], [500, "d"], [400, "cd"], [100, "c"], [90, "xc"], [50, "l"], [40, "xl"], [10, "x"], [9, "ix"], [5, "v"], [4, "iv"], [1, "i"]]
  let out = ""
  let rest = Math.max(1, Math.min(3999, n))
  for (const [value, symbol] of table) {
    while (rest >= value) {
      out += symbol
      rest -= value
    }
  }
  return out
}

export function NumberedBlock({ block, number, renderEditable }: BlockRenderProps) {
  return (
    <div className="flex items-start gap-2">
      <span className="mt-[3px] flex h-6 w-7 shrink-0 items-center justify-end text-[14px] tabular-nums text-muted-foreground">
        {block.language === "alpha" ? `${String.fromCharCode(96 + ((number - 1) % 26) + 1)}.` : block.language === "roman" ? `${toRoman(number)}.` : `${number}.`}
      </span>
      {renderEditable("text-[15px] leading-[1.7] py-[3px]")}
    </div>
  )
}

export function TodoBlock({ block, onToggle, renderEditable }: BlockRenderProps) {
  return (
    <div className="flex items-start gap-2.5">
      {Boolean(block.language) && (
        <span title={tr("Priority: {p}", { p: block.language === "high" ? tr("High") : block.language === "med" ? tr("Medium") : tr("Low") })} className={cn("mt-[5px] h-[17px] w-1 shrink-0 rounded-full", block.language === "high" ? "bg-red-500" : block.language === "med" ? "bg-amber-500" : "bg-sky-500")} />
      )}
      <button
        type="button"
        role="checkbox"
        aria-checked={!!block.checked}
        onClick={onToggle}
        className={cn(
          "mt-[5px] flex size-[17px] shrink-0 items-center justify-center rounded-[4px] border transition-colors",
          block.checked
            ? "border-brand bg-brand text-white"
            : "border-muted-foreground/40 bg-background hover:border-brand/60",
        )}
      >
        {block.checked && <Check className="size-3" strokeWidth={3.2} />}
      </button>
      {renderEditable(
        cn(
          "text-[15px] leading-[1.7] py-[3px] transition-colors",
          block.checked && "text-muted-foreground line-through decoration-muted-foreground/50",
        ),
      )}
    </div>
  )
}

export function QuoteBlock({ block, readOnly, onUpdate, renderEditable }: BlockRenderProps) {
  return (
    <div className={cn("border-l-[3px] py-0.5 pl-4", block.color === "brand" ? "border-brand/70" : block.color === "green" ? "border-emerald-500/70" : block.color === "red" ? "border-red-500/70" : block.color === "sky" ? "border-sky-500/70" : "border-foreground/60")}>
      {renderEditable("text-[15px] leading-[1.7] py-[3px] text-foreground/90")}
      {readOnly ? (
        block.caption ? <div className="mt-1 text-right text-[11px] italic text-muted-foreground">— {block.caption}</div> : null
      ) : (
        <div className="mt-1 flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">—</span>
          <input
            value={block.caption ?? ""}
            onChange={(event) => onUpdate({ caption: event.target.value })}
            placeholder={tr("Citation (optional)")}
            className="h-6 min-w-0 flex-1 bg-transparent text-[11px] italic text-muted-foreground outline-none placeholder:text-muted-foreground/40"
          />
        </div>
      )}
    </div>
  )
}

export function CalloutBlock({ block, readOnly, onUpdate, renderEditable }: BlockRenderProps) {
  const [folded, setFolded] = useState(false)
  const color = block.color || "amber"
  const icon = block.icon || CALLOUT_EMOJI[color] || "💡"
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-lg px-3.5 py-3",
        CALLOUT_COLORS[color] ?? CALLOUT_COLORS.amber,
      )}
    >
      {readOnly ? (
        <span className="mt-[1px] shrink-0 select-none text-[17px] leading-6">{icon}</span>
      ) : (
        <EmojiPicker value={icon} onSelect={(next) => { if (next) onUpdate({ icon: next }) }}>
          <button type="button" className="mt-[1px] shrink-0 cursor-pointer select-none text-[17px] leading-6 transition hover:scale-110" title={tr("Change icon")}>
            {icon}
          </button>
        </EmojiPicker>
      )}
      <div className="min-w-0 flex-1">
        <div className={cn(folded && "line-clamp-2")}>{renderEditable("text-[15px] leading-[1.7] py-0")}</div>
        {folded ? (
          <button type="button" onClick={() => setFolded(false)} className="mt-0.5 text-[11px] text-brand hover:underline">{tr("Show more")}</button>
        ) : (
          block.text.length > 240 && (
            <button type="button" onClick={() => setFolded(true)} className="mt-0.5 text-[11px] text-muted-foreground hover:text-foreground hover:underline">{tr("Show less")}</button>
          )
        )}
      </div>
    </div>
  )
}

export function DividerBlock({ block, readOnly, onUpdate, onDelete, onKeyDown, index, onFocusBlock }: BlockRenderProps) {
  const style = block.color || "solid"
  function handleKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Backspace" || event.key === "Delete") {
      event.preventDefault()
      onDelete()
    } else {
      onKeyDown(event, index)
    }
  }
  return (
    <div className="py-3">
      <div
        id={`block-input-${block.id}`}
        data-block-input
        tabIndex={0}
        onKeyDown={handleKeyDown}
        onFocus={() => onFocusBlock?.(block.id)}
        className="group/divider rounded-sm py-1 outline-none focus-visible:ring-2 focus-visible:ring-brand/30"
      >
        <hr className={cn(style === "dashed" ? "border-dashed" : style === "dotted" ? "border-dotted" : "border-solid", block.width === "thick" ? "border-t-2" : "border-t")} style={{ borderColor: "var(--border)" }} />
        {!readOnly && (
          <div className="mt-1 hidden justify-center gap-1 opacity-0 transition-opacity max-md:opacity-100 group-hover/divider:opacity-100 group-focus-within/divider:opacity-100 sm:flex">
            {["solid", "dashed", "dotted"].map((value) => (
              <button key={value} type="button" onClick={() => onUpdate({ color: value })} className={cn("rounded px-2 py-0.5 text-[10px] capitalize", style === value ? "bg-accent font-medium" : "text-muted-foreground hover:bg-accent")}>{value}</button>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

export function CheckboxBlock({ block, readOnly, onToggle, renderEditable }: BlockRenderProps) {
  const checked = Boolean(block.checked)
  const round = block.type === "radio"
  return (
    <div className="flex items-start gap-2.5">
      {block.type === "switch" ? (
        <span className="mt-[1px] shrink-0">
          <Switch checked={checked} disabled={readOnly} onCheckedChange={() => onToggle()} aria-label={block.text || tr("Switch")} />
        </span>
      ) : (
        <button
          type="button"
          role={round ? "radio" : "checkbox"}
          aria-checked={checked}
          aria-label={block.text || (round ? tr("Radio") : tr("Checkbox"))}
          disabled={readOnly}
          onClick={onToggle}
          className={cn(
            "mt-[5px] flex size-[17px] shrink-0 items-center justify-center border transition-colors disabled:cursor-default",
            round ? "rounded-full" : "rounded-[4px]",
            checked ? "border-brand bg-brand text-white" : "border-muted-foreground/40 bg-background hover:border-brand/60",
          )}
        >
          {checked && (round ? <span className="size-[5px] rounded-full bg-white" /> : <Check className="size-3" strokeWidth={3.2} />)}
        </button>
      )}
      {renderEditable(cn("text-[15px] leading-[1.7] py-[3px]", block.type === "checkbox" && checked && "text-muted-foreground line-through"))}
    </div>
  )
}

export function ContentPlaceholderBlock() {
  return (
    <div className="my-3 rounded-xl border-2 border-dashed border-brand/35 bg-gradient-to-br from-brand-soft/30 to-brand-two/10 px-4 py-6 text-center">
      <div className="mx-auto flex size-8 items-center justify-center rounded-lg bg-brand text-white">
        <Columns2 className="size-4" />
      </div>
      <div className="mt-2 text-xs font-semibold text-brand">{tr("Page content appears here")}</div>
      <div className="mt-1 text-[11px] leading-5 text-muted-foreground">
        {tr("Everything before this block is the shared header; everything after it is the footer.")}
      </div>
      <div className="mt-3 flex justify-center gap-1.5 text-[10px] text-muted-foreground">
        <span className="rounded bg-background px-1.5 py-0.5">{tr("Header")}</span>
        <span>→</span>
        <span className="rounded bg-brand px-1.5 py-0.5 font-medium text-white">{tr("Content")}</span>
        <span>→</span>
        <span className="rounded bg-background px-1.5 py-0.5">{tr("Footer")}</span>
      </div>
    </div>
  )
}

export function ParagraphBlock({ block, readOnly, renderEditable }: BlockRenderProps) {
  const [folded, setFolded] = useState(true)
  const paraLeading = block.language === "compact" ? "leading-[1.5]" : "leading-[1.7]"
  const lines = block.text.split("\n").length
  if (readOnly && folded && lines > 40) {
    return (
      <div>
        <div className={`max-h-64 overflow-hidden text-[15px] ${paraLeading}`}>
          {renderEditable("py-[3px] pointer-events-none select-none")}
        </div>
        <button
          type="button"
          onClick={() => setFolded(false)}
          className="mt-1 rounded-md border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {tr("Show all {n} lines", { n: lines })}
        </button>
      </div>
    )
  }
  return <>{renderEditable(`text-[15px] ${paraLeading} py-[3px]`)}</>
}
