import { useMemo, useState } from "react"
import { BarChart3, Check, Loader2, Lock, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { tr } from "@/lib/i18n"
import type { Block, PollData } from "@/lib/types"
import { uid } from "@/lib/utils"
import { useAuthStore } from "@/stores/auth"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"

function defaultPoll(): PollData {
  return {
    question: "",
    options: [
      { id: uid(), text: "", votes: [] },
      { id: uid(), text: "", votes: [] },
    ],
    multiple: false,
    showResults: true,
    closed: false,
  }
}

export function PollBlock({ block, pageId, readOnly, autoFocus, onUpdate }: {
  block: Block
  pageId: string
  readOnly: boolean
  autoFocus?: boolean
  onUpdate: (patch: Partial<Block>) => void
}) {
  const userId = useAuthStore((s) => s.user?.id)
  const poll: PollData = block.poll ?? defaultPoll()
  const [picked, setPicked] = useState<string[]>([])
  const [voting, setVoting] = useState(false)

  const total = useMemo(() => poll.options.reduce((sum, o) => sum + (o.votes?.length ?? 0), 0), [poll.options])
  const myVotes = useMemo(
    () => new Set(poll.options.filter((o) => (o.votes ?? []).includes(userId ?? "")).map((o) => o.id)),
    [poll.options, userId],
  )
  const max = Math.max(1, ...poll.options.map((o) => o.votes?.length ?? 0))
  const voted = myVotes.size > 0
  const showResults = poll.showResults || voted || poll.closed || readOnly

  function setOptions(options: PollData["options"]) {
    onUpdate({ poll: { ...poll, options } })
  }

  async function vote(ids: string[]) {
    if (voting || poll.closed) return
    setVoting(true)
    try {
      const updated = await api.pages.vote(pageId, block.id, ids)
      if (updated.poll) onUpdate({ poll: updated.poll })
      setPicked([])
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Could not vote"))
    } finally {
      setVoting(false)
    }
  }

  function togglePick(id: string) {
    if (poll.multiple) {
      setPicked((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
    } else {
      void vote([id])
    }
  }

  // 发起人编辑态：问题为空且无投票时
  const editing = !readOnly && !poll.question && total === 0 && !poll.closed

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-border/80 bg-card">
      <div className="flex items-center gap-1.5 border-b border-border/60 px-2.5 py-1.5 text-[10px] text-muted-foreground">
        <BarChart3 className="size-3.5 text-brand" />
        <span className="font-semibold uppercase tracking-wider">{tr("Poll")}</span>
        {poll.closed && (
          <span className="flex items-center gap-0.5 rounded-full bg-muted px-1.5 py-0.5 text-[10px]"><Lock className="size-2.5" />{tr("Closed")}</span>
        )}
        <span className="ml-auto tabular-nums">{tr("{n} vote(s)", { n: total })}</span>
      </div>
      <div className="space-y-2.5 p-3">
        {editing ? (
          <div className="space-y-2">
            <div className="space-y-1.5">
              <Label>{tr("Question")}</Label>
              <Input
                autoFocus={autoFocus}
                value={poll.question}
                onChange={(e) => onUpdate({ poll: { ...poll, question: e.target.value } })}
                placeholder={tr("What should we decide?")}
                className="h-9"
              />
            </div>
            <div className="space-y-1.5">
              <Label>{tr("Options")}</Label>
              {poll.options.map((opt, i) => (
                <div key={opt.id} className="flex gap-1.5">
                  <Input
                    value={opt.text}
                    onChange={(e) => setOptions(poll.options.map((o, k) => (k === i ? { ...o, text: e.target.value } : o)))}
                    placeholder={`${tr("Option")} ${i + 1}`}
                    className="h-8 text-xs"
                  />
                  {poll.options.length > 2 && (
                    <Button variant="ghost" size="sm" className="h-8 w-8 shrink-0 p-0 text-muted-foreground hover:text-destructive" onClick={() => setOptions(poll.options.filter((_, k) => k !== i))}>
                      <Trash2 className="size-3.5" />
                    </Button>
                  )}
                </div>
              ))}
              {poll.options.length < 10 && (
                <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={() => setOptions([...poll.options, { id: uid(), text: "", votes: [] }])}>
                  <Plus className="size-3" /> {tr("Add option")}
                </Button>
              )}
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-2 pt-1">
              <label className="flex cursor-pointer items-center gap-1.5 text-xs">
                <Switch checked={!!poll.multiple} onCheckedChange={(v) => onUpdate({ poll: { ...poll, multiple: v } })} />
                {tr("Multiple choice")}
              </label>
              <label className="flex cursor-pointer items-center gap-1.5 text-xs">
                <Switch checked={!!poll.showResults} onCheckedChange={(v) => onUpdate({ poll: { ...poll, showResults: v } })} />
                {tr("Show results before voting")}
              </label>
            </div>
            {poll.question.trim() && poll.options.some((o) => o.text.trim()) && (
              <p className="text-[11px] text-muted-foreground">{tr("Saved — voters will see it right away.")}</p>
            )}
          </div>
        ) : (
          <>
            {poll.question && <div className="text-sm font-semibold">{poll.question}</div>}
            <div className="space-y-1.5">
              {poll.options.map((opt) => {
                const votes = opt.votes?.length ?? 0
                const mine = myVotes.has(opt.id)
                const pickedNow = picked.includes(opt.id)
                const checked = poll.multiple ? pickedNow || (mine && picked.length === 0) : mine
                return (
                  <div key={opt.id}>
                    {!showResults && !poll.closed ? (
                      <button
                        type="button"
                        disabled={readOnly || poll.closed || voting}
                        onClick={() => togglePick(opt.id)}
                        className={`flex w-full items-center gap-2 rounded-lg border px-2.5 py-2 text-left text-xs transition ${checked ? "border-brand bg-brand-soft/40" : "hover:bg-accent/50"}`}
                      >
                        <span className={`flex size-4 shrink-0 items-center justify-center rounded-full border ${checked ? "border-brand bg-brand text-white" : "border-muted-foreground/40"}`}>
                          {checked && <Check className="size-2.5" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate">{opt.text || tr("Option")}</span>
                      </button>
                    ) : (
                      <div className={`rounded-lg border px-2.5 py-2 ${mine ? "border-brand/50 bg-brand-soft/20" : ""}`}>
                        <div className="flex items-center gap-2 text-xs">
                          <span className="min-w-0 flex-1 truncate font-medium">{opt.text || tr("Option")}</span>
                          {mine && <Check className="size-3 shrink-0 text-brand" />}
                          <span className="shrink-0 tabular-nums text-muted-foreground">{votes}</span>
                        </div>
                        <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${(votes / max) * 100}%` }} />
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              {!readOnly && !poll.closed && poll.multiple && (
                <Button size="sm" className="h-7 gap-1 text-[11px]" disabled={voting || picked.length === 0} onClick={() => void vote(picked)}>
                  {voting && <Loader2 className="size-3 animate-spin" />}
                  {voted ? tr("Change vote") : tr("Vote")}
                </Button>
              )}
              {!readOnly && !poll.closed && !poll.multiple && voted && (
                <span className="text-[11px] text-muted-foreground">{tr("Tap another option to change your vote")}</span>
              )}
              {!readOnly && (
                <button
                  type="button"
                  onClick={() => onUpdate({ poll: { ...poll, closed: !poll.closed } })}
                  className="ml-auto rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  {poll.closed ? tr("Reopen") : tr("Close poll")}
                </button>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  )
}
