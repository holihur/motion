import { useState } from "react"
import { Check, Loader2, RotateCcw, Sparkles, X } from "lucide-react"
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
  const changes = diffBlocks(proposal.before?.blocks ?? [], proposal.after.blocks)
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

        <div className="space-y-2">
          {changes.added.map((block) => <DiffRow key={block.id} block={block} kind="added" />)}
          {changes.changed.map((block) => {
            const old = (proposal.before?.blocks ?? []).find((item) => item.id === block.id)
            return <DiffRow key={block.id} block={block} before={old} kind="changed" />
          })}
          {changes.removed.map((block) => <DiffRow key={block.id} block={block} kind="removed" />)}
          {changes.added.length + changes.changed.length + changes.removed.length === 0 && (
            <div className="rounded-xl border border-dashed px-4 py-8 text-center text-xs text-muted-foreground">
              {tr("No visible content changes")}
            </div>
          )}
        </div>

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

function DiffRow({ block, before, kind }: { block: Block; before?: Block; kind: "added" | "changed" | "removed" }) {
  const tone =
    kind === "added"
      ? "border-emerald-500/25 bg-emerald-500/5"
      : kind === "removed"
        ? "border-red-500/25 bg-red-500/5"
        : "border-amber-500/25 bg-amber-500/5"
  return (
    <div className={`rounded-xl border px-3 py-2.5 ${tone}`}>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>{block.type}</span>
        <span className="ml-auto">{kind === "added" ? "+" : kind === "removed" ? "−" : "±"}</span>
      </div>
      {kind === "changed" && before && (
        <div className="mt-1 whitespace-pre-wrap text-xs leading-5 text-red-700/80 line-through decoration-red-500/40 dark:text-red-300/80">{before.text || tr("Empty block")}</div>
      )}
      <div className="mt-1 whitespace-pre-wrap text-xs leading-5">{block.text || (block.type === "divider" ? "───" : tr("Empty block"))}</div>
    </div>
  )
}
