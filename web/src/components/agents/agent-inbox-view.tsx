import { useCallback, useEffect, useMemo, useState } from "react"
import {
  Bot,
  Check,
  Clock3,
  Inbox,
  Loader2,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { Agent, AgentMode, AIProposal, AuditLog } from "@/lib/types"
import { formatRelative } from "@/lib/utils"
import { tr } from "@/lib/i18n"
import { useWorkspaceStore } from "@/stores/workspace"
import { SidebarToggle } from "@/components/app/sidebar-toggle"
import { diffBlocks, ProposalDialog } from "@/components/agents/proposal-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { Skeleton } from "@/components/ui/skeleton"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

type Tab = "pending" | "all" | "agents" | "activity"

export function AgentInboxView() {
  const activeId = useWorkspaceStore((state) => state.activeId)
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const refreshPages = useWorkspaceStore((state) => state.refreshPages)
  const [tab, setTab] = useState<Tab>("pending")
  const [proposals, setProposals] = useState<AIProposal[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<AIProposal | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [agentDialog, setAgentDialog] = useState<{ open: boolean; agent?: Agent }>({ open: false })
  const workspace = workspaces.find((item) => item.id === activeId)

  const load = useCallback(async () => {
    if (!activeId) return
    setLoading(true)
    try {
      const [nextProposals, nextAgents, nextLogs] = await Promise.all([
        api.proposals.list(activeId),
        api.agents.list(activeId),
        api.audit.list(activeId),
      ])
      setProposals(nextProposals)
      setAgents(nextAgents)
      setLogs(nextLogs)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not load Agent Inbox"))
    } finally {
      setLoading(false)
    }
  }, [activeId])

  useEffect(() => {
    void load()
  }, [load])

  useEffect(() => {
    function refresh() {
      void load()
    }
    window.addEventListener("motion:proposals-changed", refresh)
    return () => window.removeEventListener("motion:proposals-changed", refresh)
  }, [load])

  const pending = useMemo(() => proposals.filter((item) => item.status === "pending"), [proposals])

  async function review(proposal: AIProposal, action: "approve" | "reject") {
    if (reviewing) return
    setReviewing(true)
    try {
      await (action === "approve" ? api.proposals.approve(proposal.id) : api.proposals.reject(proposal.id))
      toast.success(action === "approve" ? tr("AI changes applied") : tr("AI changes rejected"))
      setSelected(null)
      await load()
      await refreshPages()
      window.dispatchEvent(new CustomEvent("motion:proposals-changed"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not review this proposal"))
    } finally {
      setReviewing(false)
    }
  }

  async function deleteAgent(agent: Agent) {
    if (!confirm(tr("Delete agent “{name}”?", { name: agent.name }))) return
    try {
      await api.agents.remove(agent.id)
      toast.success(tr("Agent deleted"))
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not delete agent"))
    }
  }

  return (
    <>
      <header className="flex h-11 shrink-0 items-center gap-1 border-b border-border/70 px-3">
        <SidebarToggle />
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="text-sm leading-none">{workspace?.icon ?? "🧭"}</span>
          <span className="truncate font-medium text-foreground">{workspace?.name ?? "Motion"}</span>
          <span className="text-muted-foreground/60">/</span>
          <span>{tr("Agent Inbox")}</span>
        </div>
        <div className="ml-auto flex items-center gap-1.5">
          <Button variant="ghost" size="sm" className="gap-1.5" onClick={() => void load()} disabled={loading}>
            <RefreshCw className={loading ? "size-3.5 animate-spin" : "size-3.5"} /> {tr("Refresh")}
          </Button>
          <Button size="sm" className="gap-1.5" onClick={() => setAgentDialog({ open: true })}>
            <Plus className="size-3.5" /> {tr("New agent")}
          </Button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto thin-scrollbar">
        <div className="mx-auto w-full max-w-5xl px-5 pb-24 pt-8 sm:px-8">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
                <Inbox className="size-5 text-brand" /> {tr("Agent Inbox")}
              </h1>
              <p className="mt-1 max-w-2xl text-sm leading-6 text-muted-foreground">
                {tr("Your asynchronous approval queue and audit trail. When you are online, reviews open directly in the AI panel.")}
              </p>
            </div>
            <div className="hidden rounded-xl border bg-card px-3 py-2 text-right sm:block">
              <div className="text-lg font-semibold tabular-nums">{pending.length}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{tr("Pending")}</div>
            </div>
          </div>

          <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)} className="mt-7">
            <TabsList className="w-full justify-start bg-transparent p-0">
              <TabsTrigger value="pending" className="data-[state=active]:bg-muted">
                {tr("Pending")} {pending.length > 0 && <span className="ml-1 rounded-full bg-amber-500/15 px-1.5 text-[10px] text-amber-700 dark:text-amber-300">{pending.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="all" className="data-[state=active]:bg-muted">{tr("All proposals")}</TabsTrigger>
              <TabsTrigger value="agents" className="data-[state=active]:bg-muted">{tr("Agents")}</TabsTrigger>
              <TabsTrigger value="activity" className="data-[state=active]:bg-muted">{tr("Activity")}</TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="pt-4">
              <ProposalList proposals={pending} loading={loading} onOpen={setSelected} empty="No pending AI changes." />
            </TabsContent>
            <TabsContent value="all" className="pt-4">
              <ProposalList proposals={proposals} loading={loading} onOpen={setSelected} empty="No AI proposals yet." />
            </TabsContent>
            <TabsContent value="agents" className="pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {loading && agents.length === 0
                  ? [0, 1].map((item) => <Skeleton key={item} className="h-36 rounded-xl" />)
                  : agents.map((agent) => (
                      <div key={agent.id} className="rounded-xl border bg-card p-4">
                        <div className="flex items-start gap-3">
                          <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-xl">
                            {agent.icon}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2">
                              <span className="truncate text-sm font-semibold">{agent.name}</span>
                              {agent.isDefault && (
                                <span className="rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{tr("Default")}</span>
                              )}
                              {!agent.enabled && <span className="text-[9px] text-destructive">{tr("Disabled")}</span>}
                            </div>
                            <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                              {agent.description || tr("No description")}
                            </div>
                          </div>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-1.5">
                          <span className="flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] text-muted-foreground">
                            {agent.mode === "approval" ? <ShieldCheck className="size-3" /> : <Sparkles className="size-3" />}
                            {agent.mode === "approval" ? tr("Requires approval") : tr("Auto apply")}
                          </span>
                          {agent.scopes.map((scope) => (
                            <span key={scope} className="rounded bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">{scope}</span>
                          ))}
                        </div>
                        <div className="mt-3 flex items-center gap-1.5">
                          <Button variant="outline" size="sm" className="h-7 gap-1 text-[11px]" onClick={() => setAgentDialog({ open: true, agent })}>
                            <Pencil className="size-3" /> {tr("Edit")}
                          </Button>
                          {!agent.isDefault && (
                            <Button variant="ghost" size="sm" className="h-7 gap-1 text-[11px] text-muted-foreground hover:text-destructive" onClick={() => void deleteAgent(agent)}>
                              <Trash2 className="size-3" /> {tr("Delete")}
                            </Button>
                          )}
                        </div>
                      </div>
                    ))}
              </div>
            </TabsContent>
            <TabsContent value="activity" className="pt-4">
              <Activity logs={logs} loading={loading} />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <ProposalDialog
        proposal={selected}
        onOpenChange={(open) => !open && setSelected(null)}
        onReview={review}
        reviewing={reviewing}
      />
      <AgentDialog
        open={agentDialog.open}
        agent={agentDialog.agent}
        onOpenChange={(open) => setAgentDialog({ open })}
        onSaved={() => {
          setAgentDialog({ open: false })
          void load()
        }}
      />
    </>
  )
}

function ProposalList({
  proposals,
  loading,
  onOpen,
  empty,
}: {
  proposals: AIProposal[]
  loading: boolean
  onOpen: (proposal: AIProposal) => void
  empty: string
}) {
  if (loading && proposals.length === 0) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((item) => <Skeleton key={item} className="h-24 rounded-xl" />)}
      </div>
    )
  }
  if (proposals.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed px-6 py-16 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted">
          <Inbox className="size-5 text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-sm font-medium">{tr(empty)}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{tr("Ask an agent to edit a page; changes appear here when approval is required.")}</p>
      </div>
    )
  }
  return (
    <div className="space-y-2.5">
      {proposals.map((proposal) => (
        <button
          key={proposal.id}
          type="button"
          onClick={() => onOpen(proposal)}
          className="flex w-full items-start gap-3 rounded-xl border bg-card p-4 text-left transition hover:border-brand/30 hover:bg-accent/25"
        >
          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-brand-soft text-lg">✨</div>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{proposal.pageTitle || tr("Untitled")}</span>
              <span className={statusClass(proposal.status)}>{tr(proposal.status)}</span>
              {proposal.created && <span className="rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[9px] text-sky-700 dark:text-sky-300">{tr("New page")}</span>}
            </div>
            <div className="mt-1 text-[11px] text-muted-foreground">
              {proposal.agentName} · {proposal.actorName} · {formatRelative(proposal.createdAt)}
            </div>
            <div className="mt-2 line-clamp-2 text-xs text-muted-foreground">
              {describeDiff(proposal)}
            </div>
          </div>
          <span className="hidden shrink-0 text-[10px] font-medium text-brand sm:block">{tr("Review")} →</span>
        </button>
      ))}
    </div>
  )
}

