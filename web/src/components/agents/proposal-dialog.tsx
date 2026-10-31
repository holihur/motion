import { useMemo, useState } from "react"
import { Check, Columns2, Loader2, RotateCcw, Rows3, Sparkles, X } from "lucide-react"
import type { AIProposal, Block } from "@/lib/types"
import { formatRelative } from "@/lib/utils"
import { tr } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function diffBlocks(before: Block[], after: Block[]) {
  const beforeMap = new Map(before.map((block) => [block.id, block]))
  const afterMap = new Map(after.map((block) => [block.id, block]))
  const added = after.filter((block) => !beforeMap.has(block.id))
  const removed = before.filter((block) => !afterMap.has(block.id))
  const changed = after.filter((block) => {
    const old = beforeMap.get(block.id)
    return old && JSON.stringify(old) !== JSON.stringify(block)
  })
  return { added, removed, changed }
}

export function proposalStatusClass(status: string) {
  if (status === "approved") return "rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] text-emerald-700 dark:text-emerald-300"
  if (status === "rejected") return "rounded-full bg-red-500/10 px-1.5 py-0.5 text-[9px] text-red-700 dark:text-red-300"
  return "rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-700 dark:text-amber-300"
}

export function ProposalDialog({
  proposal,
  onOpenChange,
  onReview,
  onRetry,
  reviewing = false,
}: {
  proposal: AIProposal | null
  onOpenChange: (open: boolean) => void
  onReview: (proposal: AIProposal, action: "approve" | "reject", reason?: string) => void
  onRetry?: (proposal: AIProposal) => void
  reviewing?: boolean
}) {
  const [reason, setReason] = useState("")
  if (!proposal) return null
  const pending = proposal.status === "pending"
  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-brand" /> {tr("Review AI changes")}
          </DialogTitle>
          <DialogDescription>
            {proposal.agentName} · {proposal.actorName} · {formatRelative(proposal.createdAt)}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-wrap items-center gap-2 rounded-xl border bg-muted/25 px-3 py-2 text-xs">
          <span className="font-medium">{proposal.pageTitle || tr("Untitled")}</span>
          <span className={proposalStatusClass(proposal.status)}>{tr(proposal.status)}</span>
          {proposal.created && <span className="rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[9px] text-sky-700 dark:text-sky-300">{tr("New page")}</span>}
        </div>

        {proposal.prompt && (
          <div className="rounded-xl border border-brand/20 bg-brand-soft/20 px-3 py-2 text-xs leading-5">
            <span className="font-medium">{tr("Task")}: </span>
            <span className="text-muted-foreground">{proposal.prompt}</span>
          </div>
        )}

        {proposal.status === "rejected" && proposal.rejectReason && (
          <div className="rounded-xl border border-red-500/25 bg-red-500/5 px-3 py-2 text-xs leading-5">
            <span className="font-medium">{tr("Reject reason")}: </span>
            <span className="text-muted-foreground">{proposal.rejectReason}</span>
          </div>
        )}

        {proposal.before && proposal.before.title !== proposal.after.title && (
          <div className="grid gap-2 rounded-xl border p-3 text-xs sm:grid-cols-2">
            <div><span className="text-[10px] text-muted-foreground">{tr("Before")}</span><div className="mt-1 line-through opacity-70">{proposal.before.title}</div></div>
            <div><span className="text-[10px] text-muted-foreground">{tr("After")}</span><div className="mt-1 font-medium">{proposal.after.title}</div></div>
          </div>
        )}

        <DiffView before={proposal.before?.blocks ?? []} after={proposal.after.blocks} />

        {pending && (
          <div className="space-y-1.5">
            <div className="text-[11px] font-medium text-muted-foreground">{tr("Reject reason (optional — used when retrying)")}</div>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              placeholder={tr("e.g. keep the tone casual, don't touch the pricing table")}
              className="w-full rounded-lg border bg-background px-2.5 py-2 text-xs outline-none focus:border-brand"
            />
          </div>
        )}

        <DialogFooter className="gap-1.5">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{tr("Close")}</Button>
          {proposal.status === "rejected" && onRetry && (
            <Button variant="outline" disabled={reviewing} onClick={() => onRetry(proposal)} className="gap-1.5">
              <RotateCcw className="size-3.5" /> {tr("Retry with feedback")}
            </Button>
          )}
          {pending && (
            <>
              <Button variant="outline" disabled={reviewing} onClick={() => onReview(proposal, "reject", reason.trim() || undefined)} className="gap-1.5">
                <X className="size-3.5" /> {tr("Reject")}
              </Button>
              <Button disabled={reviewing} onClick={() => onReview(proposal, "approve")} className="gap-1.5">
                {reviewing ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                {tr("Approve & apply")}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------- 并排对比 ---------------- */

type DiffRowItem =
  | { kind: "same"; block: Block }
  | { kind: "added"; block: Block }
  | { kind: "removed"; block: Block }
  | { kind: "changed"; before: Block; after: Block }
  | { kind: "gap"; count: number }

/** 按 after 顺序对齐，removed 插在其后继之前，unchanged 只留上下文。 */
function alignRows(before: Block[], after: Block[], context = 1): DiffRowItem[] {
  const beforeMap = new Map(before.map((b) => [b.id, b]))
  const afterMap = new Map(after.map((b) => [b.id, b]))
  const removedIds = new Set(before.filter((b) => !afterMap.has(b.id)).map((b) => b.id))
  // removed 按 before 位置挂到其后第一个仍存在的块之前
  const pendingRemoved = new Map<string, Block[]>() // key: afterId | "__tail__"
  let bucket: Block[] = []
  for (const b of before) {
    if (removedIds.has(b.id)) {
      bucket.push(b)
    } else {
      const list = pendingRemoved.get(b.id) ?? []
      pendingRemoved.set(b.id, [...list, ...bucket])
      bucket = []
    }
  }
  if (bucket.length) {
    const list = pendingRemoved.get("__tail__") ?? []
    pendingRemoved.set("__tail__", [...list, ...bucket])
  }
  const rows: DiffRowItem[] = []
  const pushRemoved = (key: string) => {
    for (const b of pendingRemoved.get(key) ?? []) rows.push({ kind: "removed", block: b })
  }
  for (const b of after) {
    pushRemoved(b.id)
    const old = beforeMap.get(b.id)
    if (!old) rows.push({ kind: "added", block: b })
    else if (JSON.stringify(old) === JSON.stringify(b)) rows.push({ kind: "same", block: b })
    else rows.push({ kind: "changed", before: old, after: b })
  }
  pushRemoved("__tail__")
  // 折叠非上下文 same 行
  const hot = new Set<number>()
  rows.forEach((r, i) => {
    if (r.kind === "same") return
    for (let k = Math.max(0, i - context); k <= Math.min(rows.length - 1, i + context); k++) hot.add(k)
  })
  const out: DiffRowItem[] = []
  let gap = 0
  rows.forEach((r, i) => {
    if (r.kind === "same" && !hot.has(i)) {
      gap++
      return
    }
    if (gap > 0) {
      out.push({ kind: "gap", count: gap })
      gap = 0
    }
    out.push(r)
  })
  if (gap > 0) out.push({ kind: "gap", count: gap })
  return out
}

/** 公共前后缀 diff：O(n)，改几个字的场景足够精确。 */
function splitChange(a: string, b: string): { pre: string; del: string; ins: string; post: string } {
  const ar = [...a], br = [...b]
  let pre = 0
  while (pre < ar.length && pre < br.length && ar[pre] === br[pre]) pre++
  let post = 0
  while (post < ar.length - pre && post < br.length - pre && ar[ar.length - 1 - post] === br[br.length - 1 - post]) post++
  return {
    pre: ar.slice(0, pre).join(""),
    del: ar.slice(pre, ar.length - post).join(""),
    ins: br.slice(pre, br.length - post).join(""),
    post: post ? ar.slice(ar.length - post).join("") : "",
  }
}

function InlineChange({ before, after }: { before: string; after: string }) {
  const part = useMemo(() => {
    if (before.length + after.length > 4000) return null
    const c = splitChange(before, after)
    if (!c.del && !c.ins) return null
    return c
  }, [before, after])
  if (!part) return <>{after}</>
  return (
    <>
      {part.pre}
      {part.del && <del className="rounded bg-red-500/20 px-0.5 text-red-700 decoration-red-500/60 dark:text-red-300">{part.del}</del>}
      {part.ins && <ins className="rounded bg-emerald-500/20 px-0.5 text-emerald-700 no-underline dark:text-emerald-300">{part.ins}</ins>}
      {part.post}
    </>
  )
}

function CellText({ text, empty }: { text: string; empty: string }) {
  if (!text) return <span className="text-muted-foreground/50">{empty}</span>
  return <>{text.length > 600 ? text.slice(0, 600) + "…" : text}</>
}

function RichCell({ block, renderBlock }: { block: Block; renderBlock?: (block: Block) => React.ReactNode }) {
  if (renderBlock && (block.type === "image" || block.type === "table" || block.type === "code")) {
    return <>{renderBlock(block)}</>
  }
  return <CellText text={block.text} empty={block.type} />
}

function DiffView({ before, after, renderBlock }: { before: Block[]; after: Block[]; renderBlock?: (block: Block) => React.ReactNode }) {
  const [mode, setMode] = useState<"side" | "unified">("side")
  const rows = useMemo(() => alignRows(before, after, 1), [before, after])
  const counts = useMemo(() => {
    let added = 0, removed = 0, changed = 0
    for (const r of rows) {
      if (r.kind === "added") added++
      else if (r.kind === "removed") removed++
      else if (r.kind === "changed") changed++
    }
    return { added, removed, changed }
  }, [rows])
  if (rows.length === 0) {
    return (
      <div className="rounded-xl border border-dashed px-4 py-8 text-center text-xs text-muted-foreground">
        {tr("No visible content changes")}
      </div>
    )
  }
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px]">
        <span className="rounded bg-emerald-500/10 px-1.5 py-0.5 font-semibold text-emerald-700 dark:text-emerald-300">+{counts.added}</span>
        <span className="rounded bg-amber-500/10 px-1.5 py-0.5 font-semibold text-amber-700 dark:text-amber-300">±{counts.changed}</span>
        <span className="rounded bg-red-500/10 px-1.5 py-0.5 font-semibold text-red-700 dark:text-red-300">−{counts.removed}</span>
        <span className="ml-auto flex overflow-hidden rounded-lg border">
          <button
            type="button"
            title={tr("Side by side")}
            onClick={() => setMode("side")}
            className={`flex items-center gap-1 px-2 py-1 ${mode === "side" ? "bg-muted font-semibold" : "text-muted-foreground hover:bg-accent"}`}
          >
            <Columns2 className="size-3" />{tr("Side by side")}
          </button>
          <button
            type="button"
            title={tr("Unified")}
            onClick={() => setMode("unified")}
            className={`flex items-center gap-1 px-2 py-1 ${mode === "unified" ? "bg-muted font-semibold" : "text-muted-foreground hover:bg-accent"}`}
          >
            <Rows3 className="size-3" />{tr("Unified")}
          </button>
        </span>
      </div>
      {mode === "side" && (
        <div>
          <div className="mb-1 hidden grid-cols-2 gap-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground sm:grid">
            <span className="px-1">{tr("Before")}</span>
            <span className="px-1">{tr("After")}</span>
          </div>
          <div className="space-y-1.5">
            {rows.map((r, i) => {
              if (r.kind === "gap") {
                return <div key={i} className="rounded-md bg-muted/40 px-2 py-1 text-center text-[10px] text-muted-foreground">··· {tr("{n} unchanged block(s)", { n: r.count })} ···</div>
              }
              const leftTone = r.kind === "removed" || r.kind === "changed" ? "border-red-500/25 bg-red-500/5" : "border-border/50 bg-muted/20"
              const rightTone = r.kind === "added" || r.kind === "changed" ? (r.kind === "added" ? "border-emerald-500/25 bg-emerald-500/5" : "border-amber-500/25 bg-amber-500/5") : "border-border/50 bg-muted/20"
              const left = r.kind === "removed" ? r.block : r.kind === "changed" ? r.before : r.kind === "same" ? r.block : null
              const right = r.kind === "added" ? r.block : r.kind === "changed" ? r.after : r.kind === "same" ? r.block : null
              return (
                <div key={i} className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 sm:gap-2">
                  <div className={`min-w-0 rounded-lg border px-2.5 py-2 ${leftTone}`}>
                    <RowLabel block={left} sign={r.kind === "removed" ? "−" : r.kind === "changed" ? "±" : ""} />
                    {left && <div className="mt-0.5 whitespace-pre-wrap text-xs leading-5"><RichCell block={left} renderBlock={renderBlock} /></div>}
                  </div>
                  <div className={`min-w-0 rounded-lg border px-2.5 py-2 ${rightTone}`}>
                    <RowLabel block={right} sign={r.kind === "added" ? "+" : r.kind === "changed" ? "±" : ""} />
                    {right && (
                      <div className="mt-0.5 whitespace-pre-wrap text-xs leading-5">
                        {r.kind === "changed" ? <InlineChange before={r.before.text} after={r.after.text} /> : <RichCell block={right} renderBlock={renderBlock} />}
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
      {mode === "unified" && (
        <div className="space-y-2">
          {rows.map((r, i) => {
            if (r.kind === "gap") {
              return <div key={i} className="rounded-md bg-muted/40 px-2 py-1 text-center text-[10px] text-muted-foreground">··· {tr("{n} unchanged block(s)", { n: r.count })} ···</div>
            }
            if (r.kind === "same") return null
            const tone = r.kind === "added" ? "border-emerald-500/25 bg-emerald-500/5" : r.kind === "removed" ? "border-red-500/25 bg-red-500/5" : "border-amber-500/25 bg-amber-500/5"
            return (
              <div key={i} className={`rounded-xl border px-3 py-2.5 ${tone}`}>
                <RowLabel block={r.kind === "changed" ? r.after : r.block} sign={r.kind === "added" ? "+" : r.kind === "removed" ? "−" : "±"} />
                {r.kind === "changed" && (
                  <div className="mt-1 whitespace-pre-wrap text-xs leading-5 text-red-700/80 line-through decoration-red-500/40 dark:text-red-300/80">{r.before.text || tr("Empty block")}</div>
                )}
                <div className="mt-1 whitespace-pre-wrap text-xs leading-5">
                  {r.kind === "changed" ? <InlineChange before={r.before.text} after={r.after.text} /> : <RichCell block={r.block} renderBlock={renderBlock} />}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function RowLabel({ block, sign }: { block: Block | null; sign: string }) {
  if (!block) return <div className="text-[10px] text-muted-foreground/40">—</div>
  return (
    <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
      <span>{block.type}</span>
      {sign && <span className="ml-auto font-mono font-bold">{sign}</span>}
    </div>
  )
}
