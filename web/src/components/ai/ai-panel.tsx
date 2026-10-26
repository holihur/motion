import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowUp,
  BookOpen,
  CircleStop,
  Loader2,
  Plus,
  RotateCcw,
  Settings2,
  Sparkles,
  Undo2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { AIChatMessage, Agent, AIProposal } from "@/lib/types"
import { cn, initials } from "@/lib/utils"
import { useAuthStore } from "@/stores/auth"
import { tr } from "@/lib/i18n"
import { markOnboardingStep } from "@/lib/onboarding"
import { useUIStore } from "@/stores/ui"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ProposalDialog } from "@/components/agents/proposal-dialog"

const QUICK_PROMPTS = [
  "Summarize this page in a few bullets",
  "Turn this page into action items",
  "Find gaps and suggest what to add",
  "Create a new page with a project brief",
]

export function AIPanel({
  open,
  onOpenChange,
  pageId,
  workspaceId,
  pageTitle,
  onUndoRevision,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pageId: string
  workspaceId: string
  pageTitle: string
  onUndoRevision?: (revisionId: string) => Promise<void>
}) {
  const user = useAuthStore((state) => state.user)
  const setSettingsOpen = useUIStore((state) => state.setSettingsOpen)
  const navigate = useNavigate()
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [model, setModel] = useState("")
  const [provider, setProvider] = useState("")
  const [agentsPageId, setAgentsPageId] = useState("")
  const [creatingAgents, setCreatingAgents] = useState(false)
  const [agents, setAgents] = useState<Agent[]>([])
  const [selectedAgentId, setSelectedAgentId] = useState("")
  const [proposals, setProposals] = useState<AIProposal[]>([])
  const [reviewingProposal, setReviewingProposal] = useState<AIProposal | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [reviewCount, setReviewCount] = useState(0)
  const [input, setInput] = useState("")
  const [pending, setPending] = useState(false)
  const [elapsed, setElapsed] = useState(0)
  const [messages, setMessages] = useState<AIChatMessage[]>(() => readChat(pageId))
  const scrollRef = useRef<HTMLDivElement>(null)
  const abortRef = useRef<AbortController | null>(null)

  useEffect(() => {
    if (!open) return
    api.ai
      .status(pageId)
      .then((status) => {
        setConfigured(status.configured)
        setModel(status.model)
        setProvider(status.providerLabel || status.provider)
        setAgentsPageId(status.agentsPageId ?? "")
      })
      .catch(() => setConfigured(false))
  }, [open, pageId])

  useEffect(() => {
    if (!open || !workspaceId) return
    api.agents
      .list(workspaceId)
      .then((items) => {
        setAgents(items)
        setSelectedAgentId((current) => {
          if (current && items.some((agent) => agent.id === current)) return current
          return (items.find((agent) => agent.isDefault) ?? items[0])?.id ?? ""
        })
      })
      .catch(() => setAgents([]))
  }, [open, workspaceId])

  useEffect(() => {
    setMessages(readChat(pageId))
    setProposals([])
    setReviewCount(0)
  }, [pageId])


  useEffect(() => {
    try {
      localStorage.setItem(`motion.ai.chat.${pageId}`, JSON.stringify(messages.slice(-40)))
    } catch {
      // Chat history is a convenience; storage may be unavailable.
    }
  }, [messages, pageId])

  useEffect(() => {
    if (!pending) return
    setElapsed(0)
    const timer = window.setInterval(() => setElapsed((value) => value + 1), 1000)
    return () => window.clearInterval(timer)
  }, [pending])

  async function createAgentsPage() {
    setCreatingAgents(true)
    try {
      const created = await api.ai.createAgentsPage(pageId)
      setAgentsPageId(created.pageId)
      toast.success(tr("AGENTS.md created"), {
        description: tr("Edit it to teach Motion AI how your workspace works."),
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create AGENTS.md")
    } finally {
      setCreatingAgents(false)
    }
  }

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" })
  }, [messages, pending])

  const selectedAgent =
    agents.find((agent) => agent.id === selectedAgentId) ?? agents[0]

  async function runChat(
    message: string,
    history: { role: string; content: string }[],
    base: AIChatMessage[],
  ) {
    const controller = new AbortController()
    abortRef.current = controller
    setPending(true)
    const assistantIndex = base.length
    setMessages([...base, { role: "assistant", content: "", streaming: true }])
    let partialText = ""
    try {
      const response = await api.ai.chatStream(
        {
          message,
          pageId,
          agentId: selectedAgent?.id,
          history,
          signal: controller.signal,
        },
        (text) => {
          partialText += text
          setMessages((current) =>
            current.map((item, index) =>
              index === assistantIndex
                ? { ...item, content: item.content + text, streaming: true }
                : item,
            ),
          )
        },
      )
      markOnboardingStep("ai")
      setMessages((current) =>
        current.map((item, index) =>
          index === assistantIndex
            ? {
                role: "assistant",
                content: response.reply,
                actions: response.actions,
                revisionId: response.revisionId,
              }
            : item,
        ),
      )
      if (response.proposals && response.proposals.length > 0) {
        setProposals(response.proposals)
        setReviewCount(response.proposals.length)
        window.dispatchEvent(new CustomEvent("motion:proposals-changed"))
        // Online users get the review request immediately, in context.
        // Inbox is the asynchronous/offline fallback and audit trail.
        if (navigator.onLine) {
          setReviewingProposal(response.proposals[0])
        } else {
          toast.success(tr("{n} AI change(s) waiting in Agent Inbox", { n: response.proposals.length }))
        }
      }
    } catch (error) {
      const partial = partialText
      if (error instanceof DOMException && error.name === "AbortError") {
        setMessages((current) =>
          current.map((item, index) =>
            index === assistantIndex
              ? { ...item, content: item.content || tr("Stopped."), stopped: true, streaming: false }
              : item,
          ),
        )
      } else {
        toast.error(error instanceof Error ? error.message : "The AI request failed")
        if (partial) {
          setMessages((current) =>
            current.map((item, index) =>
              index === assistantIndex ? { ...item, stopped: true, streaming: false } : item,
            ),
          )
        } else {
          setMessages(base)
          setInput(message)
        }
      }
    } finally {
      abortRef.current = null
      setPending(false)
    }
  }

  async function send(text?: string) {
    const message = (text ?? input).trim()
    if (!message || pending) return
    if (configured === false) {
      toast.error(tr("Configure your AI provider in Settings → AI first"))
      return
    }
    const history = messages.map((item) => ({ role: item.role, content: item.content }))
    const base: AIChatMessage[] = [...messages, { role: "user", content: message }]
    setMessages(base)
    setInput("")
    await runChat(message, history, base)
  }

  function stop() {
    abortRef.current?.abort()
  }

  async function regenerate() {
    if (pending) return
    const lastUser = [...messages].reverse().find((message) => message.role === "user")
    if (!lastUser) return
    const lastUserIndex = messages.lastIndexOf(lastUser)
    const base = messages.slice(0, lastUserIndex + 1)
    const history = messages
      .slice(0, lastUserIndex)
      .map((item) => ({ role: item.role, content: item.content }))
    setMessages(base)
    await runChat(lastUser.content, history, base)
  }

  async function undo(revisionId: string, index: number) {
    if (!onUndoRevision) return
    try {
      await onUndoRevision(revisionId)
      setMessages((current) =>
        current.map((message, position) =>
          position === index ? { ...message, undone: true } : message,
        ),
      )
      toast.success(tr("AI changes undone"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not undo AI changes"))
    }
  }

  async function reviewProposal(proposal: AIProposal, action: "approve" | "reject") {
    if (reviewing) return
    setReviewing(true)
    try {
      await (action === "approve" ? api.proposals.approve(proposal.id) : api.proposals.reject(proposal.id))
      toast.success(action === "approve" ? tr("AI changes applied") : tr("AI changes rejected"))
      const next = proposals.filter((item) => item.id !== proposal.id)
      setProposals(next)
      setReviewCount(next.length)
      setReviewingProposal(next[0] ?? null)
      window.dispatchEvent(new CustomEvent("motion:proposals-changed"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not review this proposal"))
    } finally {
      setReviewing(false)
    }
  }

  if (!open) return null

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[420px] flex-col border-l bg-background shadow-2xl animate-in slide-in-from-right duration-200 max-md:inset-x-0 max-md:bottom-0 max-md:top-auto max-md:h-[82svh] max-md:max-w-none max-md:rounded-t-2xl max-md:border-l-0 max-md:border-t">
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-lg brand-gradient text-white">
            <Sparkles className="size-3.5" />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-sm font-semibold leading-tight">
              <span>{selectedAgent?.icon || "✨"}</span>
              <span className="truncate">{selectedAgent?.name || tr("Motion AI")}</span>
              {selectedAgent?.mode === "approval" && (
                <span className="rounded-full border border-amber-500/30 bg-amber-500/10 px-1.5 py-0.5 text-[8px] font-medium uppercase tracking-wide text-amber-700 dark:text-amber-300">
                  {tr("Approval")}
                </span>
              )}
            </div>
            <div className="truncate text-[10px] text-muted-foreground">
              {configured ? `${provider || "BYOK"} · ${model || "AI"}` : tr("Reads & edits your pages")}
            </div>
          </div>
        </div>
        {agents.length > 1 && (
          <select
            value={selectedAgentId}
            onChange={(event) => setSelectedAgentId(event.target.value)}
            aria-label={tr("Agent")}
            className="mr-1 h-7 max-w-[120px] rounded-md border bg-background px-1.5 text-[10px] text-muted-foreground outline-none"
          >
            {agents.map((agent) => (
              <option key={agent.id} value={agent.id}>{agent.icon} {agent.name}</option>
            ))}
          </select>
        )}
        <button
          type="button"
          onClick={() => onOpenChange(false)}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label={tr("Close")}
        >
          <X className="size-4" />
        </button>
      </header>

      {configured && (
        <div className="flex items-center gap-2 border-b bg-muted/20 px-4 py-1.5 text-[10px] text-muted-foreground">
          <BookOpen className="size-3 text-brand" />
          <span className="flex-1 truncate">
            {agentsPageId ? tr("Using workspace instructions from AGENTS.md") : tr("No workspace AGENTS.md yet")}
          </span>
          {agentsPageId ? (
            <button
              type="button"
              onClick={() => navigate(`/page/${agentsPageId}`)}
              className="font-medium text-brand hover:underline"
            >
              Open
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void createAgentsPage()}
              disabled={creatingAgents}
              className="flex items-center gap-1 font-medium text-brand hover:underline disabled:opacity-50"
            >
              {creatingAgents ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />}
              Create
            </button>
          )}
        </div>
      )}

      {reviewCount > 0 && (
        <button
          type="button"
          onClick={() => setReviewingProposal(proposals[0] ?? null)}
          className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-left text-[11px] text-amber-900 transition hover:bg-amber-500/15 dark:text-amber-100"
        >
          <span className="flex size-5 items-center justify-center rounded-full bg-amber-500 text-white">✓</span>
          <span className="flex-1">{tr("{n} change(s) waiting for your review", { n: reviewCount })}</span>
          <span className="font-medium underline underline-offset-2">{tr("Review")}</span>
        </button>
      )}

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 thin-scrollbar">
        {configured === null ? (
          <div className="flex justify-center py-10 text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
          </div>
        ) : configured === false ? (
          <div className="mt-8 rounded-2xl border bg-card p-5 text-center">
            <div className="mx-auto flex size-11 items-center justify-center rounded-2xl brand-gradient text-white">
              <Sparkles className="size-5" />
            </div>
            <h3 className="mt-4 text-sm font-semibold">{tr("Bring your own AI key")}</h3>
            <p className="mt-1 text-xs leading-5 text-muted-foreground">
              {tr("Use DeepSeek, OpenAI, OpenRouter, Groq, Ollama or Gemini. Your API key is encrypted on your server and never sent to the browser.")}
            </p>
            <Button
              size="sm"
              className="mt-4 gap-1.5"
              onClick={() => {
                onOpenChange(false)
                setSettingsOpen(true)
              }}
            >
              <Settings2 className="size-3.5" /> Open AI settings
            </Button>
          </div>
        ) : messages.length === 0 ? (
          <div className="mt-4">
            <div className="flex items-start gap-2.5">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-full brand-gradient text-white">
                <Sparkles className="size-3.5" />
              </span>
              <div className="rounded-2xl rounded-tl-md bg-muted/70 px-3.5 py-2.5 text-[13px] leading-6">
                Hi {user?.name?.split(/\s+/)[0] || "there"} — I can answer questions about your
                workspace, follow your <span className="font-medium">AGENTS.md</span>, summarize{" "}
                <span className="font-medium">“{pageTitle || "this page"}”</span>, or create and edit
                pages for you. What should we do?
              </div>
            </div>
            <div className="mt-5 space-y-1.5">
              {[...QUICK_PROMPTS, "Write an AGENTS.md that describes this workspace"].map((prompt) => (
                <button
                  key={tr(prompt)}
                  type="button"
                  onClick={() => void send(prompt)}
                  className="flex w-full items-center gap-2 rounded-lg border border-border/70 px-3 py-2 text-left text-xs text-muted-foreground transition hover:border-brand/30 hover:bg-accent/50 hover:text-foreground"
                >
                  <Sparkles className="size-3 text-brand" />
                  {tr(prompt)}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {messages.map((message, index) =>
              message.role === "user" ? (
                <div key={index} className="flex items-start justify-end gap-2">
                  <div className="max-w-[85%] rounded-2xl rounded-tr-md bg-primary px-3.5 py-2 text-[13px] leading-6 text-primary-foreground">
                    {message.content}
                  </div>
                  <Avatar className="size-6">
                    <AvatarFallback>{initials(user?.name ?? "M")}</AvatarFallback>
                  </Avatar>
                </div>
              ) : (
                <div key={index} className="flex items-start gap-2">
                  <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full brand-gradient text-white">
                    <Sparkles className="size-3" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="whitespace-pre-wrap rounded-2xl rounded-tl-md bg-muted/60 px-3.5 py-2.5 text-[13px] leading-6">
                      {message.content}
                      {message.streaming && (
                        <span className="ml-0.5 inline-block h-3.5 w-1 animate-pulse rounded-full bg-brand align-middle" />
                      )}
                    </div>
                    {message.actions && message.actions.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        {message.actions.map((action, actionIndex) => (
                          <span
                            key={actionIndex}
                            className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-300"
                          >
                            ✓ {action}
                          </span>
                        ))}
                      </div>
                    )}
                    {(message.revisionId || message.stopped) && (
                      <div className="mt-2 flex flex-wrap items-center gap-1.5">
                        {message.revisionId && onUndoRevision && (
                          <button
                            type="button"
                            disabled={message.undone}
                            onClick={() => void undo(message.revisionId!, index)}
                            className="flex items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[10px] text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-50"
                          >
                            <Undo2 className="size-3" />
                            {message.undone ? tr("Changes undone") : tr("Undo AI changes")}
                          </button>
                        )}
                        {message.revisionId && (
                          <span className="text-[10px] text-muted-foreground/70">
                            {tr("A version was saved before this run.")}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ),
            )}
            {pending && !messages[messages.length - 1]?.content && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex size-6 items-center justify-center rounded-full brand-gradient text-white">
                  <Sparkles className="size-3" />
                </span>
                <span className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5">
                  <Loader2 className="size-3 animate-spin" /> {tr("Thinking & working…")}
                  {elapsed > 0 && <span className="tabular-nums opacity-60">{elapsed}s</span>}
                </span>
                <button
                  type="button"
                  onClick={stop}
                  className="flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] transition hover:bg-accent"
                >
                  <CircleStop className="size-3" /> {tr("Stop")}
                </button>
              </div>
            )}
            {!pending && messages.some((message) => message.role === "assistant" && !message.stopped) && (
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={() => void regenerate()}
                  className="flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] text-muted-foreground transition hover:bg-accent hover:text-foreground"
                >
                  <RotateCcw className="size-3" /> {tr("Regenerate")}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t p-3">
        <div className="flex items-end gap-1.5 rounded-xl border bg-background p-1.5 focus-within:ring-2 focus-within:ring-ring/20">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                void send()
              }
            }}
            rows={1}
            placeholder={configured === false ? tr("Add your API key to start…") : tr("Ask about your documents…")}
            disabled={configured === false}
            className="max-h-32 min-h-8 flex-1 resize-none bg-transparent px-2 py-1.5 text-[13px] outline-none placeholder:text-muted-foreground/60 disabled:opacity-60"
          />
          <Button
            size="icon-sm"
            className="mb-0.5 rounded-lg"
            onClick={() => (pending ? stop() : void send())}
            disabled={!pending && (!input.trim() || configured !== true)}
            aria-label={pending ? tr("Stop") : tr("Send message")}
          >
            {pending ? <CircleStop className="size-3.5" /> : <ArrowUp className="size-3.5" />}
          </Button>
        </div>
        <p className="mt-1.5 px-1 text-[9px] text-muted-foreground/70">
          {selectedAgent?.mode === "approval"
            ? tr("Changes are staged for approval in Agent Inbox before they are applied.")
            : tr("Motion AI can make changes to your workspace. Review important edits.")}
        </p>
      </div>
      <ProposalDialog
        proposal={reviewingProposal}
        onOpenChange={(next) => {
          if (!next) setReviewingProposal(null)
        }}
        onReview={reviewProposal}
        reviewing={reviewing}
      />
    </aside>
  )
}


function readChat(pageId: string): AIChatMessage[] {
  try {
    const raw = localStorage.getItem(`motion.ai.chat.${pageId}`)
    if (!raw) return []
    const parsed = JSON.parse(raw) as AIChatMessage[]
    return Array.isArray(parsed)
      ? parsed.slice(-40).map((message) => ({ ...message, streaming: false }))
      : []
  } catch {
    return []
  }
}