function statusClass(status: string) {
  if (status === "approved") return "rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] text-emerald-700 dark:text-emerald-300"
  if (status === "rejected") return "rounded-full bg-red-500/10 px-1.5 py-0.5 text-[9px] text-red-700 dark:text-red-300"
  return "rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-700 dark:text-amber-300"
}

function describeDiff(proposal: AIProposal) {
  const changes = diffBlocks(proposal.before?.blocks ?? [], proposal.after.blocks)
  const title = proposal.before && proposal.before.title !== proposal.after.title
    ? tr("Title changed")
    : ""
  const parts = [
    title,
    changes.added.length ? tr("{n} block(s) added", { n: changes.added.length }) : "",
    changes.changed.length ? tr("{n} block(s) changed", { n: changes.changed.length }) : "",
    changes.removed.length ? tr("{n} block(s) removed", { n: changes.removed.length }) : "",
  ].filter(Boolean)
  return parts.join(" · ") || tr("No visible content changes")
}

function Activity({ logs, loading }: { logs: AuditLog[]; loading: boolean }) {
  if (loading && logs.length === 0) {
    return <div className="space-y-2">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-12 rounded-lg" />)}</div>
  }
  if (logs.length === 0) {
    return <div className="rounded-xl border border-dashed px-4 py-12 text-center text-xs text-muted-foreground">{tr("No activity yet.")}</div>
  }
  return (
    <div className="overflow-hidden rounded-xl border bg-card">
      {logs.map((log) => (
        <div key={log.id} className="flex items-start gap-3 border-b px-3 py-2.5 last:border-b-0">
          <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
            {log.action.startsWith("proposal") ? <ShieldCheck className="size-3.5" /> : <Bot className="size-3.5" />}
          </span>
          <div className="min-w-0 flex-1">
            <div className="text-xs font-medium">{log.summary}</div>
            <div className="mt-0.5 text-[10px] text-muted-foreground">
              {log.actorName}{log.agentName ? ` · ${log.agentName}` : ""} · {formatRelative(log.createdAt)}
            </div>
          </div>
          <span className="shrink-0 font-mono text-[9px] text-muted-foreground/60">{log.action}</span>
        </div>
      ))}
    </div>
  )
}

