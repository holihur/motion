import { useState } from "react"
import { useLocation } from "react-router-dom"
import { Bug, Lightbulb, MessageSquarePlus, Send } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { tr } from "@/lib/i18n"
import { useWorkspaceStore } from "@/stores/workspace"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"

function clientInfo() {
  const ua = navigator.userAgent
  const navigatorWithData = navigator as Navigator & { userAgentData?: { platform?: string } }
  const platform = navigatorWithData.userAgentData?.platform || navigator.platform || ""
  let os = platform || "Unknown"
  if (/Win/i.test(platform) || /Windows NT/i.test(ua)) os = "Windows"
  else if (/Mac/i.test(platform) || /Mac OS X/i.test(ua)) os = "macOS"
  else if (/Android/i.test(ua)) os = "Android"
  else if (/iPhone|iPad|iPod/i.test(ua)) os = "iOS"
  else if (/Linux/i.test(platform) || /Linux/i.test(ua)) os = "Linux"

  let browser = "Unknown"
  const patterns: [RegExp, string][] = [
    [/Edg\/([\d.]+)/, "Edge"],
    [/OPR\/([\d.]+)/, "Opera"],
    [/Chrome\/([\d.]+)/, "Chrome"],
    [/Firefox\/([\d.]+)/, "Firefox"],
    [/Version\/([\d.]+).*Safari/, "Safari"],
  ]
  for (const [pattern, name] of patterns) {
    const match = ua.match(pattern)
    if (match) {
      browser = `${name} ${match[1].split(".")[0]}`
      break
    }
  }
  return {
    os,
    browser,
    language: navigator.language || "",
    viewport: `${window.innerWidth}×${window.innerHeight}`,
  }
}

export function FeedbackButton() {
  const location = useLocation()
  const activeId = useWorkspaceStore((state) => state.activeId)
  const pages = useWorkspaceStore((state) => state.pages)
  const [open, setOpen] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [category, setCategory] = useState("feedback")
  const [sending, setSending] = useState(false)
  const pageId = /^\/page\/([a-f0-9]+)/.exec(location.pathname)?.[1] ?? ""
  const pageTitle = pages.find((page) => page.id === pageId)?.title ?? ""

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!activeId || sending) return
    if (!title.trim() || !description.trim()) {
      toast.error(tr("Please fill in a title and description"))
      return
    }
    setSending(true)
    try {
      const info = clientInfo()
      const result = await api.feedback.create(activeId, {
        title: title.trim(),
        description: description.trim(),
        category,
        pageId: pageId || undefined,
        url: window.location.href,
        ...info,
      })
      toast.success(tr("Feedback issue created"), {
        description: result.url,
        action: { label: tr("Open issue"), onClick: () => window.open(result.url, "_blank", "noopener") },
      })
      setOpen(false)
      setTitle("")
      setDescription("")
      setCategory("feedback")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not create feedback issue"))
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={tr("Send feedback")}
        className="fixed bottom-20 right-4 z-40 flex h-10 items-center gap-1.5 rounded-full border border-border/70 bg-background/95 px-3 text-xs font-medium text-muted-foreground shadow-lg backdrop-blur transition hover:border-brand/40 hover:bg-brand-soft/30 hover:text-foreground md:bottom-5 md:right-5"
      >
        <MessageSquarePlus className="size-4" />
        <span className="hidden sm:inline">{tr("Feedback")}</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <MessageSquarePlus className="size-4 text-brand" /> {tr("Send feedback")}
            </DialogTitle>
            <DialogDescription>
              {tr("Creates an issue in the Git repository configured in Settings → Integrations → Git Pages publishing. Your Git token stays on the server.")}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-3">
            <div className="flex gap-1 rounded-lg bg-muted/40 p-1">
              {[
                { id: "feedback", label: tr("Feedback"), icon: MessageSquarePlus },
                { id: "bug", label: tr("Bug"), icon: Bug },
                { id: "idea", label: tr("Idea"), icon: Lightbulb },
              ].map((item) => {
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setCategory(item.id)}
                    aria-pressed={category === item.id}
                    className={`flex flex-1 items-center justify-center gap-1.5 rounded-md px-2 py-1.5 text-[11px] font-medium transition ${category === item.id ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <Icon className="size-3.5" /> {item.label}
                  </button>
                )
              })}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="feedback-title">{tr("Title")}</Label>
              <Input id="feedback-title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder={tr("What should we improve?")} maxLength={200} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="feedback-description">{tr("Description")}</Label>
              <textarea
                id="feedback-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder={tr("What happened, and what did you expect?")}
                rows={5}
                maxLength={10000}
                className="w-full resize-y rounded-md border bg-background px-2.5 py-2 text-xs leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
              />
            </div>
            {(pageTitle || pageId) && (
              <p className="rounded-lg bg-muted/40 px-2.5 py-1.5 text-[11px] text-muted-foreground">
                {tr("Page context will be included: {page}", { page: pageTitle || pageId })}
              </p>
            )}
            <div className="text-[11px] leading-5 text-muted-foreground">
              {tr("Configure GitHub / GitLab / Gitea authorization in Settings → Integrations → Git Pages publishing, including issue write permission.")}
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setOpen(false)}>{tr("Cancel")}</Button>
              <Button type="submit" disabled={sending} className="gap-1.5">
                <Send className="size-3.5" /> {sending ? tr("Submitting…") : tr("Submit feedback")}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  )
}
