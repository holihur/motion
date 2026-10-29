import { useEffect, useState } from "react"
import { Loader2, MessageSquarePlus } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { tr } from "@/lib/i18n"
import { isImeKeyEvent } from "@/lib/keyboard"
import { markOnboardingStep } from "@/lib/onboarding"
import { Button } from "@/components/ui/button"
import { MentionTextarea } from "@/components/comments/mention-input"
import type { Member } from "@/lib/types"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export interface CommentSelection {
  blockId: string
  quote: string
  startOffset: number
  endOffset: number
}

export function CommentComposer({
  open,
  onOpenChange,
  pageId,
  selection,
  onCreated,
  members = [],
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pageId: string
  selection: CommentSelection | null
  onCreated: () => void
  members?: Member[]
}) {
  const [body, setBody] = useState("")
  const [mentionIds, setMentionIds] = useState<string[]>([])
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (open) {
      setBody("")
      setMentionIds([])
    }
  }, [open])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!selection || !body.trim() || pending) return
    setPending(true)
    try {
      await api.pages.createComment(pageId, {
        blockId: selection.blockId,
        quote: selection.quote,
        startOffset: selection.startOffset,
        endOffset: selection.endOffset,
        body: body.trim(),
        mentions: mentionIds,
      })
      markOnboardingStep("comment")
      toast.success(tr("Comment added"))
      onCreated()
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not add comment")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquarePlus className="size-4 text-brand" /> {tr("Add a comment")}
          </DialogTitle>
          <DialogDescription>{tr("Leave a note for your collaborators.")}</DialogDescription>
        </DialogHeader>
        {selection && (
          <div className="max-h-24 overflow-y-auto rounded-lg border-l-2 border-brand bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground thin-scrollbar">
            {selection.quote ? `“${selection.quote}”` : tr("Comment on this block")}
          </div>
        )}
        <form onSubmit={submit} className="space-y-3">
          <MentionTextarea
            autoFocus
            members={members}
            value={body}
            onChange={(value, ids) => {
              setBody(value)
              setMentionIds(ids)
            }}
            placeholder={tr("Write a comment… (type @ to mention)")}
            rows={4}
            className="w-full resize-none rounded-lg border bg-transparent px-3 py-2 text-sm outline-none placeholder:text-muted-foreground/60 focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/20"
            onKeyDown={(event) => {
              if (isImeKeyEvent(event)) return
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault()
                void submit(event)
              }
            }}
          />
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!body.trim() || pending}>
              {pending && <Loader2 className="size-4 animate-spin" />}
              {tr("Comment")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