function AgentDialog({
  open,
  agent,
  onOpenChange,
  onSaved,
}: {
  open: boolean
  agent?: Agent
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const activeId = useWorkspaceStore((state) => state.activeId)
  const [name, setName] = useState("Motion AI")
  const [icon, setIcon] = useState("✨")
  const [description, setDescription] = useState("")
  const [mode, setMode] = useState<AgentMode>("approval")
  const [scopes, setScopes] = useState<string[]>(["pages:read", "pages:write"])
  const [enabled, setEnabled] = useState(true)
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(agent?.name ?? "Motion AI")
    setIcon(agent?.icon ?? "✨")
    setDescription(agent?.description ?? "")
    setMode(agent?.mode ?? "approval")
    setScopes(agent?.scopes ?? ["pages:read", "pages:write"])
    setEnabled(agent?.enabled ?? true)
  }, [open, agent])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!activeId || pending || !name.trim() || scopes.length === 0) return
    setPending(true)
    try {
      const input = { name: name.trim(), icon: icon.trim() || "✨", description: description.trim(), mode, scopes, enabled }
      if (agent) await api.agents.update(agent.id, input)
      else await api.agents.create(activeId, input)
      toast.success(agent ? tr("Agent updated") : tr("Agent created"))
      onSaved()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not save agent"))
    } finally {
      setPending(false)
    }
  }

  function toggleScope(scope: string) {
    setScopes((current) => current.includes(scope) ? current.filter((item) => item !== scope) : [...current, scope])
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{agent ? tr("Edit agent") : tr("New agent")}</DialogTitle>
          <DialogDescription>{tr("Agents can read pages and stage edits for approval.")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-[80px_1fr]">
            <div className="space-y-2">
              <Label htmlFor="agent-icon">{tr("Icon")}</Label>
              <Input id="agent-icon" value={icon} onChange={(event) => setIcon(event.target.value)} className="text-center text-lg" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-name">{tr("Name")}</Label>
              <Input id="agent-name" value={name} onChange={(event) => setName(event.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="agent-description">{tr("Description")}</Label>
            <Input id="agent-description" value={description} onChange={(event) => setDescription(event.target.value)} placeholder={tr("What is this agent for?")} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="agent-mode">{tr("Mode")}</Label>
            <select
              id="agent-mode"
              value={mode}
              onChange={(event) => setMode(event.target.value as AgentMode)}
              className="h-9 w-full rounded-md border bg-background px-2 text-sm outline-none"
            >
              <option value="approval">{tr("Require approval")}</option>
              <option value="auto">{tr("Auto apply")}</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label>{tr("Scopes")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {["pages:read", "pages:write", "workspace:read"].map((scope) => (
                <button
                  key={scope}
                  type="button"
                  onClick={() => toggleScope(scope)}
                  className={scopes.includes(scope)
                    ? "rounded-full border border-brand bg-brand-soft px-2.5 py-1 text-[11px] text-brand"
                    : "rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-accent"}
                >
                  {scope}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center justify-between rounded-lg border px-3 py-2">
            <div>
              <div className="text-xs font-medium">{tr("Enabled")}</div>
              <div className="text-[10px] text-muted-foreground">{tr("Disabled agents cannot be selected in chat.")}</div>
            </div>
            <Switch checked={enabled} onCheckedChange={setEnabled} />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>{tr("Cancel")}</Button>
            <Button type="submit" disabled={pending || !name.trim() || scopes.length === 0}>
              {pending && <Loader2 className="size-3.5 animate-spin" />}
              {tr("Save agent")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
