import { lazy, Suspense, useEffect } from "react"
import { Navigate, Outlet, useNavigate } from "react-router-dom"
import { useAuthStore } from "@/stores/auth"
import { useWorkspaceStore } from "@/stores/workspace"
import { useUIStore } from "@/stores/ui"
import { Sidebar } from "@/components/app/sidebar"
import { Splash } from "@/components/app/splash"

const SearchDialog = lazy(() =>
  import("@/components/app/search-dialog").then((module) => ({ default: module.SearchDialog })),
)
const SettingsDialog = lazy(() =>
  import("@/components/app/settings-dialog").then((module) => ({ default: module.SettingsDialog })),
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
  const navigate = useNavigate()

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
        <Suspense fallback={<Splash />}>
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
    </div>
  )
}
