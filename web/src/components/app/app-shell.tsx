import { lazy, Suspense, useEffect, useState } from "react"
import { Navigate, Outlet, useNavigate } from "react-router-dom"
import { useAuthStore } from "@/stores/auth"
import { useWorkspaceStore } from "@/stores/workspace"
import { useUIStore } from "@/stores/ui"
import { tr } from "@/lib/i18n"
import { isImeKeyEvent } from "@/lib/keyboard"
import { Sidebar } from "@/components/app/sidebar"
import { useWorkspaceRealtime } from "@/components/app/use-workspace-realtime"
import { Splash } from "@/components/app/splash"
import { Skeleton } from "@/components/ui/skeleton"

const SearchDialog = lazy(() =>
  import("@/components/app/search-dialog").then((module) => ({ default: module.SearchDialog })),
)
const SettingsDialog = lazy(() =>
  import("@/components/app/settings-dialog").then((module) => ({ default: module.SettingsDialog })),
)
const ShortcutsDialog = lazy(() =>
  import("@/components/app/shortcuts-dialog").then((module) => ({ default: module.ShortcutsDialog })),
)
const TaskCenter = lazy(() =>
  import("@/components/app/task-center").then((module) => ({ default: module.TaskCenter })),
)

export function AppShell() {
  const status = useAuthStore((state) => state.status)
  const bootstrap = useAuthStore((state) => state.bootstrap)
  const boot = useWorkspaceStore((state) => state.boot)
  const ready = useWorkspaceStore((state) => state.ready)
  const searchOpen = useUIStore((state) => state.searchOpen)
  const settingsOpen = useUIStore((state) => state.settingsOpen)
  const setSearchOpen = useUIStore((state) => state.setSearchOpen)
  const setSettingsOpen = useUIStore((state) => state.setSettingsOpen)
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const navigate = useNavigate()
  const activeId = useWorkspaceStore((state) => state.activeId)
  useWorkspaceRealtime(activeId)

  useEffect(() => {
    void bootstrap()
  }, [bootstrap])

  useEffect(() => {
    if (status !== "authed") return
    void boot()
  }, [status, boot])

  useEffect(() => {
    const timer = window.setTimeout(() => {
      void import("@/components/app/search-dialog")
      void import("@/components/app/settings-dialog")
    }, 1500)
    return () => window.clearTimeout(timer)
  }, [])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault()
        setSearchOpen(true)
      }
      if (event.key === "Escape") {
        // Let open dialogs/menus handle Escape first.
        if (document.querySelector('[role="dialog"], [role="menu"], [role="listbox"]')) return
        setSidebarOpen(false)
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "j") {
        event.preventDefault()
        navigate("/")
      }
      if ((event.metaKey || event.ctrlKey) && event.key === ",") {
        event.preventDefault()
        setSettingsOpen(true)
      }
      if (event.key === "?" && !event.metaKey && !event.ctrlKey) {
        const target = event.target as HTMLElement | null
        if (isImeKeyEvent(event) || (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable))) return
        event.preventDefault()
        setShortcutsOpen(true)
      }
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [setSearchOpen, setSettingsOpen, setSidebarOpen, navigate])

  if (status === "loading" || status === "guest") {
    if (status === "guest") return <Navigate to="/login" replace />
    return <Splash />
  }

  if (!ready) return <Splash />

  return (
    <div className="flex h-svh overflow-hidden bg-background">
      <Sidebar />
      <main className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <Suspense fallback={<RouteSkeleton />}>
          <Outlet />
        </Suspense>
      </main>
      {searchOpen && (
        <Suspense fallback={null}>
          <SearchDialog />
        </Suspense>
      )}
      {settingsOpen && (
        <Suspense fallback={null}>
          <SettingsDialog />
        </Suspense>
      )}
      {shortcutsOpen && (
        <Suspense fallback={null}>
          <ShortcutsDialog open onOpenChange={setShortcutsOpen} />
        </Suspense>
      )}
      <Suspense fallback={null}>
        <TaskCenter />
      </Suspense>
    </div>
  )
}


function RouteSkeleton() {
  return (
    <div className="flex h-full flex-col" aria-busy="true" aria-label={tr("Loading page")}>
      <header className="flex h-11 shrink-0 items-center gap-2 border-b border-border/70 px-3">
        <Skeleton className="size-7 rounded-md" />
        <Skeleton className="h-4 w-40" />
        <div className="ml-auto flex items-center gap-2">
          <Skeleton className="h-7 w-16 rounded-full" />
          <Skeleton className="size-7 rounded-md" />
          <Skeleton className="size-7 rounded-md" />
        </div>
      </header>
      <div className="mx-auto w-full max-w-3xl px-6 pt-14 sm:px-10">
        <Skeleton className="size-12 rounded-xl" />
        <Skeleton className="mt-5 h-9 w-2/3" />
        <div className="mt-10 space-y-3">
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-11/12" />
          <Skeleton className="h-4 w-4/5" />
          <Skeleton className="mt-8 h-4 w-1/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-10/12" />
        </div>
      </div>
    </div>
  )
}
