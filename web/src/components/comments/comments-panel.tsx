import { useMemo, useState } from "react"
import { CheckCheck, MessageSquare, MessageSquareReply, RotateCcw, Send, Trash2, X } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { Comment } from "@/lib/types"
import { cn, formatRelative, initials } from "@/lib/utils"
import { useAuthStore } from "@/stores/auth"
import { tr } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function CommentsPanel({
  open,
  onOpenChange,
  pageId,
  comments,
  loading,
  readOnly = false,
  onReload,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pageId: string
  comments: Comment[]
  loading: boolean
  readOnly?: boolean
  onReload: () => void
}) {
  const user = useAuthStore((state) => state.user)
  const [replyTo, setReplyTo] = useState<string | null>(null)
  const [replyBody, setReplyBody] = useState("")
  const [showResolved, setShowResolved] = useState(false)
  const [pending, setPending] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState<Comment | null>(null)

  const { threads, resolved } = useMemo(() => {
    const roots = comments.filter((comment) => !comment.parentId)
    const openThreads = roots
      .filter((comment) => !comment.resolved)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    const resolvedThreads = roots
      .filter((comment) => comment.resolved)
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    return { threads: openThreads, resolved: resolvedThreads }
  }, [comments])

  function repliesFor(id: string) {
    return comments
      .filter((comment) => comment.parentId === id)
      .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  }

  async function submitReply(rootId: string) {
    if (!replyBody.trim() || pending) return
    setPending(true)
    try {
      await api.pages.createComment(pageId, {
        blockId: "",
        quote: "",
        startOffset: 0,
        endOffset: 0,
        body: replyBody.trim(),
        parentId: rootId,
      })
      setReplyBody("")
      setReplyTo(null)
      onReload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not reply")
    } finally {
      setPending(false)
    }
  }

  async function toggleResolved(comment: Comment) {
    try {
      await api.pages.updateComment(comment.id, { resolved: !comment.resolved })
      onReload()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not update comment")
    }
  }

  async function removeComment() {
    if (!deleteTarget) return
    setPending(true)
    try {
      await api.pages.deleteComment(deleteTarget.id)
      setDeleteTarget(null)
      onReload()
      toast.success(tr("Comment deleted"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete comment")
    } finally {
      setPending(false)
    }
  }

  function jumpToBlock(comment: Comment) {
    window.dispatchEvent(
      new CustomEvent("motion:scroll-block", { detail: { id: comment.blockId } }),
    )
    const row = document.querySelector<HTMLElement>(`[data-block-id="${comment.blockId}"]`)
    if (!row) return
    row.scrollIntoView({ behavior: "smooth", block: "center" })
    row.classList.add("ring-2", "ring-brand/30", "rounded-lg")
    window.setTimeout(() => row.classList.remove("ring-2", "ring-brand/30", "rounded-lg"), 1600)
  }

  if (!open) return null

  return (
    <aside aria-label="Comments panel" className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[380px] flex-col border-l bg-background shadow-2xl animate-in slide-in-from-right duration-200 max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:h-[78svh] max-md:max-w-none max-md:rounded-t-2xl max-md:border-l-0 max-md:border-t">
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <MessageSquare className="size-4 text-brand" />
          {tr("Comments")}
          <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
            {threads.length} open
          </span>
        </div>
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={tr("Close comments")}
        >
          <X className="size-4" />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4 thin-scrollbar">
        {loading && comments.length === 0 ? (
          <div className="space-y-3">
            {[0, 1, 2].map((item) => (
              <div key={item} className="h-24 animate-pulse rounded-xl bg-muted/60" />
            ))}
          </div>
        ) : threads.length === 0 ? (
          <div className="mt-16 text-center">
            <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted">
              <MessageSquare className="size-5 text-muted-foreground" />
            </div>
            <h3 className="mt-4 text-sm font-medium">{tr("No open comments")}</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {tr("Select any text on the page and choose Comment to start a thread.")}
            </p>
          </div>
        ) : (
          <div className="space-y-5">
            {threads.map((comment) => (
              <Thread
                key={comment.id}
                comment={comment}
                replies={repliesFor(comment.id)}
                currentUserId={user?.id}
                replyOpen={replyTo === comment.id}
                replyBody={replyBody}
                pending={pending}
                onReplyOpen={() => {
                  setReplyTo(replyTo === comment.id ? null : comment.id)
                  setReplyBody("")
                }}
                onReplyChange={setReplyBody}
                onReplySubmit={() => void submitReply(comment.id)}
                onResolve={() => void toggleResolved(comment)}
                onDelete={() => setDeleteTarget(comment)}
                onQuoteClick={() => jumpToBlock(comment)}
                readOnly={readOnly}
              />
            ))}
          </div>
        )}

        {resolved.length > 0 && (
          <div className="mt-6 border-t pt-4">
            <button
              type="button"
              onClick={() => setShowResolved((value) => !value)}
              className="flex w-full items-center justify-between text-xs font-medium text-muted-foreground hover:text-foreground"
            >
              <span className="flex items-center gap-1.5">
                <CheckCheck className="size-3.5" /> {tr("Resolved")} ({resolved.length})
              </span>
              <span>{showResolved ? "Hide" : "Show"}</span>
            </button>
            {showResolved && (
              <div className="mt-3 space-y-3 opacity-70">
                {resolved.map((comment) => (
                  <Thread
                    key={comment.id}
                    comment={comment}
                    replies={repliesFor(comment.id)}
                    currentUserId={user?.id}
                    replyOpen={false}
                    replyBody=""
                    pending={pending}
                    onReplyOpen={() => undefined}
                    onReplyChange={() => undefined}
                    onReplySubmit={() => undefined}
                    onResolve={() => void toggleResolved(comment)}
                    onDelete={() => setDeleteTarget(comment)}
                    onQuoteClick={() => jumpToBlock(comment)}
                    resolved
                    readOnly={readOnly}
                  />
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      <Dialog open={!!deleteTarget} onOpenChange={(value) => !value && setDeleteTarget(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>{tr("Delete")} this comment?</DialogTitle>
            <DialogDescription>{tr("Any replies in the thread will be removed too.")}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteTarget(null)}>{tr("Cancel")}</Button>
            <Button variant="destructive" disabled={pending} onClick={() => void removeComment()}>
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </aside>
  )
}

function Thread({
  comment,
  replies,
  currentUserId,
  replyOpen,
  replyBody,
  pending,
  onReplyOpen,
  onReplyChange,
  onReplySubmit,
  onResolve,
  onDelete,
  onQuoteClick,
  resolved,
  readOnly = false,
}: {
  comment: Comment
  replies: Comment[]
  currentUserId?: string
  replyOpen: boolean
  replyBody: string
  pending: boolean
  onReplyOpen: () => void
  onReplyChange: (value: string) => void
  onReplySubmit: () => void
  onResolve: () => void
  onDelete: () => void
  onQuoteClick: () => void
  resolved?: boolean
  readOnly?: boolean
}) {
  return (
    <div className={cn("rounded-xl border border-border/70 bg-card p-3", resolved && "bg-muted/20")}>
      <button
        type="button"
        onClick={onQuoteClick}
        className="mb-2 flex w-full items-center gap-1.5 truncate rounded border-l-2 border-brand/60 bg-brand-soft/30 px-2 py-1 text-left text-[11px] italic text-muted-foreground hover:bg-brand-soft/50"
      >
        {comment.quote ? <span className="truncate">“{comment.quote}”</span> : <><MessageSquare className="size-3 shrink-0" /> {tr("On this block")}</>}
      </button>
      <div className="flex items-start gap-2">
        <Avatar className="size-6">
          <AvatarFallback>{initials(comment.authorName || "?")}</AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate text-xs font-medium">{comment.authorName || "Someone"}</span>
            <span className="shrink-0 text-[10px] text-muted-foreground">{formatRelative(comment.createdAt)}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-[13px] leading-5">{comment.body}</p>
          <div className="mt-2 flex items-center gap-1">
            {!resolved && !readOnly && (
              <button
                type="button"
                onClick={onReplyOpen}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
              >
                <MessageSquareReply className="size-3" /> Reply
              </button>
            )}
            {!readOnly && <button
              type="button"
              onClick={onResolve}
              className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
            >
              {resolved ? <RotateCcw className="size-3" /> : <CheckCheck className="size-3" />}
              {resolved ? tr("Reopen") : tr("Resolve")}
            </button>}
            {!readOnly && comment.authorId === currentUserId && (
              <button
                type="button"
                onClick={onDelete}
                className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="size-3" /> Delete
              </button>
            )}
          </div>
        </div>
      </div>

      {replies.length > 0 && (
        <div className="mt-3 space-y-2 border-l border-border/70 pl-3">
          {replies.map((reply) => (
            <div key={reply.id} className="flex items-start gap-2">
              <Avatar className="size-5">
                <AvatarFallback className="text-[8px]">{initials(reply.authorName || "?")}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="truncate text-[11px] font-medium">{reply.authorName}</span>
                  <span className="shrink-0 text-[10px] text-muted-foreground">{formatRelative(reply.createdAt)}</span>
                </div>
                <p className="whitespace-pre-wrap text-xs leading-5">{reply.body}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {replyOpen && !readOnly && (
        <div className="mt-2 flex items-center gap-1.5">
          <input
            autoFocus
            value={replyBody}
            onChange={(event) => onReplyChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault()
                onReplySubmit()
              }
            }}
            placeholder={tr("Reply…")}
            className="h-8 min-w-0 flex-1 rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
          />
          <Button size="icon-sm" onClick={onReplySubmit} disabled={!replyBody.trim() || pending} aria-label={tr("Send reply")}>
            <Send className="size-3.5" />
          </Button>
        </div>
      )}
    </div>
  )
}
