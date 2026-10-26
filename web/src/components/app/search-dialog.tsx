import { useEffect, useMemo, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  FilePlus2,
  FileText,
  Home,
  Loader2,
  Moon,
  Search,
  Settings,
  Trash2,
} from "lucide-react"
import { api } from "@/lib/api"
import { tr } from "@/lib/i18n"
import { formatRelative } from "@/lib/utils"
import { pageTitle } from "@/lib/tree"
import type { PageSummary } from "@/lib/types"
import { useUIStore } from "@/stores/ui"
import { useThemeStore } from "@/stores/theme"
import { useWorkspaceStore } from "@/stores/workspace"
import {
  CommandDialog,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"

export function SearchDialog() {
  const open = useUIStore((state) => state.searchOpen)
  const setOpen = useUIStore((state) => state.setSearchOpen)
  const setSettingsOpen = useUIStore((state) => state.setSettingsOpen)
  const activeId = useWorkspaceStore((state) => state.activeId)
  const pages = useWorkspaceStore((state) => state.pages)
  const createPage = useWorkspaceStore((state) => state.createPage)
  const toggleTheme = useThemeStore((state) => state.toggle)
  const navigate = useNavigate()

  const [query, setQuery] = useState("")
  const [results, setResults] = useState<PageSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState("")
  const sequence = useRef(0)

  const recent = useMemo(
    () =>
      [...pages]
        .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
        .slice(0, 5),
    [pages],
  )

  useEffect(() => {
    if (open) {
      setQuery("")
      setResults([])
      setLoading(false)
      setActive("action-new-page")
    }
  }, [open])

  // Keep keyboard focus on the most useful item as async results arrive.
  useEffect(() => {
    if (!open) return
    if (!query.trim()) {
      setActive("action-new-page")
    } else if (loading) {
      setActive("")
    } else if (results.length > 0) {
      setActive(`page-${results[0].id}`)
    } else {
      setActive("new-page-search")
    }
  }, [query, loading, results, open])

  useEffect(() => {
    if (!open || !activeId) return
    const trimmed = query.trim()
    if (!trimmed) {
      setResults([])
      setLoading(false)
      return
    }
    const id = ++sequence.current
    setLoading(true)
    const timer = window.setTimeout(() => {
      api.pages
        .search(activeId, trimmed)
        .then((found) => {
          if (sequence.current === id) setResults(found)
        })
        .catch(() => {
          if (sequence.current === id) setResults([])
        })
        .finally(() => {
          if (sequence.current === id) setLoading(false)
        })
    }, 160)
    return () => window.clearTimeout(timer)
  }, [query, open, activeId])

  function go(pageId: string) {
    setOpen(false)
    navigate(`/page/${pageId}`)
  }

  async function newPage() {
    try {
      const page = await createPage(null)
      setOpen(false)
      navigate(`/page/${page.id}`)
    } catch {
      setOpen(false)
    }
  }

  return (
    <CommandDialog open={open} onOpenChange={setOpen} value={active} onValueChange={setActive}>
      <CommandInput
        value={query}
        onValueChange={setQuery}
        placeholder={tr("Search pages, or type a command…")}
      />
      <CommandList>
        {query.trim() ? (
          <>
            {loading && results.length === 0 ? (
              <div className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                <Loader2 className="size-4 animate-spin" /> {tr("Searching…")}
              </div>
            ) : results.length > 0 ? (
              <CommandGroup heading={loading ? tr("Results") + " · " + tr("Searching…") : tr("Results")}>
                {results.map((page) => (
                  <ResultItem key={page.id} page={page} onSelect={() => go(page.id)} />
                ))}
              </CommandGroup>
            ) : (
              <div className="px-3 py-10 text-center text-sm text-muted-foreground">
                {tr("No pages found for “{query}”", { query: query.trim() })}
                <div className="mt-1 text-xs">{tr("Try a different word, or create a new page.")}</div>
              </div>
            )}
            <CommandSeparator />
            <CommandGroup heading={tr("Quick actions")}>
              <CommandItem value="new-page-search" onSelect={() => void newPage()}>
                <FilePlus2 />
                {tr("Create a new page")}
                <CommandShortcut>↵</CommandShortcut>
              </CommandItem>
            </CommandGroup>
          </>
        ) : (
          <>
            <CommandGroup heading={tr("Quick actions")}>
              <CommandItem value="action-new-page" onSelect={() => void newPage()}>
                <FilePlus2 />
                New page
              </CommandItem>
              <CommandItem
                value="action-home"
                onSelect={() => {
                  setOpen(false)
                  navigate("/")
                }}
              >
                <Home />
                Go home
              </CommandItem>
              <CommandItem
                value="action-trash"
                onSelect={() => {
                  setOpen(false)
                  navigate("/trash")
                }}
              >
                <Trash2 />
                Open trash
              </CommandItem>
              <CommandItem
                value="action-settings"
                onSelect={() => {
                  setOpen(false)
                  setSettingsOpen(true)
                }}
              >
                <Settings />
                Settings
              </CommandItem>
              <CommandItem
                value="action-theme"
                onSelect={() => {
                  toggleTheme()
                  setOpen(false)
                }}
              >
                <Moon />
                Toggle theme
              </CommandItem>
            </CommandGroup>
            {recent.length > 0 && (
              <>
                <CommandSeparator />
                <CommandGroup heading={tr("Recently edited")}>
                  {recent.map((page) => (
                    <ResultItem key={page.id} page={page} onSelect={() => go(page.id)} />
                  ))}
                </CommandGroup>
              </>
            )}
            <CommandSeparator />
            <div className="flex items-center gap-2 px-2 py-3 text-[11px] text-muted-foreground">
              <Search className="size-3" />
              {tr("Search across every page in this workspace")}
            </div>
          </>
        )}
      </CommandList>
      <div className="flex items-center justify-between border-t px-3 py-2 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <kbd className="rounded border bg-muted px-1 py-0.5 font-sans">↑</kbd>
          <kbd className="rounded border bg-muted px-1 py-0.5 font-sans">↓</kbd>
          {tr("to navigate")}
        </span>
        <span className="flex items-center gap-1.5">
          <kbd className="rounded border bg-muted px-1 py-0.5 font-sans">↵</kbd>
          {tr("to open")}
          <kbd className="ml-2 rounded border bg-muted px-1 py-0.5 font-sans">esc</kbd>
          {tr("to close")}
        </span>
      </div>
    </CommandDialog>
  )
}

function ResultItem({ page, onSelect }: { page: PageSummary; onSelect: () => void }) {
  return (
    <CommandItem value={`page-${page.id}`} onSelect={onSelect}>
      {page.icon ? (
        <span className="w-4 shrink-0 text-center text-base leading-none">{page.icon}</span>
      ) : (
        <FileText className="text-muted-foreground" />
      )}
      <span className="min-w-0 flex-1 truncate">{pageTitle(page.title)}</span>
      <span className="shrink-0 text-[10px] text-muted-foreground">
        {formatRelative(page.updatedAt)}
      </span>
    </CommandItem>
  )
}
