import { useEffect, useState } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import {
  Check,
  ChevronsDownUp,
  Inbox,
  ChevronsUpDown,
  Clock3,
  FileText,
  Home,
  LogOut,
  Plus,
  Search,
  Settings,
  ShieldCheck,
  Star,
  Trash2,
} from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { useAuthStore } from "@/stores/auth"
import { useWorkspaceStore } from "@/stores/workspace"
import { useUIStore } from "@/stores/ui"
import { modKey } from "@/lib/utils"
import { pageTitle, roleInWorkspace } from "@/lib/tree"
import type { PageSummary } from "@/lib/types"
import { cn, initials } from "@/lib/utils"
import { LogoMark } from "@/components/logo"
import { WorkspaceIcon } from "@/components/app/workspace-icon"
import { PageTree } from "@/components/app/page-tree"
import { tr } from "@/lib/i18n"
import { PageActionsMenu } from "@/components/app/page-actions"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

const WORKSPACE_ICONS = ["🧭", "🌊", "🚀", "🌱", "🔥", "🌸", "📚", "🏠", "🎨", "🧠"]

export function Sidebar() {
  const sidebarOpen = useUIStore((state) => state.sidebarOpen)
  const sidebarCollapsed = useUIStore((state) => state.sidebarCollapsed)
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen)
  const location = useLocation()

  useEffect(() => {
    setSidebarOpen(false)
  }, [location.pathname, setSidebarOpen])

  return (
    <>
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/35 backdrop-blur-[1px] md:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex w-[276px] shrink-0 flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-transform duration-200 md:static md:z-0 md:translate-x-0",
          sidebarOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full",
          sidebarCollapsed && "md:hidden",
        )}
      >
        <SidebarContent />
      </aside>
    </>
  )
}

