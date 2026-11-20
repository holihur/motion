import { useEffect, useState } from "react"
import { Link, useNavigate } from "react-router-dom"
import { AlertTriangle, Loader2 } from "lucide-react"
import { toast } from "sonner"
import { useAuthStore } from "@/stores/auth"
import { api } from "@/lib/api"
import { Logo } from "@/components/logo"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { tr } from "@/lib/i18n"

type PasswordMode = "keep" | "sso_only"

export function OIDCCallbackPage() {
  const completeOIDC = useAuthStore((state) => state.completeOIDC)
  const navigate = useNavigate()
  const [error, setError] = useState("")
  const [askPasswordMode, setAskPasswordMode] = useState(false)
  const [savingMode, setSavingMode] = useState(false)

  useEffect(() => {
    let alive = true
    completeOIDC()
      .then(({ askPasswordMode: ask }) => {
        if (!alive) return
        // Linking SSO to an account that still signs in with a password is a
        // user decision: ask before disabling anything.
        if (ask) setAskPasswordMode(true)
        else navigate("/", { replace: true })
      })
      .catch((err) => {
        if (!alive) return
        setError(err instanceof Error ? err.message : tr("Single sign-on failed"))
      })
    return () => {
      alive = false
    }
  }, [completeOIDC, navigate])

  async function choosePasswordMode(mode: PasswordMode) {
    if (savingMode) return
    setSavingMode(true)
    try {
      await api.auth.setOIDCPasswordMode(mode)
      if (mode === "sso_only") toast.success(tr("Password sign-in disabled. Use single sign-on next time."))
    } catch (err) {
      toast.error(err instanceof Error ? err.message : tr("Could not update sign-in settings"))
    } finally {
      setSavingMode(false)
      setAskPasswordMode(false)
      navigate("/", { replace: true })
    }
  }

  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-5 bg-background px-6 text-center">
      <Logo markClassName="size-11" />
      {error ? (
        <>
          <div className="flex size-11 items-center justify-center rounded-2xl bg-destructive/10 text-destructive">
            <AlertTriangle className="size-5" />
          </div>
          <div>
            <h1 className="text-lg font-semibold">{tr("We couldn’t sign you in")}</h1>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">{error}</p>
          </div>
          <Button asChild variant="outline">
            <Link to="/login">{tr("Back to sign in")}</Link>
          </Button>
        </>
      ) : (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          {!askPasswordMode && <Loader2 className="size-4 animate-spin" />} {tr("Finishing sign-in…")}
        </div>
      )}

      <Dialog
        open={askPasswordMode}
        onOpenChange={(open) => {
          // Closing the dialog keeps the password, which is the safe default.
          if (!open) void choosePasswordMode("keep")
        }}
      >
        <DialogContent className="max-w-md" showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>{tr("Keep your password sign-in?")}</DialogTitle>
            <DialogDescription>
              {tr("This email already signs in with a password. Disable the password and use single sign-on only?")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:justify-end">
            <Button variant="outline" disabled={savingMode} onClick={() => void choosePasswordMode("keep")}>
              {tr("Keep password")}
            </Button>
            <Button disabled={savingMode} onClick={() => void choosePasswordMode("sso_only")}>
              {savingMode ? <Loader2 className="size-4 animate-spin" /> : null}
              {tr("Use SSO only")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
