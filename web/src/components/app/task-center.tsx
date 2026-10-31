import { useState } from "react"
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, X, XCircle } from "lucide-react"
import { useTasksStore } from "@/stores/tasks"
import { tr } from "@/lib/i18n"

/** 右下角迷你任务中心：长任务进度常驻，不随 dialog 关闭丢失。 */
export function TaskCenter() {
  const tasks = useTasksStore((s) => s.tasks)
  const dismiss = useTasksStore((s) => s.dismiss)
  const clearFinished = useTasksStore((s) => s.clearFinished)
  const [folded, setFolded] = useState(false)
  if (tasks.length === 0) return null
  const running = tasks.filter((t) => t.status === "running").length

  return (
    <div className="fixed bottom-4 right-4 z-50 w-72 overflow-hidden rounded-xl border bg-popover shadow-2xl animate-in slide-in-from-bottom-2" role="status" aria-live="polite">
      <button
        type="button"
        onClick={() => setFolded((v) => !v)}
        className="flex w-full items-center gap-2 px-3 py-2 text-xs font-medium hover:bg-accent/50"
      >
        {running > 0 ? <Loader2 className="size-3.5 animate-spin text-brand" /> : <CheckCircle2 className="size-3.5 text-emerald-500" />}
        {running > 0 ? tr("{n} task(s) running", { n: running }) : tr("Tasks")}
        <span className="ml-auto text-muted-foreground">{folded ? <ChevronUp className="size-3.5" /> : <ChevronDown className="size-3.5" />}</span>
      </button>
      {!folded && (
        <div className="max-h-64 space-y-1.5 overflow-y-auto px-2 pb-2 thin-scrollbar">
          {tasks.map((t) => (
            <div key={t.id} className="rounded-lg border bg-background px-2.5 py-2">
              <div className="flex items-center gap-1.5 text-[11px]">
                {t.status === "running" && <Loader2 className="size-3 animate-spin text-brand" />}
                {t.status === "done" && <CheckCircle2 className="size-3 text-emerald-500" />}
                {t.status === "error" && <XCircle className="size-3 text-destructive" />}
                <span className="min-w-0 flex-1 truncate font-medium">{t.label}</span>
                {t.status !== "running" && (
                  <button type="button" onClick={() => dismiss(t.id)} aria-label={tr("Dismiss")} className="rounded p-0.5 text-muted-foreground hover:bg-accent">
                    <X className="size-3" />
                  </button>
                )}
              </div>
              {t.status === "running" && (
                t.progress === null ? (
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full w-1/3 animate-pulse rounded-full bg-brand" />
                  </div>
                ) : (
                  <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${t.progress}%` }} />
                  </div>
                )
              )}
              {t.detail && <div className="mt-1 line-clamp-2 text-[10px] leading-4 text-muted-foreground">{t.detail}</div>}
            </div>
          ))}
          {tasks.some((t) => t.status !== "running") && (
            <button type="button" onClick={clearFinished} className="w-full rounded-md py-1 text-[11px] text-muted-foreground hover:bg-accent">
              {tr("Clear finished")}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
