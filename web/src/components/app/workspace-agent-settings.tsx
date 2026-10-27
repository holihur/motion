import { useEffect, useState } from "react"
import { Bot, ChevronRight, KeyRound, Plus, Server, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { tr } from "@/lib/i18n"
import { useWorkspaceStore } from "@/stores/workspace"
import { useAuthStore } from "@/stores/auth"
import type { WorkspaceMCP, WorkspaceSkill } from "@/lib/types"
import { cn, uid } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"

export function WorkspaceAgentSettings() {
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const activeId = useWorkspaceStore((state) => state.activeId)
  const user = useAuthStore((state) => state.user)
  const workspace = workspaces.find((item) => item.id === activeId)
  const [skills, setSkills] = useState<WorkspaceSkill[]>([])
  const [servers, setServers] = useState<WorkspaceMCP[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [openSkills, setOpenSkills] = useState<Set<string>>(new Set())
  const [openServers, setOpenServers] = useState<Set<string>>(new Set())
  const owner = Boolean(workspace && user && workspace.ownerId === user.id)

  useEffect(() => {
    if (!workspace) return
    let alive = true
    setLoading(true)
    api.workspaces.agentConfig(workspace.id)
      .then((config) => {
        if (!alive) return
        setSkills(config.skills ?? [])
        setServers(config.mcpServers ?? [])
      })
      .catch(() => { if (alive) { setSkills([]); setServers([]) } })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [workspace?.id])

  if (!workspace) return <p className="pt-4 text-sm text-muted-foreground">{tr("No workspace selected.")}</p>
  if (loading) return <div className="h-32 animate-pulse rounded-lg bg-muted/60" />

  async function save() {
    if (saving) return
    setSaving(true)
    try {
      const config = await api.workspaces.saveAgentConfig(workspace!.id, { skills, mcpServers: servers })
      setSkills(config.skills ?? [])
      setServers(config.mcpServers ?? [])
      toast.success(tr("Workspace agent settings saved"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not save agent settings"))
    } finally {
      setSaving(false)
    }
  }

  function addSkill() {
    const id = uid()
    setSkills((current) => [...current, { id, name: "", description: "", instructions: "" }])
    setOpenSkills((current) => new Set(current).add(id))
  }
  function addServer() {
    const id = uid()
    setServers((current) => [...current, { id, name: "", url: "", headers: {}, enabled: true }])
    setOpenServers((current) => new Set(current).add(id))
  }
  function toggleOpen(setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) {
    setter((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }
  function removeSkill(id: string) {
    setSkills((current) => current.filter((item) => item.id !== id))
    setOpenSkills((current) => {
      const next = new Set(current)
      next.delete(id)
      return next
    })
  }
  function removeServer(id: string) {
    setServers((current) => current.filter((item) => item.id !== id))
    setOpenServers((current) => {
      const next = new Set(current)
      next.delete(id)
      return next
    })
  }
  function headerText(headers?: Record<string, string>) {
    return Object.entries(headers ?? {}).map(([key, value]) => `${key}: ${value}`).join("\n")
  }
  function parseHeaders(value: string) {
    const out: Record<string, string> = {}
    value.split("\n").forEach((line) => {
      const index = line.indexOf(":")
      if (index > 0) out[line.slice(0, index).trim()] = line.slice(index + 1).trim()
    })
    return out
  }

  return (
    <div className="space-y-6 pt-2">
      <div className="rounded-xl border border-brand/20 bg-brand-soft/25 p-3.5">
        <div className="flex items-center gap-2 text-sm font-medium"><Bot className="size-4 text-brand" /> {tr("Workspace skills & MCP")}</div>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          {tr("Every AI agent in this workspace can use these skills and external MCP tools. Only the workspace owner can edit them.")}
        </p>
      </div>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">{tr("Skills")}</h3>
            <p className="text-xs text-muted-foreground">{tr("Reusable instructions the agent loads when relevant.")}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addSkill} disabled={!owner} className="gap-1.5"><Plus className="size-3.5" /> {tr("Add skill")}</Button>
        </div>
        {skills.length === 0 && <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">{tr("No workspace skills yet.")}</p>}
        {skills.map((skill, index) => {
          const open = openSkills.has(skill.id)
          return (
            <div key={skill.id} className="overflow-hidden rounded-xl border">
              <div className="flex items-center gap-1 px-2 py-1.5">
                <button
                  type="button"
                  onClick={() => toggleOpen(setOpenSkills, skill.id)}
                  aria-expanded={open}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left transition hover:bg-accent/40"
                >
                  <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
                  <KeyRound className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-xs font-medium", !skill.name && "text-muted-foreground/60")}>
                      {skill.name || tr("Untitled skill")}
                    </span>
                    {skill.description && <span className="block truncate text-[10px] text-muted-foreground">{skill.description}</span>}
                  </span>
                </button>
                <button type="button" onClick={() => removeSkill(skill.id)} disabled={!owner} aria-label={tr("Delete skill")} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"><Trash2 className="size-3.5" /></button>
              </div>
              {open && (
                <div className="animate-in space-y-2 border-t p-3 fade-in-0 slide-in-from-top-1">
                  <Input value={skill.name} disabled={!owner} onChange={(event) => setSkills((current) => current.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} placeholder={tr("Skill name")} className="h-8 text-xs" />
                  <Input value={skill.description} disabled={!owner} onChange={(event) => setSkills((current) => current.map((item, i) => i === index ? { ...item, description: event.target.value } : item))} placeholder={tr("Short description")} className="h-8 text-xs" />
                  <textarea value={skill.instructions} disabled={!owner} onChange={(event) => setSkills((current) => current.map((item, i) => i === index ? { ...item, instructions: event.target.value } : item))} rows={5} placeholder={tr("Instructions the agent should follow…")} className="w-full resize-y rounded-md border bg-background px-2.5 py-2 font-mono text-xs leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring/25" />
                </div>
              )}
            </div>
          )
        })}
      </section>

      <Separator />

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium">{tr("MCP servers")}</h3>
            <p className="text-xs text-muted-foreground">{tr("Remote Streamable HTTP MCP servers exposed as tools to the agent.")}</p>
          </div>
          <Button type="button" variant="outline" size="sm" onClick={addServer} disabled={!owner} className="gap-1.5"><Plus className="size-3.5" /> {tr("Add MCP server")}</Button>
        </div>
        {servers.length === 0 && <p className="rounded-lg border border-dashed px-3 py-6 text-center text-xs text-muted-foreground">{tr("No MCP servers configured.")}</p>}
        {servers.map((server, index) => {
          const open = openServers.has(server.id)
          return (
            <div key={server.id} className="overflow-hidden rounded-xl border">
              <div className="flex items-center gap-1 px-2 py-1.5">
                <button
                  type="button"
                  onClick={() => toggleOpen(setOpenServers, server.id)}
                  aria-expanded={open}
                  className="flex min-w-0 flex-1 items-center gap-2 rounded-md px-1.5 py-1 text-left transition hover:bg-accent/40"
                >
                  <ChevronRight className={cn("size-3.5 shrink-0 text-muted-foreground transition-transform", open && "rotate-90")} />
                  <Server className="size-3.5 shrink-0 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className={cn("block truncate text-xs font-medium", !server.name && "text-muted-foreground/60")}>
                      {server.name || tr("Untitled MCP server")}
                    </span>
                    <span className="block truncate font-mono text-[10px] text-muted-foreground">{server.url || "https://…"}</span>
                  </span>
                  {!server.enabled && <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] text-muted-foreground">{tr("Disabled")}</span>}
                </button>
                <button type="button" onClick={() => removeServer(server.id)} disabled={!owner} aria-label={tr("Delete MCP server")} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"><Trash2 className="size-3.5" /></button>
              </div>
              {open && (
                <div className="animate-in space-y-2 border-t p-3 fade-in-0 slide-in-from-top-1">
                  <div className="flex items-center gap-2">
                    <Input value={server.name} disabled={!owner} onChange={(event) => setServers((current) => current.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} placeholder={tr("Server name")} className="h-8 flex-1 text-xs" />
                    <label className="flex items-center gap-1 text-[10px] text-muted-foreground"><input type="checkbox" checked={server.enabled} disabled={!owner} onChange={(event) => setServers((current) => current.map((item, i) => i === index ? { ...item, enabled: event.target.checked } : item))} /> {tr("Enabled")}</label>
                  </div>
                  <Input value={server.url} disabled={!owner} onChange={(event) => setServers((current) => current.map((item, i) => i === index ? { ...item, url: event.target.value } : item))} placeholder="https://mcp.example.com/mcp" className="h-8 font-mono text-xs" />
                  <div className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground">{tr("Headers (one Key: Value per line)")}</Label>
                    <textarea value={headerText(server.headers)} disabled={!owner} onChange={(event) => setServers((current) => current.map((item, i) => i === index ? { ...item, headers: parseHeaders(event.target.value) } : item))} rows={3} placeholder="Authorization: Bearer …" className="w-full resize-y rounded-md border bg-background px-2.5 py-2 font-mono text-[11px] leading-5 outline-none" />
                  </div>
                </div>
              )}
            </div>
          )
        })}
      </section>

      <div className="flex justify-end">
        <Button type="button" onClick={() => void save()} disabled={!owner || saving}>{saving ? tr("Saving…") : tr("Save agent settings")}</Button>
      </div>
    </div>
  )
}
