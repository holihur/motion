import { useEffect, useState } from "react"
import { Navigate, useNavigate, useSearchParams } from "react-router-dom"
import {
  ArrowRight,
  Check,
  Eye,
  EyeOff,
  Loader2,
  LockKeyhole,
  Mail,
  Sparkles,
  UserRound,
} from "lucide-react"
import { useAuthStore } from "@/stores/auth"
import { tr } from "@/lib/i18n"
import { LanguageToggle } from "@/components/language-toggle"
import { api } from "@/lib/api"
import { Logo } from "@/components/logo"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"

type Mode = "login" | "register"

export function AuthPage() {
  const status = useAuthStore((state) => state.status)
  const login = useAuthStore((state) => state.login)
  const register = useAuthStore((state) => state.register)
  const bootstrap = useAuthStore((state) => state.bootstrap)
  const navigate = useNavigate()

  const [mode, setMode] = useState<Mode>("login")
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState("")
  const [pending, setPending] = useState(false)
  const [oidc, setOIDC] = useState<{ enabled: boolean; name: string } | null>(null)
  const [searchParams] = useSearchParams()

  useEffect(() => {
    document.title = tr("Sign in") + " · Motion"
    void bootstrap()
    api.auth
      .config()
      .then((config) => setOIDC(config.oidc))
      .catch(() => undefined)
  }, [bootstrap])

  useEffect(() => {
    const message = searchParams.get("error")
    if (message) setError(message)
  }, [searchParams])

  if (status === "authed") return <Navigate to="/" replace />

  async function submit(event?: React.FormEvent) {
    event?.preventDefault()
    setError("")
    if (mode === "register" && name.trim().length === 0) {
      setError(tr("Please tell us your name."))
      return
    }
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim())) {
      setError(tr("Please enter a valid email address."))
      return
    }
    if (password.length < 8) {
      setError(tr("Password must be at least 8 characters."))
      return
    }
    setPending(true)
    try {
      if (mode === "login") {
        await login(email.trim(), password)
      } else {
        await register(name.trim(), email.trim(), password)
      }
      navigate("/", { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("Something went wrong."))
    } finally {
      setPending(false)
    }
  }

  async function useDemo() {
    setError("")
    setPending(true)
    try {
      await login("demo@motion.app", "demo1234")
      navigate("/", { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : "Demo is unavailable.")
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="relative flex min-h-svh flex-col overflow-hidden bg-background lg:grid lg:grid-cols-[1.08fr_1fr]">
      <div className="pointer-events-none absolute -left-32 top-24 size-96 rounded-full bg-brand/20 blur-3xl animate-float-slow lg:size-[32rem]" />
      <div className="pointer-events-none absolute -bottom-40 right-1/4 size-96 rounded-full bg-brand-two/20 blur-3xl animate-float-slower" />

      {/* Brand panel */}
      <section className="relative hidden flex-col justify-between overflow-hidden border-r border-border/60 bg-sidebar/70 p-12 lg:flex">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_20%_10%,var(--brand-soft),transparent_42%)]" />
        <Logo className="relative" markClassName="size-10" />

        <div className="relative z-10 max-w-lg">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-border/80 bg-background/70 px-3 py-1 text-xs font-medium text-muted-foreground shadow-sm backdrop-blur">
            <Sparkles className="size-3.5 text-brand" />
            {tr("A calmer place for your thoughts")}
          </div>
          <h1 className="text-5xl font-semibold leading-[1.05] tracking-tight text-foreground">
            {tr("Write, plan and")}
            <br />
            <span className="brand-text">{tr("keep moving.")}</span>
          </h1>
          <p className="mt-5 max-w-md text-[15px] leading-7 text-muted-foreground">
            {tr("Motion is a lightweight workspace for notes, docs and the small ideas in between. Beautifully simple, quietly powerful.")}
          </p>

          {/* Little product mock */}
          <div className="relative mt-12 w-full max-w-md">
            <div className="absolute -inset-4 rounded-[28px] bg-gradient-to-br from-brand/10 to-brand-two/10 blur-2xl" />
            <div className="relative rotate-[-1.4deg] rounded-2xl border border-border/80 bg-background/90 p-5 shadow-[0_24px_60px_-30px_rgba(0,0,0,0.35)] backdrop-blur">
              <div className="flex items-center gap-2 text-sm font-medium">
                <span className="text-lg">🗓️</span>
                {tr("Weekly Notes")}
                <span className="ml-auto text-[10px] font-normal text-muted-foreground">{tr("Edited just now")}</span>
              </div>
              <div className="mt-4 space-y-2.5">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="flex size-4 items-center justify-center rounded border border-brand/60 bg-brand/15">
                    <Check className="size-3 text-brand" />
                  </span>
                  <span className="line-through decoration-muted-foreground/40">{tr("Polish the block editor")}</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="flex size-4 items-center justify-center rounded border border-muted-foreground/30" />
                  {tr("Ship page covers and emoji picker")}
                </div>
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span className="flex size-4 items-center justify-center rounded border border-muted-foreground/30" />
                  {tr("Write onboarding notes")}
                </div>
                <div className="mt-3 rounded-lg bg-amber-100/70 px-3 py-2 text-xs text-amber-950 dark:bg-amber-400/10 dark:text-amber-100">
                  💡 {tr("Keep the scope small. Momentum beats perfection.")}
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="relative flex items-center justify-between text-xs text-muted-foreground">
          <span>© {new Date().getFullYear()} Motion</span>
          <span className="flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            {tr("All systems operational")}
          </span>
        </div>
      </section>

      {/* Form panel */}
      <section className="relative flex min-h-svh flex-col">
        <header className="flex items-center justify-between p-6 lg:justify-end">
          <Logo className="lg:hidden" />
          <div className="flex items-center gap-1">
            <LanguageToggle compact />
            <ThemeToggle />
          </div>
        </header>

        <div className="flex flex-1 items-center justify-center px-5 pb-16 pt-4">
          <div className="w-full max-w-[400px] animate-rise">
            <div className="mb-8">
              <h2 className="text-2xl font-semibold tracking-tight">
                {mode === "login" ? tr("Welcome back") : tr("Create your account")}
              </h2>
              <p className="mt-2 text-sm text-muted-foreground">
                {mode === "login"
                  ? tr("Sign in to pick up where you left off.")
                  : tr("A fresh workspace is waiting for you.")}
              </p>
            </div>

            {oidc?.enabled && (
              <div className="mb-5 space-y-4">
                <Button
                  type="button"
                  variant="outline"
                  className="h-10 w-full gap-2"
                  onClick={() => {
                    window.location.href = "/api/auth/oidc/start"
                  }}
                >
                  <LockKeyhole className="size-4" />
                  {oidc.name || tr("Single sign-on")}
                </Button>
                <div className="flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-[11px] uppercase tracking-widest text-muted-foreground">or</span>
                  <div className="h-px flex-1 bg-border" />
                </div>
              </div>
            )}

            <form onSubmit={submit} noValidate className="space-y-4">
              {mode === "register" && (
                <div className="space-y-1.5">
                  <Label htmlFor="name">{tr("Name")}</Label>
                  <div className="relative">
                    <UserRound className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input
                      id="name"
                      autoComplete="name"
                      placeholder="Ada Lovelace"
                      value={name}
                      onChange={(event) => setName(event.target.value)}
                      className="h-10 pl-9"
                    />
                  </div>
                </div>
              )}

              <div className="space-y-1.5">
                <Label htmlFor="email">{tr("Email")}</Label>
                <div className="relative">
                  <Mail className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    autoComplete="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    className="h-10 pl-9"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">{tr("Password")}</Label>
                  <span className="text-[11px] text-muted-foreground">{tr("At least 8 characters")}</span>
                </div>
                <div className="relative">
                  <LockKeyhole className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    autoComplete={mode === "login" ? "current-password" : "new-password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    className="h-10 pl-9 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((value) => !value)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                  </button>
                </div>
              </div>

              {error && (
                <div className="rounded-lg border border-destructive/25 bg-destructive/8 px-3 py-2.5 text-[13px] text-destructive">
                  {error}
                </div>
              )}

              <Button type="submit" className="h-10 w-full" disabled={pending}>
                {pending ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <>
                    {mode === "login" ? tr("Sign in") : tr("Create account")}
                    <ArrowRight className="size-4" />
                  </>
                )}
              </Button>
            </form>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-border" />
              <span className="text-[11px] uppercase tracking-widest text-muted-foreground">or</span>
              <div className="h-px flex-1 bg-border" />
            </div>

            <Button variant="outline" className="h-10 w-full" onClick={useDemo} disabled={pending}>
              <span className="text-base leading-none">✨</span>
              {tr("Explore the demo workspace")}
            </Button>

            <p className="mt-8 text-center text-sm text-muted-foreground">
              {mode === "login" ? tr("New to Motion?") : tr("Already have an account?")}{" "}
              <button
                type="button"
                className="font-medium text-foreground underline-offset-4 hover:underline"
                onClick={() => {
                  setMode((value) => (value === "login" ? "register" : "login"))
                  setError("")
                }}
              >
                {mode === "login" ? tr("Create an account") : tr("Sign in")}
              </button>
            </p>

            <p className="mt-6 text-center text-[11px] leading-5 text-muted-foreground/70">
              {tr("Demo account: demo@motion.app · demo1234")}
            </p>
          </div>
        </div>
      </section>
    </div>
  )
}
