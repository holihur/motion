import { useEffect, useState } from "react"
import { Check, Copy, Crown, Loader2, Mail, Trash2, UserPlus, Users } from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import type { Member, Page } from "@/lib/types"
import { cn, initials } from "@/lib/utils"
import { useAuthStore } from "@/stores/auth"
import { tr } from "@/lib/i18n"
import { useWorkspaceStore } from "@/stores/workspace"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"

export function ShareDialog({
  open,
  onOpenChange,
  page,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  page: Page
}) {
  const user = useAuthStore((state) => state.user)
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const workspace = workspaces.find((item) => item.id === page.workspaceId)
  const [members, setMembers] = useState<Member[]>([])
  const [loading, setLoading] = useState(false)
  const [email, setEmail] = useState("")
  const [role, setRole] = useState<"editor" | "viewer">("editor")
  const [pending, setPending] = useState(false)

  const isOwner = workspace?.ownerId === user?.id

  useEffect(() => {
    if (!open || !workspace) return
    setLoading(true)
    api.workspaces
      .members(workspace.id)
      .then(setMembers)
      .catch((error) => toast.error(error instanceof Error ? error.message : "Could not load members"))
      .finally(() => setLoading(false))
  }, [open, workspace?.id])

  async function refresh() {
    if (!workspace) return
    const next = await api.workspaces.members(workspace.id)
    setMembers(next)
  }

  async function invite(event: React.FormEvent) {
    event.preventDefault()
    if (!workspace || !email.trim() || pending) return
    setPending(true)
    try {
      await api.workspaces.invite(workspace.id, email.trim(), role)
      setEmail("")
      await refresh()
      toast.success(tr("Invitation added"), {
        description: tr("They will see this workspace in their workspace menu."),
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not invite that person")
    } finally {
      setPending(false)
    }
  }

  async function changeRole(member: Member, nextRole: "editor" | "viewer") {
    if (!workspace) return
    try {
      await api.workspaces.updateMember(workspace.id, member.userId, nextRole)
      await refresh()
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not change role")
    }
  }

  async function removeMember(member: Member) {
    if (!workspace) return
    try {
      await api.workspaces.removeMember(workspace.id, member.userId)
      await refresh()
      toast.success(`${member.name} was removed`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not remove member")
    }
  }

  function copyLink() {
    void navigator.clipboard.writeText(`${window.location.origin}/page/${page.id}`).then(
      () => toast.success(tr("Page link copied")),
      () => toast.error(tr("Could not copy link")),
    )
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Users className="size-4 text-brand" /> {tr("Share “{title}”", { title: page.title.trim() || tr("Untitled") })}
          </DialogTitle>
          <DialogDescription>
            {tr("Everyone with edit access can work on this page with you, live.")}
          </DialogDescription>
        </DialogHeader>

        {isOwner && (
          <form onSubmit={invite} className="flex flex-col gap-2 rounded-xl border bg-muted/25 p-3 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <Mail className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="teammate@example.com"
                className="h-8 pl-8 text-xs"
                type="email"
              />
            </div>
            <select
              value={role}
              onChange={(event) => setRole(event.target.value as "editor" | "viewer")}
              className="h-8 rounded-md border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
            >
              <option value="editor">{tr("Can edit")}</option>
              <option value="viewer">{tr("Can view")}</option>
            </select>
            <Button type="submit" size="sm" className="h-8 gap-1.5" disabled={!email.trim() || pending}>
              {pending ? <Loader2 className="size-3.5 animate-spin" /> : <UserPlus className="size-3.5" />}
              {tr("Invite")}
            </Button>
          </form>
        )}

        <div className="space-y-1">
          <div className="flex items-center justify-between px-1 pb-1">
            <span className="text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {tr("People with access")}
            </span>
            <span className="text-[11px] text-muted-foreground">{loading ? "…" : members.length}</span>
          </div>
          {members.map((member) => (
            <div key={member.userId} className="flex items-center gap-2.5 rounded-lg px-1 py-1.5 hover:bg-accent/40">
              <Avatar className="size-7">
                <AvatarFallback>{initials(member.name)}</AvatarFallback>
              </Avatar>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 truncate text-xs font-medium">
                  {member.name}
                  {member.isOwner && <Crown className="size-3 text-amber-500" />}
                  {member.userId === user?.id && (
                    <span className="rounded bg-muted px-1 text-[9px] text-muted-foreground">{tr("You")}</span>
                  )}
                </div>
                <div className="truncate text-[10px] text-muted-foreground">{member.email}</div>
              </div>
              {isOwner && !member.isOwner ? (
                <>
                  <select
                    value={member.role}
                    onChange={(event) => void changeRole(member, event.target.value as "editor" | "viewer")}
                    className="h-7 rounded-md border bg-background px-1.5 text-[10px] text-muted-foreground outline-none"
                  >
                    <option value="editor">{tr("Editor")}</option>
                    <option value="viewer">{tr("Viewer")}</option>
                  </select>
                  <Button
                    variant="ghost"
                    size="icon-xs"
                    className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
                    onClick={() => void removeMember(member)}
                    aria-label={tr("Remove") + " " + member.name}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </>
              ) : (
                <span
                  className={cn(
                    "rounded-full px-2 py-0.5 text-[10px] font-medium",
                    member.role === "owner"
                      ? "bg-amber-500/10 text-amber-700 dark:text-amber-300"
                      : "bg-muted text-muted-foreground",
                  )}
                >
                  {member.role === "owner" ? "Owner" : member.role === "editor" ? "Editor" : "Viewer"}
                </span>
              )}
            </div>
          ))}
          {!loading && members.length === 0 && (
            <p className="px-1 py-4 text-center text-xs text-muted-foreground">{tr("No members yet.")}</p>
          )}
        </div>

        <div className="flex flex-col gap-2 rounded-xl border bg-muted/20 p-3 text-[11px] text-muted-foreground">
          <div className="flex items-center gap-1.5 font-medium text-foreground">
            <span className="size-1.5 rounded-full bg-emerald-500" /> {tr("Live collaboration is on")}
          </div>
          <p>{tr("Edits, comments and presence sync instantly while this page is open.")}</p>
          <div className="flex flex-wrap items-center gap-2 pt-1">
            <Button variant="outline" size="sm" className="h-7 gap-1.5 text-[11px]" onClick={copyLink}>
              <Copy className="size-3" /> {tr("Copy page link")}
            </Button>
            <span className="text-[10px]">{tr("Invite people by the email they use for Motion.")}</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
