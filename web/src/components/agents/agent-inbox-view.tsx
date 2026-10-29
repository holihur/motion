import { useCallback, useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  Bot,
  Check,
  Clock3,
  History,
  Inbox,
  Loader2,
  Pencil,
  Play,
  Plus,
  RefreshCw,
  BookmarkPlus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { Agent, AgentMode, AgentRun, AIProposal, AuditLog, TaskTemplate } from "@/lib/types"
import { formatRelative } from "@/lib/utils"
import { tr } from "@/lib/i18n"
import { WorkspaceIcon } from "@/components/app/workspace-icon"
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

type Tab = "pending" | "runs" | "all" | "agents" | "activity"

export function AgentInboxView() {
  const activeId = useWorkspaceStore((state) => state.activeId)
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const refreshPages = useWorkspaceStore((state) => state.refreshPages)
  const [tab, setTab] = useState<Tab>("pending")
  const [proposals, setProposals] = useState<AIProposal[]>([])
  const [agents, setAgents] = useState<Agent[]>([])
  const [logs, setLogs] = useState<AuditLog[]>([])
  const [runs, setRuns] = useState<AgentRun[]>([])
  const [templates, setTemplates] = useState<TaskTemplate[]>([])
  const [templateOpen, setTemplateOpen] = useState(false)
  const [detailAgent, setDetailAgent] = useState<Agent | null>(null)
  const [auditPage, setAuditPage] = useState(1)
  const [auditHasMore, setAuditHasMore] = useState(false)
  const [auditTotal, setAuditTotal] = useState(0)
  const [loadingMore, setLoadingMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [selected, setSelected] = useState<AIProposal | null>(null)
  const [reviewing, setReviewing] = useState(false)
  const [agentDialog, setAgentDialog] = useState<{ open: boolean; agent?: Agent }>({ open: false })
  const [dispatchAgent, setDispatchAgent] = useState("")
  const [checked, setChecked] = useState<Set<string>>(new Set())
  const workspace = workspaces.find((item) => item.id === activeId)

  const load = useCallback(async () => {
    if (!activeId) return
    setLoading(true)
    try {
      const [nextProposals, nextAgents, nextAudit, nextRuns, nextTemplates] = await Promise.all([
        api.proposals.list(activeId),
        api.agents.list(activeId),
        api.audit.list(activeId, 1, 50),
        api.agents.runs(activeId, 50).catch(() => [] as AgentRun[]),
        api.workspaces.taskTemplates(activeId).catch(() => ({ templates: [] as TaskTemplate[] })),
      ])
      setRuns(nextRuns)
      setTemplates(nextTemplates.templates ?? [])
      setProposals(nextProposals)
      setAgents(nextAgents)
      setLogs(nextAudit.items)
      setAuditPage(nextAudit.page)
      setAuditHasMore(nextAudit.hasMore)
      setAuditTotal(nextAudit.total)
      setChecked(new Set())
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not load Agent Inbox"))
    } finally {
      setLoading(false)
    }
  }, [activeId])

  async function loadMoreActivity() {
    if (!activeId || loadingMore || !auditHasMore) return
    setLoadingMore(true)
    try {
      const next = await api.audit.list(activeId, auditPage + 1, 50)
      setLogs((current) => [...current, ...next.items])
      setAuditPage(next.page)
      setAuditHasMore(next.hasMore)
      setAuditTotal(next.total)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not load activity"))
    } finally {
      setLoadingMore(false)
    }
  }

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

  const stats = useMemo(() => {
    const map = new Map<string, { pending: number; approved: number; rejected: number; lastAt: string }>()
    for (const p of proposals) {
      const key = p.agentId || p.agentName
      const entry = map.get(key) ?? { pending: 0, approved: 0, rejected: 0, lastAt: "" }
      if (p.status === "pending") entry.pending += 1
      else if (p.status === "approved") entry.approved += 1
      else if (p.status === "rejected") entry.rejected += 1
      if (!entry.lastAt || p.createdAt > entry.lastAt) entry.lastAt = p.createdAt
      map.set(key, entry)
    }
    return map
  }, [proposals])

  async function review(proposal: AIProposal, action: "approve" | "reject", reason?: string) {
    if (reviewing) return
    setReviewing(true)
    try {
      await (action === "approve" ? api.proposals.approve(proposal.id) : api.proposals.reject(proposal.id, reason))
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

  async function reviewMany(ids: string[], action: "approve" | "reject") {
    if (reviewing || ids.length === 0) return
    setReviewing(true)
    try {
      for (const id of ids) {
        const item = proposals.find((p) => p.id === id)
        if (!item || item.status !== "pending") continue
        await (action === "approve" ? api.proposals.approve(id) : api.proposals.reject(id))
      }
      toast.success(action === "approve" ? tr("AI changes applied") : tr("AI changes rejected"))
      setChecked(new Set())
      await load()
      await refreshPages()
      window.dispatchEvent(new CustomEvent("motion:proposals-changed"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not review this proposal"))
      await load()
    } finally {
      setReviewing(false)
    }
  }

  async function retryWithReason(proposal: AIProposal) {
    if (!activeId || reviewing) return
    const base = proposal.prompt || `继续处理页面「${proposal.pageTitle}」`
    const prompt = proposal.rejectReason
      ? `${base}\n\n上次被驳回，理由：${proposal.rejectReason}\n请针对以上理由修正后重新提交。`
      : base
    setReviewing(true)
    try {
      await api.agents.run(activeId, proposal.agentId, { prompt, pageId: proposal.pageId })
      toast.success(tr("Task dispatched — results will appear here"))
      setSelected(null)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not dispatch task"))
    } finally {
      setReviewing(false)
    }
  }

  async function retryRun(run: AgentRun) {
    if (!activeId || reviewing) return
    setReviewing(true)
    try {
      await api.agents.run(activeId, run.agentId, { prompt: run.prompt, pageId: run.pageId })
      toast.success(tr("Task dispatched — results will appear here"))
      await load()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not dispatch task"))
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
          <WorkspaceIcon value={workspace?.icon} alt={workspace?.name} className="text-sm" />
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
                {tr("Dispatch tasks to agents, review their changes, and automate recurring work.")}
              </p>
            </div>
            <div className="hidden rounded-xl border bg-card px-3 py-2 text-right sm:block">
              <div className="text-lg font-semibold tabular-nums">{pending.length}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{tr("Pending")}</div>
            </div>
          </div>

          <DispatchBar
            agents={agents}
            forcedAgent={dispatchAgent}
            onForcedAgentConsumed={() => setDispatchAgent("")}
            onDispatched={() => toast.success(tr("Task dispatched — results will appear here"))}
            templates={templates}
            onTemplatesChange={setTemplates}
            onManageTemplates={() => setTemplateOpen(true)}
          />

          <Tabs value={tab} onValueChange={(value) => setTab(value as Tab)} className="mt-5">
            <TabsList className="w-full justify-start bg-transparent p-0">
              <TabsTrigger value="pending" className="data-[state=active]:bg-muted">
                {tr("Pending")} {pending.length > 0 && <span className="ml-1 rounded-full bg-amber-500/15 px-1.5 text-[10px] text-amber-700 dark:text-amber-300">{pending.length}</span>}
              </TabsTrigger>
              <TabsTrigger value="runs" className="data-[state=active]:bg-muted">{tr("Runs")}</TabsTrigger>
              <TabsTrigger value="all" className="data-[state=active]:bg-muted">{tr("All proposals")}</TabsTrigger>
              <TabsTrigger value="agents" className="data-[state=active]:bg-muted">{tr("Agents")}</TabsTrigger>
              <TabsTrigger value="activity" className="data-[state=active]:bg-muted">{tr("Activity")}</TabsTrigger>
            </TabsList>

            <TabsContent value="pending" className="pt-4">
              <ProposalList
                proposals={pending}
                loading={loading}
                reviewing={reviewing}
                checked={checked}
                onToggleCheck={(id) => setChecked((prev) => {
                  const next = new Set(prev)
                  if (next.has(id)) next.delete(id)
                  else next.add(id)
                  return next
                })}
                onCheckAll={() => setChecked(new Set(pending.map((p) => p.id)))}
                onClearCheck={() => setChecked(new Set())}
                onBatch={(action) => void reviewMany([...checked].filter((id) => pending.some((p) => p.id === id)), action)}
                onQuick={(p, action) => void review(p, action)}
                onOpen={setSelected}
                empty="No pending AI changes."
              />
            </TabsContent>
            <TabsContent value="runs" className="pt-4">
              <RunsList runs={runs} loading={loading} reviewing={reviewing} onRetry={(run) => void retryRun(run)} />
            </TabsContent>
            <TabsContent value="all" className="pt-4">
              <ProposalList
                proposals={proposals}
                loading={loading}
                reviewing={reviewing}
                checked={checked}
                onToggleCheck={(id) => setChecked((prev) => {
                  const next = new Set(prev)
                  if (next.has(id)) next.delete(id)
                  else next.add(id)
                  return next
                })}
                onCheckAll={() => setChecked(new Set(proposals.filter((p) => p.status === "pending").map((p) => p.id)))}
                onClearCheck={() => setChecked(new Set())}
                onBatch={(action) => void reviewMany([...checked], action)}
                onQuick={(p, action) => void review(p, action)}
                onOpen={setSelected}
                empty="No AI proposals yet."
              />
            </TabsContent>
            <TabsContent value="agents" className="pt-4">
              <div className="grid gap-3 sm:grid-cols-2">
                {loading && agents.length === 0
                  ? [0, 1].map((item) => <Skeleton key={item} className="h-36 rounded-xl" />)
                  : agents.map((agent) => {
                      const stat = stats.get(agent.id) ?? stats.get(agent.name)
                      const total = (stat?.approved ?? 0) + (stat?.rejected ?? 0)
                      const rate = total > 0 ? Math.round(((stat?.approved ?? 0) / total) * 100) : null
                      return (
                        <div
                          key={agent.id}
                          role="button"
                          tabIndex={0}
                          onClick={() => setDetailAgent(agent)}
                          onKeyDown={(e) => { if (e.key === "Enter") setDetailAgent(agent) }}
                          className="cursor-pointer rounded-xl border bg-card p-4 transition hover:border-brand/30"
                        >
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
                                {(stat?.pending ?? 0) > 0 && (
                                  <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 dark:text-amber-300">
                                    {stat!.pending} {tr("Pending")}
                                  </span>
                                )}
                              </div>
                              <div className="mt-0.5 line-clamp-2 text-[11px] leading-4 text-muted-foreground">
                                {agent.description || tr("No description")}
                              </div>
                              <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[10px] text-muted-foreground">
                                {rate !== null && <span>{tr("Approval rate")} <b className="text-foreground">{rate}%</b> ({stat!.approved}/{total})</span>}
                                {stat?.lastAt && <span>{tr("Last active")} {formatRelative(stat.lastAt)}</span>}
                                {agent.schedule?.enabled && (
                                  <span className="flex items-center gap-0.5 text-brand"><Clock3 className="size-3" />{tr("Every {n}h", { n: agent.schedule.everyHours })}{agent.schedule.nextRun ? ` · ${tr("next")} ${formatRelative(agent.schedule.nextRun)}` : ""}</span>
                                )}
                                {agent.schedule?.lastRunError && <span className="text-destructive">{agent.schedule.lastRunError}</span>}
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
                          <div className="mt-3 flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="sm"
                              className="h-7 gap-1 text-[11px]"
                              disabled={!agent.enabled}
                              onClick={() => { setDispatchAgent(agent.id); setTab("pending") }}
                            >
                              <Play className="size-3" /> {tr("Dispatch")}
                            </Button>
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
                      )
                    })}
              </div>
            </TabsContent>
            <TabsContent value="activity" className="pt-4">
              <Activity
                logs={logs}
                loading={loading}
                total={auditTotal}
                hasMore={auditHasMore}
                loadingMore={loadingMore}
                onLoadMore={() => void loadMoreActivity()}
              />
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <ProposalDialog
        key={selected?.id ?? "none"}
        proposal={selected}
        onOpenChange={(open) => !open && setSelected(null)}
        onReview={review}
        onRetry={retryWithReason}
        reviewing={reviewing}
      />
      <TemplateDialog
        open={templateOpen}
        onOpenChange={setTemplateOpen}
        agents={agents}
        templates={templates}
        onSaved={setTemplates}
      />
      <AgentDetailDialog
        agent={detailAgent}
        runs={runs}
        proposals={proposals}
        reviewing={reviewing}
        onClose={() => setDetailAgent(null)}
        onOpenProposal={(p) => { setDetailAgent(null); setSelected(p) }}
        onDispatch={(id) => { setDetailAgent(null); setDispatchAgent(id); setTab("pending") }}
        onEdit={(a) => { setDetailAgent(null); setAgentDialog({ open: true, agent: a }) }}
        onDelete={(a) => { setDetailAgent(null); void deleteAgent(a) }}
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

/* ---------------- 派活条 ---------------- */

function DispatchBar({ agents, forcedAgent, onForcedAgentConsumed, onDispatched, templates, onTemplatesChange, onManageTemplates }: {
  agents: Agent[]
  forcedAgent: string
  onForcedAgentConsumed: () => void
  onDispatched: () => void
  templates: TaskTemplate[]
  onTemplatesChange: (t: TaskTemplate[]) => void
  onManageTemplates: () => void
}) {
  const activeId = useWorkspaceStore((s) => s.activeId)
  const pages = useWorkspaceStore((s) => s.pages)
  const [agentId, setAgentId] = useState("")
  const [prompt, setPrompt] = useState("")
  const [pageId, setPageId] = useState("")
  const [sending, setSending] = useState(false)
  const enabled = useMemo(() => agents.filter((a) => a.enabled), [agents])

  useEffect(() => {
    if (forcedAgent) {
      setAgentId(forcedAgent)
      onForcedAgentConsumed()
      document.getElementById("agent-dispatch-input")?.focus()
    }
  }, [forcedAgent, onForcedAgentConsumed])

  useEffect(() => {
    if (!agentId && enabled.length > 0) setAgentId(enabled[0].id)
  }, [agentId, enabled])

  function applyTemplate(id: string) {
    const t = templates.find((item) => item.id === id)
    if (!t) return
    setPrompt(t.prompt)
    if (t.agentId && enabled.some((a) => a.id === t.agentId)) setAgentId(t.agentId)
    setPageId(t.pageId ?? "")
    document.getElementById("agent-dispatch-input")?.focus()
  }

  async function saveAsTemplate() {
    if (!activeId || !prompt.trim()) return
    setSending(true)
    try {
      const next = [...templates, {
        id: "",
        name: prompt.trim().slice(0, 24) || tr("Untitled"),
        prompt: prompt.trim(),
        pageId: pageId || undefined,
        agentId: agentId || undefined,
        createdAt: new Date().toISOString(),
      }]
      const saved = await api.workspaces.saveTaskTemplates(activeId, next)
      onTemplatesChange(saved.templates)
      toast.success(tr("Template saved"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not save agent"))
    } finally {
      setSending(false)
    }
  }

  async function submit(event?: React.FormEvent) {
    event?.preventDefault()
    if (!activeId || !agentId || !prompt.trim() || sending) return
    setSending(true)
    try {
      await api.agents.run(activeId, agentId, { prompt: prompt.trim(), pageId: pageId || undefined })
      setPrompt("")
      onDispatched()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not dispatch task"))
    } finally {
      setSending(false)
    }
  }

  return (
    <form onSubmit={submit} className="mt-5 rounded-2xl border border-brand/25 bg-gradient-to-br from-brand-soft/40 via-card to-card p-3 shadow-sm">
      <div className="flex flex-col gap-2 sm:flex-row">
        <select
          value={agentId}
          onChange={(e) => setAgentId(e.target.value)}
          className="h-9 shrink-0 rounded-lg border bg-background px-2 text-xs outline-none sm:max-w-40"
        >
          {enabled.map((a) => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
          {enabled.length === 0 && <option value="">{tr("No enabled agents")}</option>}
        </select>
        <Input
          id="agent-dispatch-input"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder={tr("Tell an agent what to do… e.g. summarize this week's notes")}
          className="h-9 flex-1"
        />
        <select
          value={pageId}
          onChange={(e) => setPageId(e.target.value)}
          className="h-9 shrink-0 rounded-lg border bg-background px-2 text-xs text-muted-foreground outline-none sm:max-w-44"
        >
          <option value="">{tr("Any page")}</option>
          {pages.filter((p) => !p.archived).slice(0, 200).map((p) => (
            <option key={p.id} value={p.id}>{p.title || tr("Untitled")}</option>
          ))}
        </select>
        <Button type="submit" size="sm" className="h-9 gap-1.5" disabled={sending || !agentId || !prompt.trim()}>
          {sending ? <Loader2 className="size-3.5 animate-spin" /> : <Play className="size-3.5" />}
          {tr("Dispatch")}
        </Button>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <select
          value=""
          onChange={(e) => { if (e.target.value) applyTemplate(e.target.value) }}
          className="h-7 rounded-md border bg-background px-1.5 text-[11px] text-muted-foreground outline-none"
        >
          <option value="">{templates.length ? tr("Use template… ({n})", { n: templates.length }) : tr("No templates yet")}</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button
          type="button"
          onClick={() => void saveAsTemplate()}
          disabled={sending || !prompt.trim()}
          className="flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-40"
        >
          <BookmarkPlus className="size-3" /> {tr("Save as template")}
        </button>
        <button
          type="button"
          onClick={onManageTemplates}
          className="h-7 rounded-md px-2 text-[11px] text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          {tr("Manage")}
        </button>
        <span className="ml-auto hidden text-[11px] leading-4 text-muted-foreground md:block">
          {tr("Runs in the background — approval-mode results land here for review, auto-mode applies directly.")}
        </span>
      </div>
    </form>
  )
}

/* ---------------- 任务模板管理 ---------------- */

function TemplateDialog({ open, onOpenChange, agents, templates, onSaved }: {
  open: boolean
  onOpenChange: (v: boolean) => void
  agents: Agent[]
  templates: TaskTemplate[]
  onSaved: (t: TaskTemplate[]) => void
}) {
  const activeId = useWorkspaceStore((s) => s.activeId)
  const pages = useWorkspaceStore((s) => s.pages)
  const [items, setItems] = useState<TaskTemplate[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (open) setItems(templates)
  }, [open, templates])

  async function save() {
    if (!activeId || saving) return
    const cleaned = items.filter((t) => t.name.trim() && t.prompt.trim())
    setSaving(true)
    try {
      const saved = await api.workspaces.saveTaskTemplates(activeId, cleaned.map((t) => ({
        ...t, name: t.name.trim(), prompt: t.prompt.trim(),
      })))
      onSaved(saved.templates)
      toast.success(tr("Saved"))
      onOpenChange(false)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not save agent"))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{tr("Task templates")}</DialogTitle>
          <DialogDescription>{tr("One click fills the dispatch bar — shared across this workspace.")}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          {items.length === 0 && (
            <div className="rounded-xl border border-dashed px-4 py-8 text-center text-xs text-muted-foreground">
              {tr("No templates yet — save the current dispatch as a template.")}
            </div>
          )}
          {items.map((t, i) => (
            <div key={t.id || `new-${i}`} className="space-y-1.5 rounded-xl border p-2.5">
              <div className="flex gap-1.5">
                <Input value={t.name} onChange={(e) => setItems((prev) => prev.map((x, k) => (k === i ? { ...x, name: e.target.value } : x)))} placeholder={tr("Name")} className="h-8 flex-1 text-xs" />
                <Button variant="ghost" size="sm" className="h-8 px-2 text-destructive" onClick={() => setItems((prev) => prev.filter((_, k) => k !== i))}>
                  <Trash2 className="size-3.5" />
                </Button>
              </div>
              <textarea
                value={t.prompt}
                onChange={(e) => setItems((prev) => prev.map((x, k) => (k === i ? { ...x, prompt: e.target.value } : x)))}
                rows={2}
                placeholder={tr("Task")}
                className="w-full rounded-md border bg-background px-2 py-1.5 text-xs outline-none focus:border-brand"
              />
              <div className="flex gap-1.5">
                <select value={t.agentId ?? ""} onChange={(e) => setItems((prev) => prev.map((x, k) => (k === i ? { ...x, agentId: e.target.value } : x)))} className="h-7 flex-1 rounded-md border bg-background px-1.5 text-[11px] outline-none">
                  <option value="">{tr("Any agent")}</option>
                  {agents.map((a) => <option key={a.id} value={a.id}>{a.icon} {a.name}</option>)}
                </select>
                <select value={t.pageId ?? ""} onChange={(e) => setItems((prev) => prev.map((x, k) => (k === i ? { ...x, pageId: e.target.value } : x)))} className="h-7 flex-1 rounded-md border bg-background px-1.5 text-[11px] outline-none">
                  <option value="">{tr("Any page")}</option>
                  {pages.filter((p) => !p.archived).slice(0, 200).map((p) => (
                    <option key={p.id} value={p.id}>{p.title || tr("Untitled")}</option>
                  ))}
                </select>
              </div>
            </div>
          ))}
          <Button
            variant="outline"
            size="sm"
            className="w-full gap-1"
            onClick={() => setItems((prev) => [...prev, { id: `new-${Date.now()}`, name: "", prompt: "", createdAt: new Date().toISOString() }])}
          >
            <Plus className="size-3.5" /> {tr("New template")}
          </Button>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{tr("Cancel")}</Button>
          <Button onClick={() => void save()} disabled={saving}>
            {saving && <Loader2 className="size-3.5 animate-spin" />} {tr("Save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------- Agent 详情 ---------------- */

function AgentDetailDialog({ agent, runs, proposals, reviewing, onClose, onOpenProposal, onDispatch, onEdit, onDelete }: {
  agent: Agent | null
  runs: AgentRun[]
  proposals: AIProposal[]
  reviewing: boolean
  onClose: () => void
  onOpenProposal: (p: AIProposal) => void
  onDispatch: (id: string) => void
  onEdit: (a: Agent) => void
  onDelete: (a: Agent) => void
}) {
  if (!agent) return null
  const agentRuns = runs.filter((r) => r.agentId === agent.id)
  const agentProposals = proposals.filter((p) => p.agentId === agent.id)
  const pending = agentProposals.filter((p) => p.status === "pending").length
  const done = agentRuns.filter((r) => r.status === "succeeded" || r.status === "failed")
  const okRate = done.length ? Math.round((agentRuns.filter((r) => r.status === "succeeded").length / done.length) * 100) : null
  const tokens = agentRuns.reduce((sum, r) => sum + (r.tokens ?? 0), 0)
  return (
    <Dialog open onOpenChange={(open) => { if (!open) onClose() }}>
      <DialogContent className="max-h-[90svh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <span className="flex size-8 items-center justify-center rounded-lg bg-brand-soft text-lg">{agent.icon}</span>
            {agent.name}
          </DialogTitle>
          <DialogDescription>{agent.description || tr("No description")}</DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            [String(pending), tr("Pending")],
            [okRate === null ? "—" : `${okRate}%`, tr("Run success")],
            [tokens > 0 ? (tokens > 1000 ? `${(tokens / 1000).toFixed(1)}k` : String(tokens)) : "—", tr("Tokens used")],
            [String(agentRuns.length), tr("Runs")],
          ].map(([v, label]) => (
            <div key={label} className="rounded-xl border bg-muted/20 px-3 py-2 text-center">
              <div className="text-base font-semibold tabular-nums">{v}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
            </div>
          ))}
        </div>
        {agent.schedule?.enabled && (
          <div className="flex items-center gap-1.5 rounded-lg border border-brand/25 bg-brand-soft/20 px-2.5 py-1.5 text-xs">
            <Clock3 className="size-3.5 text-brand" />
            {tr("Every {n}h", { n: agent.schedule.everyHours })} · “{agent.schedule.prompt}”
            {agent.schedule.nextRun ? ` · ${tr("Next run")} ${formatRelative(agent.schedule.nextRun)}` : ""}
          </div>
        )}
        <div className="space-y-1.5">
          <div className="text-xs font-semibold">{tr("Recent runs")}</div>
          {agentRuns.length === 0 && <div className="text-[11px] text-muted-foreground">{tr("No runs yet")}</div>}
          {agentRuns.slice(0, 5).map((r) => (
            <div key={r.id} className="flex items-center gap-2 rounded-lg border px-2.5 py-1.5 text-xs">
              <span className="size-1.5 shrink-0 rounded-full" style={{
                background: r.status === "succeeded" ? "#10b981" : r.status === "failed" ? "#ef4444" : r.status === "running" ? "#3b82f6" : "#a1a1aa",
              }} />
              <span className="min-w-0 flex-1 truncate text-muted-foreground">“{r.prompt}”</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">{formatRelative(r.createdAt)}</span>
            </div>
          ))}
        </div>
        <div className="space-y-1.5">
          <div className="text-xs font-semibold">{tr("Recent proposals")}</div>
          {agentProposals.length === 0 && <div className="text-[11px] text-muted-foreground">{tr("No AI proposals yet.")}</div>}
          {agentProposals.slice(0, 5).map((p) => (
            <button key={p.id} type="button" onClick={() => onOpenProposal(p)} className="flex w-full items-center gap-2 rounded-lg border px-2.5 py-1.5 text-left text-xs transition hover:border-brand/30">
              <span className={statusClass(p.status)}>{tr(p.status)}</span>
              <span className="min-w-0 flex-1 truncate font-medium">{p.pageTitle || tr("Untitled")}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">{formatRelative(p.createdAt)}</span>
            </button>
          ))}
        </div>
        <DialogFooter className="gap-1.5">
          {!agent.isDefault && (
            <Button variant="ghost" className="mr-auto gap-1 text-destructive hover:text-destructive" onClick={() => onDelete(agent)}>
              <Trash2 className="size-3.5" /> {tr("Delete")}
            </Button>
          )}
          <Button variant="outline" onClick={() => onEdit(agent)} className="gap-1.5"><Pencil className="size-3.5" /> {tr("Edit")}</Button>
          <Button onClick={() => onDispatch(agent.id)} disabled={!agent.enabled || reviewing} className="gap-1.5"><Play className="size-3.5" /> {tr("Dispatch")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/* ---------------- 运行记录 ---------------- */

function runDuration(run: AgentRun): string {
  if (!run.startedAt) return ""
  const end = run.finishedAt ?? new Date().toISOString()
  const secs = Math.max(0, Math.round((new Date(end).getTime() - new Date(run.startedAt).getTime()) / 1000))
  if (secs < 60) return `${secs}s`
  return `${Math.floor(secs / 60)}m${secs % 60}s`
}

function RunsList({ runs, loading, reviewing, onRetry }: {
  runs: AgentRun[]
  loading: boolean
  reviewing: boolean
  onRetry: (run: AgentRun) => void
}) {
  if (loading && runs.length === 0) {
    return (
      <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 rounded-xl" />)}</div>
    )
  }
  if (runs.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed px-6 py-14 text-center">
        <div className="mx-auto flex size-12 items-center justify-center rounded-2xl bg-muted">
          <History className="size-5 text-muted-foreground" />
        </div>
        <h3 className="mt-4 text-sm font-medium">{tr("No runs yet")}</h3>
        <p className="mt-1 text-xs text-muted-foreground">{tr("Dispatch a task above — every run is tracked here.")}</p>
      </div>
    )
  }
  return (
    <div className="space-y-2">
      {runs.map((run) => (
        <div key={run.id} className="flex items-start gap-3 rounded-xl border bg-card px-3 py-2.5">
          <span className="mt-1.5 size-2 shrink-0 rounded-full" style={{
            background: run.status === "succeeded" ? "#10b981" : run.status === "failed" ? "#ef4444" : run.status === "running" ? "#3b82f6" : "#a1a1aa",
          }} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="font-semibold">{run.agentName}</span>
              {run.scheduled && <span className="rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground">{tr("Scheduled")}</span>}
              <span className="text-muted-foreground">· {run.actorName} · {formatRelative(run.createdAt)}</span>
              {runDuration(run) && <span className="tabular-nums text-muted-foreground">· {runDuration(run)}</span>}
              {typeof run.tokens === "number" && run.tokens > 0 && <span className="tabular-nums text-muted-foreground">· {run.tokens} tokens</span>}
            </div>
            <div className="mt-0.5 line-clamp-1 text-xs text-muted-foreground">“{run.prompt}”</div>
            {run.status === "failed" && run.error && (
              <div className="mt-1 line-clamp-2 rounded-md bg-red-500/5 px-2 py-1 text-[11px] text-red-700 dark:text-red-300">{run.error}</div>
            )}
            {run.status === "succeeded" && (
              <div className="mt-0.5 text-[11px] text-muted-foreground">
                {typeof run.actions === "number" && run.actions > 0 ? `${run.actions} actions · ` : ""}{tr("{n} proposal(s)", { n: run.proposalIds?.length ?? 0 })}
              </div>
            )}
            {(run.status === "queued" || run.status === "running") && (
              <div className="mt-0.5 text-[11px] text-blue-600 dark:text-blue-400">{run.status === "queued" ? tr("Queued…") : tr("Running…")}</div>
            )}
          </div>
          {run.status === "failed" && (
            <Button size="sm" variant="outline" className="h-7 shrink-0 gap-1 text-[11px]" disabled={reviewing} onClick={() => onRetry(run)}>
              <RotateCcw className="size-3" /> {tr("Retry")}
            </Button>
          )}
        </div>
      ))}
    </div>
  )
}

/* ---------------- 提案列表：批量 + 行内审批 + diff 预览 ---------------- */

function ProposalList({
  proposals, loading, reviewing, checked, onToggleCheck, onCheckAll, onClearCheck, onBatch, onQuick, onOpen, empty,
}: {
  proposals: AIProposal[]
  loading: boolean
  reviewing: boolean
  checked: Set<string>
  onToggleCheck: (id: string) => void
  onCheckAll: () => void
  onClearCheck: () => void
  onBatch: (action: "approve" | "reject") => void
  onQuick: (proposal: AIProposal, action: "approve" | "reject") => void
  onOpen: (proposal: AIProposal) => void
  empty: string
}) {
  const navigate = useNavigate()
  const pendingIds = proposals.filter((p) => p.status === "pending").map((p) => p.id)
  const checkedPending = [...checked].filter((id) => pendingIds.includes(id))

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
        <p className="mt-1 text-xs text-muted-foreground">{tr("Dispatch a task above — changes appear here when approval is required.")}</p>
      </div>
    )
  }
  return (
    <div className="space-y-2.5">
      {pendingIds.length > 1 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-dashed px-3 py-2 text-xs">
          <button type="button" onClick={() => (checkedPending.length === pendingIds.length ? onClearCheck() : onCheckAll())} className="font-medium text-brand hover:underline">
            {checkedPending.length === pendingIds.length ? tr("Deselect all") : tr("Select all ({n})", { n: pendingIds.length })}
          </button>
          {checkedPending.length > 0 && (
            <>
              <span className="text-muted-foreground">· {tr("{n} selected", { n: checkedPending.length })}</span>
              <span className="ml-auto flex gap-1.5">
                <Button size="sm" className="h-7 text-[11px]" disabled={reviewing} onClick={() => onBatch("approve")}>
                  <Check className="size-3" /> {tr("Approve all")}
                </Button>
                <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={reviewing} onClick={() => onBatch("reject")}>
                  <X className="size-3" /> {tr("Reject all")}
                </Button>
              </span>
            </>
          )}
        </div>
      )}
      {proposals.map((proposal) => {
        const isPending = proposal.status === "pending"
        return (
          <div
            key={proposal.id}
            className="flex w-full items-start gap-2.5 rounded-xl border bg-card p-3 text-left transition hover:border-brand/30 sm:gap-3 sm:p-4"
          >
            {isPending && (
              <input
                type="checkbox"
                checked={checked.has(proposal.id)}
                onChange={() => onToggleCheck(proposal.id)}
                className="mt-1.5 size-3.5 shrink-0 accent-[var(--brand)]"
                aria-label={tr("Select")}
              />
            )}
            <button type="button" onClick={() => onOpen(proposal)} className="min-w-0 flex-1 text-left">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{proposal.pageTitle || tr("Untitled")}</span>
                <span className={statusClass(proposal.status)}>{tr(proposal.status)}</span>
                {proposal.created && <span className="rounded-full bg-sky-500/10 px-1.5 py-0.5 text-[9px] text-sky-700 dark:text-sky-300">{tr("New page")}</span>}
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                {proposal.agentName} · {proposal.actorName} · {formatRelative(proposal.createdAt)}
              </div>
              {proposal.prompt && (
                <div className="mt-1.5 line-clamp-1 rounded-md bg-muted/50 px-2 py-1 text-[11px] text-muted-foreground">
                  “{proposal.prompt}”
                </div>
              )}
              <div className="mt-1.5 space-y-1">
                <DiffPreview proposal={proposal} />
              </div>
              <span
                className="mt-1 inline-block text-[11px] text-muted-foreground hover:text-foreground hover:underline"
                onClick={(e) => { e.stopPropagation(); navigate(`/page/${proposal.pageId}`) }}
              >
                {tr("Open page")} →
              </span>
            </button>
            {isPending && (
              <span className="flex shrink-0 flex-col gap-1.5 sm:flex-row">
                <Button size="sm" className="h-7 px-2.5 text-[11px]" disabled={reviewing} onClick={() => onQuick(proposal, "approve")}>
                  <Check className="size-3" />
                  <span className="hidden sm:inline">{tr("Approve")}</span>
                </Button>
                <Button size="sm" variant="outline" className="h-7 px-2.5 text-[11px]" disabled={reviewing} onClick={() => onQuick(proposal, "reject")}>
                  <X className="size-3" />
                  <span className="hidden sm:inline">{tr("Reject")}</span>
                </Button>
              </span>
            )}
          </div>
        )
      })}
    </div>
  )
}

function DiffPreview({ proposal }: { proposal: AIProposal }) {
  const changes = diffBlocks(proposal.before?.blocks ?? [], proposal.after.blocks)
  const items: { sign: string; tone: string; text: string }[] = []
  for (const b of changes.added.slice(0, 2)) items.push({ sign: "+", tone: "text-emerald-700 dark:text-emerald-300", text: b.text || b.type })
  if (items.length < 2) {
    for (const b of changes.changed.slice(0, 2 - items.length)) {
      const old = (proposal.before?.blocks ?? []).find((item) => item.id === b.id)
      const text = old && old.text !== b.text ? `${old.text} → ${b.text}` : b.text
      items.push({ sign: "±", tone: "text-amber-700 dark:text-amber-300", text: text || b.type })
    }
  }
  if (items.length === 0) {
    for (const b of changes.removed.slice(0, 2)) items.push({ sign: "−", tone: "text-red-700 dark:text-red-300", text: b.text || b.type })
  }
  if (items.length === 0) {
    const title = proposal.before && proposal.before.title !== proposal.after.title ? tr("Title changed") : tr("No visible content changes")
    return <div className="line-clamp-2 text-xs text-muted-foreground">{title}</div>
  }
  return (
    <>
      {items.map((item, i) => (
        <div key={i} className={`line-clamp-1 text-xs ${item.tone}`}>
          <span className="mr-1 font-mono font-bold">{item.sign}</span>
          {item.text.length > 90 ? item.text.slice(0, 90) + "…" : item.text}
        </div>
      ))}
      {changes.added.length + changes.changed.length + changes.removed.length > items.length && (
        <div className="text-[10px] text-muted-foreground">…{tr("more")}</div>
      )}
    </>
  )
}

function statusClass(status: string) {
  if (status === "approved") return "rounded-full bg-emerald-500/10 px-1.5 py-0.5 text-[9px] text-emerald-700 dark:text-emerald-300"
  if (status === "rejected") return "rounded-full bg-red-500/10 px-1.5 py-0.5 text-[9px] text-red-700 dark:text-red-300"
  return "rounded-full bg-amber-500/10 px-1.5 py-0.5 text-[9px] text-amber-700 dark:text-amber-300"
}

function Activity({
  logs, loading, total, hasMore, loadingMore, onLoadMore,
}: {
  logs: AuditLog[]
  loading: boolean
  total: number
  hasMore: boolean
  loadingMore: boolean
  onLoadMore: () => void
}) {
  const [filter, setFilter] = useState("")
  const names = useMemo(() => [...new Set(logs.map((l) => l.agentName).filter(Boolean))] as string[], [logs])
  const shown = filter ? logs.filter((l) => l.agentName === filter) : logs
  if (loading && logs.length === 0) {
    return <div className="space-y-2">{[0, 1, 2, 3].map((item) => <Skeleton key={item} className="h-12 rounded-lg" />)}</div>
  }
  if (logs.length === 0) {
    return <div className="rounded-xl border border-dashed px-4 py-12 text-center text-xs text-muted-foreground">{tr("No activity yet.")}</div>
  }
  return (
    <div>
      {names.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-1">
          <button
            type="button"
            onClick={() => setFilter("")}
            className={filter === "" ? "rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-medium text-brand" : "rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-accent"}
          >
            {tr("All")}
          </button>
          {names.map((name) => (
            <button
              key={name}
              type="button"
              onClick={() => setFilter((f) => (f === name ? "" : name))}
              className={filter === name ? "rounded-full bg-brand-soft px-2.5 py-1 text-[11px] font-medium text-brand" : "rounded-full border px-2.5 py-1 text-[11px] text-muted-foreground hover:bg-accent"}
            >
              {name}
            </button>
          ))}
        </div>
      )}
      <div className="overflow-hidden rounded-xl border bg-card">
        {shown.map((log) => (
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
        {shown.length === 0 && <div className="px-4 py-8 text-center text-xs text-muted-foreground">{tr("No activity for this agent.")}</div>}
        {hasMore && (
          <div className="border-t p-2">
            <button
              type="button"
              onClick={onLoadMore}
              disabled={loadingMore}
              className="w-full rounded-md border border-border/70 px-2 py-1.5 text-[11px] font-medium text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-50"
            >
              {loadingMore ? tr("Loading…") : tr("Load more ({n} of {total})", { n: logs.length, total })}
            </button>
          </div>
        )}
      </div>
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
  const pages = useWorkspaceStore((state) => state.pages)
  const [name, setName] = useState("Motion AI")
  const [icon, setIcon] = useState("✨")
  const [description, setDescription] = useState("")
  const [mode, setMode] = useState<AgentMode>("approval")
  const [scopes, setScopes] = useState<string[]>(["pages:read", "pages:write"])
  const [enabled, setEnabled] = useState(true)
  const [schedOn, setSchedOn] = useState(false)
  const [everyHours, setEveryHours] = useState("24")
  const [schedPrompt, setSchedPrompt] = useState("")
  const [schedPage, setSchedPage] = useState("")
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (!open) return
    setName(agent?.name ?? "Motion AI")
    setIcon(agent?.icon ?? "✨")
    setDescription(agent?.description ?? "")
    setMode(agent?.mode ?? "approval")
    setScopes(agent?.scopes ?? ["pages:read", "pages:write"])
    setEnabled(agent?.enabled ?? true)
    setSchedOn(agent?.schedule?.enabled ?? false)
    setEveryHours(String(agent?.schedule?.everyHours ?? 24))
    setSchedPrompt(agent?.schedule?.prompt ?? "")
    setSchedPage(agent?.schedule?.pageId ?? "")
  }, [open, agent])

  async function save(event: React.FormEvent) {
    event.preventDefault()
    if (!activeId || pending || !name.trim() || scopes.length === 0) return
    if (schedOn && !schedPrompt.trim()) {
      toast.error(tr("Scheduled tasks need a prompt"))
      return
    }
    setPending(true)
    try {
      const input = {
        name: name.trim(), icon: icon.trim() || "✨", description: description.trim(), mode, scopes, enabled,
        schedule: {
          enabled: schedOn,
          everyHours: Math.min(720, Math.max(1, Number(everyHours) || 24)),
          prompt: schedPrompt.trim(),
          pageId: schedPage || undefined,
        },
      }
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
      <DialogContent className="max-h-[90svh] max-w-lg overflow-y-auto">
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
          <div className="space-y-2 rounded-xl border p-3">
            <div className="flex items-center justify-between">
              <div>
                <div className="flex items-center gap-1.5 text-xs font-medium"><Clock3 className="size-3.5 text-brand" />{tr("Scheduled runs")}</div>
                <div className="mt-0.5 text-[10px] text-muted-foreground">{tr("Run this task automatically every few hours.")}</div>
              </div>
              <Switch checked={schedOn} onCheckedChange={setSchedOn} />
            </div>
            {schedOn && (
              <div className="space-y-2 pt-1">
                <div className="grid grid-cols-[110px_1fr] items-center gap-2">
                  <Label>{tr("Every")}</Label>
                  <div className="flex items-center gap-1.5">
                    <Input type="number" min={1} max={720} value={everyHours} onChange={(e) => setEveryHours(e.target.value)} className="h-8 w-20" />
                    <span className="text-xs text-muted-foreground">{tr("hours")}</span>
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label>{tr("Task")}</Label>
                  <textarea
                    value={schedPrompt}
                    onChange={(e) => setSchedPrompt(e.target.value)}
                    rows={2}
                    placeholder={tr("e.g. summarize yesterday's new pages")}
                    className="w-full rounded-md border bg-background px-2.5 py-2 text-xs outline-none focus:border-brand"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>{tr("Page (optional)")}</Label>
                  <select value={schedPage} onChange={(e) => setSchedPage(e.target.value)} className="h-8 w-full rounded-md border bg-background px-2 text-xs outline-none">
                    <option value="">{tr("Any page")}</option>
                    {pages.filter((p) => !p.archived).slice(0, 200).map((p) => (
                      <option key={p.id} value={p.id}>{p.title || tr("Untitled")}</option>
                    ))}
                  </select>
                </div>
                {agent?.schedule?.nextRun && agent.schedule.enabled && (
                  <div className="text-[10px] text-muted-foreground">{tr("Next run")} {formatRelative(agent.schedule.nextRun)}{agent.schedule.lastRun ? ` · ${tr("last")} ${formatRelative(agent.schedule.lastRun)}` : ""}</div>
                )}
              </div>
            )}
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
