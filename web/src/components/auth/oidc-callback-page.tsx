import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { AlertTriangle, Loader2 } from "lucide-react"
import { useAuthStore } from "@/stores/auth"
import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"

export function OIDCCallbackPage() {
  const completeOIDC = useAuthStore((state) => state.completeOIDC)
  const navigate = useNavigate()
  const [error, setError] = useState("")

  useEffect(() => {
    let alive = true
    completeOIDC()
      .then(() => {
        if (alive) navigate("/", { replace: true })
      })
      .catch((err) => {
        if (!alive) return
        setError(err instanceof Error ? err.message : "Single sign-on failed")
      })
    return () => {
      alive = false
    }
  }, [completeOIDC, navigate])

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-5 bg-background px-6 text-center">
      <Logo markClassName="size-11" />
      {error ? (
        <>
          <div className="flex size-11 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">We couldn’t sign you in</h1>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">{error}</p>
          </div>
          <Button asChild variant="outline">
            <Link to="/login">Back to sign in</Link>
          </Button>
        </>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Finishing sign-in…
        </div>
      )}
    </div>
  )
}
