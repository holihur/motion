import { useEffect, useMemo, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowUpRight,
  Clock3,
  FilePlus2,
  FileText,
  Plus,
  Search,
  Settings,
  Sparkles,
  Star,
  X,
} from "lucide-react"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { PAGE_TEMPLATES, templateBlocks, type PageTemplate } from "@/lib/templates"
import { formatDate, formatRelative, greeting, initials, modKey } from "@/lib/utils"
import { pageTitle } from "@/lib/tree"
import { tr } from "@/lib/i18n"
import { markOnboardingStep, useOnboardingProgress, type OnboardingStep } from "@/lib/onboarding"
import { useAuthStore } from "@/stores/auth"
import { useWorkspaceStore } from "@/stores/workspace"
import { useUIStore } from "@/stores/ui"
import { SidebarToggle } from "@/components/app/sidebar-toggle"
import { ThemeToggle } from "@/components/theme-toggle"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"
import { PageActionsMenu } from "@/components/app/page-actions"

export function HomeView() {
  const user = useAuthStore((state) => state.user)
  const pages = useWorkspaceStore((state) => state.pages)
  const workspaces = useWorkspaceStore((state) => state.workspaces)
  const activeId = useWorkspaceStore((state) => state.activeId)
  const createPage = useWorkspaceStore((state) => state.createPage)
  const setSearchOpen = useUIStore((state) => state.setSearchOpen)
  const setSettingsOpen = useUIStore((state) => state.setSettingsOpen)
  const [showOnboarding, setShowOnboarding] = useState(() => localStorage.getItem("motion.onboarding.dismissed") !== "1")
  const onboardingProgress = useOnboardingProgress()
  const [creatingTemplate, setCreatingTemplate] = useState("")
  const navigate = useNavigate()

  const workspace = workspaces.find((item) => item.id === activeId)
  const recent = useMemo(
    () =>
      [...pages]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 6),
    [pages],
  )
  const favorites = pages.filter((page) => page.favorite)
  const firstName = user?.name?.split(/\s+/)[0] || "there"

  useEffect(() => {
    document.title = tr("Home") + " · Motion"
  }, [])

  useEffect(() => {
    if (pages.length > 0) markOnboardingStep("page")
  }, [pages.length])

  async function newPage() {
    try {
      const page = await createPage(null)
      navigate(`/page/${page.id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not create page")
    }
  }

  async function useTemplate(template: PageTemplate) {
    if (creatingTemplate) return
    setCreatingTemplate(template.id)
    try {
      const page = await createPage(null)
      const blocks = templateBlocks(template)
      await Promise.all([
        api.pages.update(page.id, { title: template.title, icon: template.icon }),
        api.pages.saveBlocks(page.id, blocks),
      ])
      await useWorkspaceStore.getState().refreshPages()
      navigate(`/page/${page.id}`)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not create page from template"))
    } finally {
      setCreatingTemplate("")
    }
  }

  function dismissOnboarding() {
    localStorage.setItem("motion.onboarding.dismissed", "1")
    setShowOnboarding(false)
  }

  return (
    <>
      <header className="flex h-11 shrink-0 items-center gap-1 border-b border-border/70 px-3">
        <SidebarToggle />
        <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
          <span className="text-sm leading-none">{workspace?.icon ?? "🧭"}</span>
          <span className="truncate font-medium text-foreground">{workspace?.name ?? "Motion"}</span>
          <span className="text-muted-foreground/60">/</span>
          <span>{tr("Home")}</span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <button
            type="button"
            onClick={() => setSearchOpen(true)}
            className="flex h-7 items-center gap-2 rounded-md border border-border/80 bg-background px-2.5 text-xs text-muted-foreground shadow-sm transition hover:bg-accent"
          >
            <Search className="size-3.5" />
            <span className="hidden sm:inline">{tr("Search")}</span>
            <span className="hidden rounded border border-border bg-muted/60 px-1 py-0.5 text-[9px] sm:inline">
              {modKey()} K
            </span>
          </button>
          <ThemeToggle />
          <Tooltip>
            <TooltipTrigger asChild>
              <Button variant="ghost" size="icon-sm" onClick={() => setSettingsOpen(true)} aria-label={tr("Settings")}>
                <Settings className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{tr("Settings")}</TooltipContent>
          </Tooltip>
          <button
            type="button"
            onClick={() => setSettingsOpen(true)}
            className="ml-1 rounded-full ring-offset-2 transition hover:ring-2 hover:ring-border"
            aria-label="Open settings"
          >
            <Avatar className="size-6">
              <AvatarFallback>{initials(user?.name ?? "M")}</AvatarFallback>
            </Avatar>
          </button>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto thin-scrollbar">
        <div className="mx-auto w-full max-w-5xl px-5 pb-24 pt-12 sm:px-8 lg:pt-16">
          <div className="animate-rise">
            <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
              <span className="size-1.5 rounded-full bg-brand" />
              {formatDate(new Date().toISOString())}
            </div>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">
              {greeting()}, {firstName}.
            </h1>
            <p className="mt-2 max-w-xl text-[15px] leading-7 text-muted-foreground">
              {pages.length > 0
                ? tr("Pick up where you left off, or start something new.")
                : tr("Your workspace is ready. Let’s put the first thought on the page.")}
            </p>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-2">
            <Button onClick={() => void newPage()} className="gap-2">
              <Plus className="size-4" />
              {tr("New page")}
            </Button>
            <Button variant="outline" onClick={() => setSearchOpen(true)} className="gap-2">
              <Search className="size-4" />
              {tr("Search workspace")}
            </Button>
            {favorites.length > 0 && (
              <Button variant="ghost" onClick={() => navigate(`/page/${favorites[0].id}`)} className="gap-2 text-muted-foreground">
                <Star className="size-4 fill-amber-400 text-amber-400" />
                {tr("Open favorite")}
              </Button>
            )}
          </div>

          {showOnboarding && (
            <OnboardingCard
              hasPages={pages.length > 0}
              onNewPage={() => void newPage()}
              onDismiss={dismissOnboarding}
              progress={onboardingProgress}
            />
          )}

          <section className="mt-10">
            <div className="mb-3 flex items-center justify-between">
              <h2 className="flex items-center gap-2 text-sm font-semibold">
                <Sparkles className="size-4 text-brand" />
                {tr("Start from a template")}
              </h2>
              <span className="text-[11px] text-muted-foreground">{tr("Faster than a blank page")}</span>
            </div>
            <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
              {PAGE_TEMPLATES.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  disabled={!!creatingTemplate}
                  onClick={() => void useTemplate(template)}
                  className={cn(
                    "group/template relative overflow-hidden rounded-xl border border-border/80 bg-gradient-to-br p-3.5 text-left transition hover:-translate-y-0.5 hover:border-brand/35 hover:shadow-[0_14px_30px_-22px_rgba(0,0,0,0.35)] disabled:opacity-60",
                    template.gradient,
                  )}
                >
                  <span className="text-xl leading-none">{template.icon}</span>
                  <span className="mt-3 block text-[13px] font-medium">{tr(template.title)}</span>
                  <span className="mt-0.5 block text-[11px] leading-4 text-muted-foreground">
                    {tr(template.description)}
                  </span>
                  <span className="mt-2 block text-[10px] font-medium text-brand opacity-0 transition group-hover/template:opacity-100">
                    {creatingTemplate === template.id ? tr("Creating…") : tr("Use template")}
                  </span>
                </button>
              ))}
            </div>
          </section>

          {pages.length === 0 ? (
            <EmptyWorkspace onCreate={() => void newPage()} />
          ) : (
            <>
              <section className="mt-12">
                <div className="mb-4 flex items-center justify-between">
                  <h2 className="flex items-center gap-2 text-sm font-semibold">
                    <Clock3 className="size-4 text-muted-foreground" />
                    {tr("Recently edited")}
                  </h2>
                  <span className="text-[11px] text-muted-foreground">{pages.length === 1 ? tr("{n} page", { n: pages.length }) : tr("{n} pages", { n: pages.length })}</span>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {recent.map((page, index) => (
                    <div
                      key={page.id}
                      className="group/card relative animate-rise"
                      style={{ animationDelay: `${Math.min(index * 35, 180)}ms` }}
                    >
                      <button
                        type="button"
                        onClick={() => navigate(`/page/${page.id}`)}
                        className="relative flex h-40 w-full flex-col overflow-hidden rounded-xl border border-border/80 bg-card p-4 text-left transition-all hover:-translate-y-0.5 hover:border-brand/35 hover:shadow-[0_18px_40px_-24px_rgba(0,0,0,0.35)]"
                      >
                        <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-brand/[0.045] to-brand-two/[0.04] opacity-0 transition-opacity group-hover/card:opacity-100" />
                        <div className="relative flex w-full items-start justify-between">
                          {page.icon ? (
                            <span className="text-2xl leading-none">{page.icon}</span>
                          ) : (
                            <span className="flex size-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                              <FileText className="size-4" />
                            </span>
                          )}
                          {page.favorite && <Star className="size-3.5 fill-amber-400 text-amber-400" />}
                        </div>
                        <div className="relative mt-auto w-full">
                          <div className="line-clamp-2 text-[15px] font-medium leading-snug">
                            {pageTitle(page.title)}
                          </div>
                          <div className="mt-1.5 flex items-center justify-between text-[11px] text-muted-foreground">
                            <span>{tr("Edited {time}", { time: formatRelative(page.updatedAt) })}</span>
                            <ArrowUpRight className="size-3.5 -translate-x-1 opacity-0 transition-all group-hover/card:translate-x-0 group-hover/card:opacity-70" />
                          </div>
                        </div>
                      </button>
                      <div className="absolute right-2.5 top-2.5 opacity-0 transition-opacity group-hover/card:opacity-100 has-[[data-state=open]]:opacity-100">
                        <PageActionsMenu
                          page={page}
                          align="end"
                          trigger={
                            <button
                              type="button"
                              aria-label="Page options"
                              className="flex size-7 items-center justify-center rounded-md bg-background/80 text-muted-foreground shadow-sm ring-1 ring-border transition hover:bg-accent hover:text-foreground data-[state=open]:bg-accent"
                            >
                              <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                                <circle cx="5" cy="12" r="1.4" /><circle cx="12" cy="12" r="1.4" /><circle cx="19" cy="12" r="1.4" />
                              </svg>
                            </button>
                          }
                        />
                      </div>
                    </div>
                  ))}

                  <button
                    type="button"
                    onClick={() => void newPage()}
                    className="flex h-40 flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-border text-muted-foreground transition hover:border-brand/40 hover:bg-brand-soft/30 hover:text-foreground"
                  >
                    <span className="flex size-9 items-center justify-center rounded-full bg-muted">
                      <FilePlus2 className="size-4" />
                    </span>
                    <span className="text-sm font-medium">{tr("Blank page")}</span>
                    <span className="text-[11px]">{tr("Start with a clean slate")}</span>
                  </button>
                </div>
              </section>

              {favorites.length > 0 && (
                <section className="mt-10">
                  <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold">
                    <Star className="size-4 text-amber-400" />
                    {tr("Favorites")}
                  </h2>
                  <div className="flex flex-wrap gap-2">
                    {favorites.map((page) => (
                      <button
                        key={page.id}
                        type="button"
                        onClick={() => navigate(`/page/${page.id}`)}
                        className="flex items-center gap-2 rounded-full border border-border/80 bg-card py-1.5 pl-2 pr-3 text-xs transition hover:border-brand/35 hover:bg-accent/50"
                      >
                        <span className="text-sm leading-none">{page.icon || "📄"}</span>
                        <span className="max-w-[180px] truncate font-medium">{pageTitle(page.title)}</span>
                      </button>
                    ))}
                  </div>
                </section>
              )}
            </>
          )}

          <div className="mt-16 flex items-center gap-2.5 rounded-xl border border-border/60 bg-muted/30 px-4 py-3 text-[11px] text-muted-foreground">
            <Sparkles className="size-3.5 text-brand" />
            <span>
              {tr("Tip: press")} <kbd className="rounded border bg-background px-1 py-0.5 font-sans">{modKey()}</kbd>{" "}
              <kbd className="rounded border bg-background px-1 py-0.5 font-sans">K</kbd> {tr("to search")}.
            </span>
          </div>
        </div>
      </div>
    </>
  )
}

function OnboardingCard({
  hasPages,
  onNewPage,
  onDismiss,
  progress,
}: {
  hasPages: boolean
  onNewPage: () => void
  onDismiss: () => void
  progress: Set<OnboardingStep>
}) {
  const steps = [
    { id: "page" as const, title: tr("Create your first page"), done: hasPages || progress.has("page") },
    { id: "slash" as const, title: tr("Type / to insert any block"), done: progress.has("slash") },
    { id: "comment" as const, title: tr("Select text to leave a comment"), done: progress.has("comment") },
    { id: "ai" as const, title: tr("Ask Motion AI to summarize or edit"), done: progress.has("ai") },
  ]
  const doneCount = steps.filter((step) => step.done).length
  const complete = doneCount === steps.length
  return (
    <section className="relative mt-8 overflow-hidden rounded-2xl border border-brand/20 bg-gradient-to-br from-brand-soft/50 via-background to-brand-two/10 p-5">
      <div className="pointer-events-none absolute -right-10 -top-16 size-44 rounded-full bg-brand/10 blur-3xl" />
      <button
        type="button"
        onClick={onDismiss}
        aria-label={tr("Dismiss")}
        className="absolute right-3 top-3 flex size-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-background/70 hover:text-foreground"
      >
        <X className="size-3.5" />
      </button>
      <div className="relative">
        <div className="flex items-center gap-2 text-xs font-medium text-brand">
          <Sparkles className="size-3.5" /> {complete ? tr("Workspace unlocked") : tr("A 60-second tour")}
          <span className="ml-auto rounded-full bg-background/70 px-2 py-0.5 text-[10px] text-muted-foreground ring-1 ring-border/60">
            {doneCount}/{steps.length}
          </span>
        </div>
        <h2 className="mt-1.5 text-lg font-semibold tracking-tight">{tr("Make Motion yours")}</h2>
        <p className="mt-1 max-w-xl text-xs leading-5 text-muted-foreground">
          {complete
            ? tr("You have unlocked the core workflow. Keep exploring — the tour will stay out of your way.")
            : tr("Four small actions unlock the whole workspace. You can dismiss this whenever you like.")}
        </p>
        <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-background/70 ring-1 ring-border/40">
          <div
            className="h-full rounded-full brand-gradient transition-all duration-500"
            style={{ width: `${(doneCount / steps.length) * 100}%` }}
          />
        </div>
        <div className="mt-4 grid gap-1.5 sm:grid-cols-2">
          {steps.map((step, index) => (
            <div key={step.id} className="flex items-center gap-2 rounded-lg border border-border/60 bg-background/60 px-2.5 py-2 text-xs">
              <span
                className={cn(
                  "flex size-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold",
                  step.done ? "bg-emerald-500 text-white" : "bg-muted text-muted-foreground",
                )}
              >
                {step.done ? "✓" : index + 1}
              </span>
              <span className={cn("min-w-0 flex-1 truncate", step.done && "text-muted-foreground line-through")}>{step.title}</span>
            </div>
          ))}
        </div>
        {!hasPages && (
          <Button size="sm" className="mt-4 gap-1.5" onClick={onNewPage}>
            <Plus className="size-3.5" /> {tr("Create your first page")}
          </Button>
        )}
      </div>
    </section>
  )
}

function EmptyWorkspace({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="relative mt-12 overflow-hidden rounded-2xl border border-border/80 bg-gradient-to-br from-brand-soft/60 via-background to-brand-two/10 px-6 py-14 text-center">
      <div className="pointer-events-none absolute -left-16 -top-16 size-52 rounded-full bg-brand/15 blur-3xl" />
      <div className="pointer-events-none absolute -bottom-20 -right-10 size-52 rounded-full bg-brand-two/15 blur-3xl" />
      <div className="relative mx-auto flex max-w-md flex-col items-center">
        <div className="flex size-14 items-center justify-center rounded-2xl bg-background shadow-lg ring-1 ring-border/60">
          <span className="text-2xl">✍️</span>
        </div>
        <h2 className="mt-5 text-xl font-semibold tracking-tight">{tr("A blank page, full of possibility")}</h2>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          {tr("Create your first page and start with a single sentence. Motion takes care of the rest.")}
        </p>
        <Button onClick={onCreate} className="mt-6">
          <Plus className="size-4" /> Create your first page
        </Button>
      </div>
    </div>
  )
}
