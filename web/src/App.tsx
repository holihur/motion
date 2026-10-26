import { lazy, Suspense } from "react"
import { BrowserRouter, Navigate, Route, Routes, useParams } from "react-router-dom"
import { Splash } from "@/components/app/splash"

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
  import("@/components/editor/page-editor").then((module) => ({ default: module.PageEditor })),
)
const TrashView = lazy(() =>
  import("@/components/app/trash-view").then((module) => ({ default: module.TrashView })),
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
          <Route path="/login" element={<AuthPage />} />
          <Route path="/auth/callback" element={<OIDCCallbackPage />} />
          <Route path="/ops" element={<OpsView />} />
          <Route element={<AppShell />}>
            <Route index element={<HomeView />} />
            <Route path="page/:pageId" element={<PageRoute />} />
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
