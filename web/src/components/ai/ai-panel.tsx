import { useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowUp, BookOpen, Loader2, Plus, Settings2, Sparkles, X } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { AIChatMessage } from "@/lib/types"
import { cn, initials } from "@/lib/utils"
import { useAuthStore } from "@/stores/auth"
import { tr } from "@/lib/i18n"
import { useUIStore } from "@/stores/ui"
import { Button } from "@/components/ui/button"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"

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
  pageTitle,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pageId: string
  pageTitle: string
}) {
  const user = useAuthStore((state) => state.user)
  const setSettingsOpen = useUIStore((state) => state.setSettingsOpen)
  const navigate = useNavigate()
  const [configured, setConfigured] = useState<boolean | null>(null)
  const [model, setModel] = useState("")
  const [provider, setProvider] = useState("")
  const [agentsPageId, setAgentsPageId] = useState("")
  const [creatingAgents, setCreatingAgents] = useState(false)
  const [input, setInput] = useState("")
  const [pending, setPending] = useState(false)
  const [messages, setMessages] = useState<AIChatMessage[]>([])
  const scrollRef = useRef<HTMLDivElement>(null)

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

  async function send(text?: string) {
    const message = (text ?? input).trim()
    if (!message || pending) return
    if (configured === false) {
      toast.error(tr("Configure your AI provider in Settings → AI first"))
      return
    }
    const history = messages.map((item) => ({ role: item.role, content: item.content }))
    const nextMessages: AIChatMessage[] = [...messages, { role: "user", content: message }]
    setMessages(nextMessages)
    setInput("")
    setPending(true)
    try {
      const response = await api.ai.chat({ message, pageId, history })
      setMessages([
        ...nextMessages,
        { role: "assistant", content: response.reply, actions: response.actions },
      ])
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "The AI request failed")
      setMessages(messages)
      setInput(message)
    } finally {
      setPending(false)
    }
  }

  if (!open) return null

  return (
    <aside className="fixed inset-y-0 right-0 z-40 flex w-full max-w-[420px] flex-col border-l bg-background shadow-2xl animate-in slide-in-from-right duration-200">
      <header className="flex h-12 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <span className="flex size-6 items-center justify-center rounded-lg brand-gradient text-white">
            <Sparkles className="size-3.5" />
          </span>
          <div>
            <div className="text-sm font-semibold leading-tight">{tr("Motion AI")}</div>
            <div className="text-[10px] text-muted-foreground">
              {configured ? `${provider || "BYOK"} · ${model || "AI"}` : tr("Reads & edits your pages")}
            </div>
          </div>
        </div>
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
                  </div>
                </div>
              ),
            )}
            {pending && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span className="flex size-6 items-center justify-center rounded-full brand-gradient text-white">
                  <Sparkles className="size-3" />
                </span>
                <span className="flex items-center gap-1.5 rounded-full bg-muted px-3 py-1.5">
                  <Loader2 className="size-3 animate-spin" /> Thinking & working…
                </span>
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
            onClick={() => void send()}
            disabled={!input.trim() || pending || configured !== true}
            aria-label={tr("Send message")}
          >
            {pending ? <Loader2 className="size-3.5 animate-spin" /> : <ArrowUp className="size-3.5" />}
          </Button>
        </div>
        <p className="mt-1.5 px-1 text-[9px] text-muted-foreground/70">
          {tr("Motion AI can make changes to your workspace. Review important edits.")}
        </p>
      </div>
    </aside>
  )
}