function SidebarContent() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((state) => state.user)
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const activeId = useWorkspaceStore((state) => state.activeId)
  const pages = useWorkspaceStore((state) => state.pages)
  const createPage = useWorkspaceStore((state) => state.createPage)
  const setSettingsOpen = useUIStore((state) => state.setSettingsOpen)
  const setSearchOpen = useUIStore((state) => state.setSearchOpen)
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen)
  const [showFavorites, setShowFavorites] = useState(true)
  const [filter, setFilter] = useState("")
  const [pendingProposals, setPendingProposals] = useState(0)

  const favorites = pages.filter((page) => page.favorite)
  const recent = [...pages]
    .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
    .slice(0, 6)
  const activePageId = location.pathname.startsWith("/page/")
    ? location.pathname.split("/")[2]
    : null
  const activeWorkspace = workspaces.find((workspace) => workspace.id === activeId)
  const readOnly = roleInWorkspace(activeWorkspace, user?.id) === "viewer"
  const opsUnlocked = typeof sessionStorage !== "undefined" && !!sessionStorage.getItem("motion.ops.token")

  useEffect(() => {
    if (!activeId) return
    let alive = true
    function loadPending() {
      api.proposals
        .list(activeId!, "pending")
        .then((items) => {
          if (alive) setPendingProposals(items.length)
        })
        .catch(() => undefined)
    }
    loadPending()
    window.addEventListener("motion:proposals-changed", loadPending)
    return () => {
      alive = false
      window.removeEventListener("motion:proposals-changed", loadPending)
    }
  }, [activeId])

  async function onNewPage() {
    if (readOnly) {
      toast.error(tr("You only have view access"))
      return
    }
    try {
      const page = await createPage(null)
      navigate(`/page/${page.id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create page")
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 px-3 pb-1 pt-3">
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <WorkspaceSwitcher />
        </div>
        <button
          type="button"
          onClick={() => setSidebarOpen(false)}
          className="flex size-7 items-center justify-center rounded-md text-muted-foreground hover:bg-sidebar-accent md:hidden"
          aria-label={tr("Close sidebar")}
        >
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
        </button>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <nav className="space-y-0.5 px-2 pb-4 pt-1">
          <SidebarButton
            icon={<Search className="size-3.5" />}
            label={tr("Search")}
            trailing={<span className="rounded border border-sidebar-border bg-background/40 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">{modKey()} K</span>}
            onClick={() => setSearchOpen(true)}
          />
          <SidebarButton
            icon={<Home className="size-3.5" />}
            label={tr("Home")}
            active={location.pathname === "/"}
            onClick={() => navigate("/")}
          />
          <SidebarButton
            icon={<Inbox className="size-3.5" />}
            label={tr("Agent Inbox")}
            trailing={pendingProposals > 0 ? (
              <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold text-amber-700 dark:text-amber-300">
                {pendingProposals}
              </span>
            ) : undefined}
            active={location.pathname === "/inbox"}
            onClick={() => navigate("/inbox")}
          />
          <RecentMenu pages={recent} />
          <div className="relative px-0.5 pt-1.5">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-muted-foreground/60" />
            <Input
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              placeholder={tr("Filter pages…")}
              aria-label={tr("Filter pages…")}
              className="h-7 border-sidebar-border bg-background/50 pl-7 pr-7 text-xs shadow-none"
            />
            {filter && (
              <button
                type="button"
                onClick={() => setFilter("")}
                aria-label={tr("Clear filter")}
                className="absolute right-1.5 top-1/2 flex size-5 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent"
              >
                ×
              </button>
            )}
          </div>

          {!filter && favorites.length > 0 && (
            <div className="pt-3">
              <SectionHeader
                label={tr("Favorites")}
                open={showFavorites}
                onToggle={() => setShowFavorites((value) => !value)}
              />
              {showFavorites && (
                <div className="mt-0.5 space-y-px">
                  {favorites.map((page) => (
                    <FavoriteRow key={page.id} page={page} active={activePageId === page.id} readOnly={readOnly} />
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="pt-3">
            <SectionHeader
              label={tr("Private")}
              open
              onToggle={() => undefined}
              action={
                <div className="flex items-center gap-0.5">
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => window.dispatchEvent(new CustomEvent("motion:collapse-all"))}
                        className="flex size-5 items-center justify-center rounded text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
                        aria-label={tr("Collapse all")}
                      >
                        <ChevronsDownUp className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{tr("Collapse all")}</TooltipContent>
                  </Tooltip>
                  {!readOnly && <Tooltip>
                    <TooltipTrigger asChild>
                      <button
                        type="button"
                        onClick={() => void onNewPage()}
                        className="flex size-5 items-center justify-center rounded text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
                        aria-label={tr("New page")}
                      >
                        <Plus className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{tr("New page")}</TooltipContent>
                  </Tooltip>}
                </div>
              }
            />
            <div className="mt-0.5">
              <PageTree pages={pages} activeId={activePageId} query={filter} readOnly={readOnly} />
            </div>
          </div>

          <div className="pt-3">
            <SidebarButton
              icon={<Trash2 className="size-3.5" />}
              label={tr("Trash")}
              active={location.pathname === "/trash"}
              onClick={() => navigate("/trash")}
            />
          </div>
        </nav>
      </ScrollArea>

      <div className="border-t border-sidebar-border/80 p-2">
        {!readOnly && <button
          type="button"
          onClick={() => void onNewPage()}
          className="mb-1 flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-[13px] font-medium text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
        >
          <span className="flex size-4 items-center justify-center rounded border border-dashed border-muted-foreground/50">
            <Plus className="size-2.5" />
          </span>
          {tr("New page")}
        </button>}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-0.5">
            {opsUnlocked && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => navigate("/ops")}
                    aria-label={tr("Ops console")}
                    className="text-muted-foreground"
                  >
                    <ShieldCheck className="size-4" />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>{tr("Ops console")}</TooltipContent>
              </Tooltip>
            )}
            <Tooltip>
              <TooltipTrigger asChild>
                <Button variant="ghost" size="icon-sm" onClick={() => setSettingsOpen(true)} aria-label={tr("Settings")}>
                  <Settings className="size-4" />
                </Button>
              </TooltipTrigger>
              <TooltipContent>{tr("Settings")}</TooltipContent>
            </Tooltip>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="flex items-center gap-2 rounded-lg p-1 pr-1.5 transition hover:bg-sidebar-accent" aria-label={tr("Account menu")}>
                <Avatar className="size-6">
                  <AvatarFallback>{initials(user?.name ?? "M")}</AvatarFallback>
                </Avatar>
                <span className="max-w-[120px] truncate text-xs font-medium text-muted-foreground">
                  {user?.name ?? "Motion"}
                </span>
              </button>
            </DropdownMenuTrigger>
            <AccountMenu />
          </DropdownMenu>
        </div>
      </div>
    </>
  )
}

function SectionHeader({
  label,
  open,
  onToggle,
  action,
}: {
  label: string
  open: boolean
  onToggle: () => void
  action?: React.ReactNode
}) {
  return (
    <div className="flex h-6 items-center justify-between px-2">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center gap-1 text-[11px] font-medium text-muted-foreground transition hover:text-foreground"
      >
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={cn("transition-transform", !open && "-rotate-90")}
        >
          <path d="m6 9 6 6 6-6" />
        </svg>
        {label}
      </button>
      {action}
    </div>
  )
}

function SidebarButton({
  icon,
  label,
  trailing,
  active,
  onClick,
}: {
  icon: React.ReactNode
  label: string
  trailing?: React.ReactNode
  active?: boolean
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex h-[29px] w-full items-center gap-2 rounded-md px-2 text-[13px] transition-colors",
        active
          ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
          : "text-sidebar-foreground hover:bg-sidebar-accent/65",
      )}
    >
      <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">{icon}</span>
      <span className="flex-1 truncate text-left">{label}</span>
      {trailing}
    </button>
  )
}

function FavoriteRow({ page, active, readOnly = false }: { page: PageSummary; active: boolean; readOnly?: boolean }) {
  const navigate = useNavigate()
  return (
    <div
      data-page-id={page.id}
      className={cn(
        "group/fav flex h-[29px] items-center rounded-md pr-1 text-[13px] transition-colors",
        active ? "bg-sidebar-accent font-medium" : "hover:bg-sidebar-accent/65",
      )}
    >
      <button
        type="button"
        onClick={() => navigate(`/page/${page.id}`)}
        className="flex min-w-0 flex-1 items-center gap-2 px-2 py-0.5 text-left"
      >
        {page.icon ? (
          <span className="w-4 shrink-0 text-center text-[14px] leading-none">{page.icon}</span>
        ) : (
          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate" title={pageTitle(page.title)}>{pageTitle(page.title)}</span>
        <Star className="ml-auto size-3 shrink-0 fill-amber-400 text-amber-400" />
      </button>
      <PageActionsMenu
        page={page}
        readOnly={readOnly}
        trigger={
          <button
            type="button"
            aria-label="Page options"
            className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground opacity-0 transition hover:bg-sidebar-border/70 hover:text-foreground group-hover/fav:opacity-100 data-[state=open]:bg-sidebar-border/70 data-[state=open]:opacity-100 max-md:opacity-100"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="5" cy="12" r="1.4" />
              <circle cx="12" cy="12" r="1.4" />
              <circle cx="19" cy="12" r="1.4" />
            </svg>
          </button>
        }
      />
    </div>
  )
}

function RecentMenu({ pages }: { pages: PageSummary[] }) {
  const navigate = useNavigate()
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="flex h-[29px] w-full items-center gap-2 rounded-md px-2 text-[13px] text-sidebar-foreground transition-colors hover:bg-sidebar-accent/65 data-[state=open]:bg-sidebar-accent"
        >
          <span className="flex size-4 shrink-0 items-center justify-center text-muted-foreground">
            <Clock3 className="size-3.5" />
          </span>
          <span className="flex-1 truncate text-left">{tr("Recent")}</span>
          <ChevronsUpDown className="size-3 text-muted-foreground/60" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[248px]">
        <DropdownMenuLabel>{tr("Recently edited")}</DropdownMenuLabel>
        {pages.length === 0 ? (
          <div className="px-2 py-3 text-xs text-muted-foreground">{tr("No pages yet.")}</div>
        ) : (
          pages.map((page) => (
            <DropdownMenuItem
              key={page.id}
              onSelect={() => navigate(`/page/${page.id}`)}
              className="gap-2"
            >
              {page.icon ? (
                <span className="w-4 shrink-0 text-center text-sm leading-none">{page.icon}</span>
              ) : (
                <FileText className="size-3.5 shrink-0 text-muted-foreground" />
              )}
              <span className="min-w-0 flex-1 truncate">{pageTitle(page.title)}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {new Date(page.updatedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
              </span>
            </DropdownMenuItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

function WorkspaceSwitcher() {
  const navigate = useNavigate()
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const activeId = useWorkspaceStore((state) => state.activeId)
  const setActive = useWorkspaceStore((state) => state.setActive)
  const setSettingsOpen = useUIStore((state) => state.setSettingsOpen)
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen)
  const [createOpen, setCreateOpen] = useState(false)
  const active = workspaces.find((workspace) => workspace.id === activeId)

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={tr("Workspace menu")}
            className="flex min-w-0 flex-1 items-center gap-2 rounded-lg px-1.5 py-1.5 text-left transition hover:bg-sidebar-accent"
          >
            <span className="flex size-7 shrink-0 items-center justify-center rounded-lg border border-sidebar-border bg-background/60 text-[15px] shadow-sm">
              {active?.icon || <LogoMark className="size-6 rounded-md" />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold leading-tight">
                {active?.name ?? "Motion"}
              </span>
              <span className="block truncate text-[10px] text-muted-foreground">
                {workspaces.length === 1 ? tr("1 workspace") : tr("{n} workspaces", { n: workspaces.length })}
              </span>
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-[248px]">
          <div className="flex items-center gap-2.5 px-2 py-2">
            <Avatar className="size-8">
              <AvatarFallback>{initials(user?.name ?? "M")}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="truncate text-sm font-medium">{user?.name}</div>
              <div className="truncate text-[11px] text-muted-foreground">{user?.email}</div>
            </div>
          </div>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>{tr("Workspaces")}</DropdownMenuLabel>
          {workspaces.map((workspace) => (
            <DropdownMenuItem
              key={workspace.id}
              onSelect={() => {
                void setActive(workspace.id)
                navigate("/")
              }}
              className="gap-2"
            >
              <WorkspaceIcon value={workspace.icon} alt={workspace.name} className="text-base" />
              <span className="flex-1 truncate">{workspace.name}</span>
              {workspace.id === activeId && <Check className="size-3.5 text-brand" />}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onSelect={() => setCreateOpen(true)}>
            <Plus className="size-3.5" /> {tr("New workspace")}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
            <Settings className="size-3.5" /> {tr("Settings")}
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => {
              logout()
              navigate("/login", { replace: true })
            }}
          >
            <LogOut className="size-3.5" /> {tr("Sign out")}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CreateWorkspaceDialog open={createOpen} onOpenChange={setCreateOpen} />
    </>
  )
}

function AccountMenu() {
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const setSettingsOpen = useUIStore((state) => state.setSettingsOpen)
  const navigate = useNavigate()
  const opsUnlocked = typeof sessionStorage !== "undefined" && !!sessionStorage.getItem("motion.ops.token")
  return (
    <DropdownMenuContent align="end" className="w-56">
      <div className="px-2 py-1.5">
        <div className="text-sm font-medium">{user?.name}</div>
        <div className="truncate text-[11px] text-muted-foreground">{user?.email}</div>
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
        <Settings /> {tr("Settings")}
      </DropdownMenuItem>
      {opsUnlocked && (
        <DropdownMenuItem onSelect={() => navigate("/ops")}>
          <ShieldCheck /> {tr("Ops console")}
        </DropdownMenuItem>
      )}
      <DropdownMenuItem
        onSelect={() => {
          logout()
          navigate("/login", { replace: true })
        }}
      >
        <LogOut /> {tr("Sign out")}
      </DropdownMenuItem>
    </DropdownMenuContent>
  )
}

function CreateWorkspaceDialog({
  open,
  onOpenChange,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const createWorkspace = useWorkspaceStore((state) => state.createWorkspace)
  const navigate = useNavigate()
  const [name, setName] = useState("")
  const [icon, setIcon] = useState("🧭")
  const [pending, setPending] = useState(false)

  useEffect(() => {
    if (open) {
      setName("")
      setIcon("🧭")
    }
  }, [open])

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!name.trim() || pending) return
    setPending(true)
    try {
      await createWorkspace(name.trim(), icon)
      toast.success("Workspace created")
      onOpenChange(false)
      navigate("/")
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create workspace")
    } finally {
      setPending(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{tr("New workspace")}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-2">
            <Label>{tr("Icon")}</Label>
            <div className="flex flex-wrap gap-1.5">
              {WORKSPACE_ICONS.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setIcon(item)}
                  className={cn(
                    "flex size-9 items-center justify-center rounded-lg border text-lg transition hover:bg-accent",
                    item === icon ? "border-brand bg-brand-soft" : "border-border",
                  )}
                >
                  {item}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="workspace-name">{tr("Name")}</Label>
            <Input
              id="workspace-name"
              autoFocus
              placeholder={tr("New workspace")}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={!name.trim() || pending}>
              {tr("Create workspace")}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
