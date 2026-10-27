import { useEffect, useState } from "react"
import { Bot, KeyRound, Plus, Server, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { tr } from "@/lib/i18n"
import { useWorkspaceStore } from "@/stores/workspace"
import { useAuthStore } from "@/stores/auth"
import type { WorkspaceMCP, WorkspaceSkill } from "@/lib/types"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"

function uid() {
  return crypto.randomUUID()
}

export function WorkspaceAgentSettings() {
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const activeId = useWorkspaceStore((state) => state.activeId)
  const user = useAuthStore((state) => state.user)
  const workspace = workspaces.find((item) => item.id === activeId)
  const [skills, setSkills] = useState<WorkspaceSkill[]>([])
  const [servers, setServers] = useState<WorkspaceMCP[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
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
    setSkills((current) => [...current, { id: uid(), name: "", description: "", instructions: "" }])
  }
  function addServer() {
    setServers((current) => [...current, { id: uid(), name: "", url: "", headers: {}, enabled: true }])
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
        {skills.map((skill, index) => (
          <div key={skill.id} className="space-y-2 rounded-xl border p-3">
            <div className="flex items-center gap-2">
              <KeyRound className="size-3.5 text-muted-foreground" />
              <Input value={skill.name} disabled={!owner} onChange={(event) => setSkills((current) => current.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} placeholder={tr("Skill name")} className="h-8 flex-1 text-xs" />
              <button type="button" onClick={() => setSkills((current) => current.filter((_, i) => i !== index))} disabled={!owner} aria-label={tr("Delete skill")} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-3.5" /></button>
            </div>
            <Input value={skill.description} disabled={!owner} onChange={(event) => setSkills((current) => current.map((item, i) => i === index ? { ...item, description: event.target.value } : item))} placeholder={tr("Short description")} className="h-8 text-xs" />
            <textarea value={skill.instructions} disabled={!owner} onChange={(event) => setSkills((current) => current.map((item, i) => i === index ? { ...item, instructions: event.target.value } : item))} rows={5} placeholder={tr("Instructions the agent should follow…")} className="w-full resize-y rounded-md border bg-background px-2.5 py-2 font-mono text-xs leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring/25" />
          </div>
        ))}
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
        {servers.map((server, index) => (
          <div key={server.id} className="space-y-2 rounded-xl border p-3">
            <div className="flex items-center gap-2">
              <Server className="size-3.5 text-muted-foreground" />
              <Input value={server.name} disabled={!owner} onChange={(event) => setServers((current) => current.map((item, i) => i === index ? { ...item, name: event.target.value } : item))} placeholder={tr("Server name")} className="h-8 flex-1 text-xs" />
              <label className="flex items-center gap-1 text-[10px] text-muted-foreground"><input type="checkbox" checked={server.enabled} disabled={!owner} onChange={(event) => setServers((current) => current.map((item, i) => i === index ? { ...item, enabled: event.target.checked } : item))} /> {tr("Enabled")}</label>
              <button type="button" onClick={() => setServers((current) => current.filter((_, i) => i !== index))} disabled={!owner} aria-label={tr("Delete MCP server")} className="rounded p-1.5 text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="size-3.5" /></button>
            </div>
            <Input value={server.url} disabled={!owner} onChange={(event) => setServers((current) => current.map((item, i) => i === index ? { ...item, url: event.target.value } : item))} placeholder="https://mcp.example.com/mcp" className="h-8 font-mono text-xs" />
            <div className="space-y-1">
              <Label className="text-[10px] text-muted-foreground">{tr("Headers (one Key: Value per line)")}</Label>
              <textarea value={headerText(server.headers)} disabled={!owner} onChange={(event) => setServers((current) => current.map((item, i) => i === index ? { ...item, headers: parseHeaders(event.target.value) } : item))} rows={3} placeholder="Authorization: Bearer …" className="w-full resize-y rounded-md border bg-background px-2.5 py-2 font-mono text-[11px] leading-5 outline-none" />
            </div>
          </div>
        ))}
      </section>

      <div className="flex justify-end">
        <Button type="button" onClick={() => void save()} disabled={!owner || saving}>{saving ? tr("Saving…") : tr("Save agent settings")}</Button>
      </div>
    </div>
  )
}
