import { lazy, Suspense, useEffect, useRef } from "react"
import { BrowserRouter, Navigate, Route, Routes, useLocation, useNavigate, useParams } from "react-router-dom"
import { toast } from "sonner"
import { Splash } from "@/components/app/splash"
import { RouteErrorBoundary } from "@/components/app/route-error-boundary"
import { loadPageEditor } from "@/lib/route-preload"
import { useWorkspaceStore } from "@/stores/workspace"
import { cacheCreatedPage } from "@/lib/created-page-cache"
import { tr } from "@/lib/i18n"

const AuthPage = lazy(() =>
  import("@/components/auth/auth-page").then((module) => ({ default: module.AuthPage })),
)
const AppShell = lazy(() =>
  import("@/components/app/app-shell").then((module) => ({ default: module.AppShell })),
)
const HomeView = lazy(() =>
  import("@/components/app/home-view").then((module) => ({ default: module.HomeView })),
)
const PageEditor = lazy(() =>
  loadPageEditor().then((module) => ({ default: module.PageEditor })),
)
const TrashView = lazy(() =>
  import("@/components/app/trash-view").then((module) => ({ default: module.TrashView })),
)
const AgentInboxView = lazy(() =>
  import("@/components/agents/agent-inbox-view").then((module) => ({
    default: module.AgentInboxView,
  })),
)
const OpsView = lazy(() =>
  import("@/components/ops/ops-view").then((module) => ({ default: module.OpsView })),
)
const OIDCCallbackPage = lazy(() =>
  import("@/components/auth/oidc-callback-page").then((module) => ({
    default: module.OIDCCallbackPage,
  })),
)

export default function App() {
  return (
    <BrowserRouter>
      <Suspense fallback={<Splash />}>
        <Routes>
          <Route path="/login" element={<RouteErrorBoundary><AuthPage /></RouteErrorBoundary>} />
          <Route path="/auth/callback" element={<OIDCCallbackPage />} />
          <Route path="/ops" element={<OpsView />} />
          <Route element={<RouteErrorBoundary><AppShell /></RouteErrorBoundary>}>
            <Route index element={<HomeView />} />
            <Route path="page/new" element={<NewPageRoute />} />
            <Route
              path="page/:pageId"
              element={
                <Suspense fallback={<EditorSkeleton />}>
                  <PageRoute />
                </Suspense>
              }
            />
            <Route path="inbox" element={<AgentInboxView />} />
            <Route path="trash" element={<TrashView />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  )
}

function PageRoute() {
  const { pageId } = useParams<{ pageId: string }>()
  return <PageEditor key={pageId} />
}

function EditorSkeleton() {
  return (
    <div data-editor-skeleton className="flex h-full flex-col">
      <div className="flex h-11 shrink-0 items-center gap-2 border-b border-border/70 px-3">
        <div className="size-5 animate-pulse rounded bg-muted" />
        <div className="h-3 w-28 animate-pulse rounded bg-muted" />
      </div>
      <div className="mx-auto w-full max-w-3xl flex-1 px-6 py-14 sm:px-10">
        <div className="h-9 w-2/3 animate-pulse rounded-md bg-muted" />
        <div className="mt-7 space-y-3">
          {[96, 88, 94, 70].map((width, index) => (
            <div key={index} className="h-3.5 animate-pulse rounded bg-muted" style={{ width: `${width}%` }} />
          ))}
        </div>
      </div>
    </div>
  )
}

// Creates the page after navigating so the editor skeleton appears instantly
// instead of waiting for the create request first.
function NewPageRoute() {
  const navigate = useNavigate()
  const location = useLocation()
  const createPage = useWorkspaceStore((state) => state.createPage)
  const started = useRef(false)
  const parentId = (location.state as { parentId?: string | null } | null)?.parentId ?? null

  useEffect(() => {
    if (started.current) return
    started.current = true
    let alive = true
    void createPage(parentId, { deferRefresh: true })
      .then((page) => {
        if (!alive) return
        cacheCreatedPage(page)
        navigate(`/page/${page.id}`, { replace: true })
        // Refresh the sidebar tree after the editor has mounted, so a large
        // workspace tree cannot block the first paint of the new page.
        window.setTimeout(() => {
          void useWorkspaceStore.getState().refreshPages().catch(() => {})
        }, 1200)
      })
      .catch((error) => {
        if (!alive) return
        toast.error(error instanceof Error ? error.message : tr("Could not create page"))
        navigate("/", { replace: true })
      })
    return () => {
      alive = false
    }
  }, [createPage, navigate, parentId])

  return <EditorSkeleton />
}
