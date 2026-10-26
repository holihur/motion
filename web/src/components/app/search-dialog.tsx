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
  const [history, setHistory] = useState<string[]>(() => readSearchHistory())
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

  function remember(query: string) {
    const value = query.trim()
    if (!value) return
    const next = [value, ...history.filter((item) => item.toLowerCase() !== value.toLowerCase())].slice(0, 6)
    setHistory(next)
    localStorage.setItem("motion.search.history", JSON.stringify(next))
  }

  function go(pageId: string) {
    remember(query)
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
                  <ResultItem key={page.id} page={page} query={query} onSelect={() => go(page.id)} />
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
            {history.length > 0 && (
              <>
                <CommandGroup heading={tr("Recent searches")}>
                  {history.map((item) => (
                    <CommandItem
                      key={item}
                      value={`history-${item}`}
                      onSelect={() => {
                        setQuery(item)
                      }}
                    >
                      <Search className="text-muted-foreground" />
                      <span className="min-w-0 flex-1 truncate">{item}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
                <CommandSeparator />
              </>
            )}
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
                    <ResultItem key={page.id} page={page} query={query} onSelect={() => go(page.id)} />
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

function ResultItem({
  page,
  query,
  onSelect,
}: {
  page: PageSummary
  query: string
  onSelect: () => void
}) {
  return (
    <CommandItem value={`page-${page.id}`} onSelect={onSelect} className="items-start py-2">
      {page.icon ? (
        <span className="mt-0.5 w-4 shrink-0 text-center text-base leading-none">{page.icon}</span>
      ) : (
        <FileText className="mt-0.5 text-muted-foreground" />
      )}
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="min-w-0 flex-1 truncate">{pageTitle(page.title)}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">
            {formatRelative(page.updatedAt)}
          </span>
        </span>
        {page.snippet ? (
          <span className="mt-0.5 block line-clamp-2 text-[11px] leading-4 text-muted-foreground">
            <HighlightedSnippet text={page.snippet} query={query} />
          </span>
        ) : query ? (
          <span className="mt-0.5 block text-[10px] text-muted-foreground/70">{tr("Title match")}</span>
        ) : null}
      </span>
    </CommandItem>
  )
}

function HighlightedSnippet({ text, query }: { text: string; query: string }) {
  const value = query.trim()
  if (!value) return <>{text}</>
  const lower = text.toLowerCase()
  const needle = value.toLowerCase()
  const parts: React.ReactNode[] = []
  let cursor = 0
  let index = lower.indexOf(needle)
  let key = 0
  while (index >= 0) {
    if (index > cursor) parts.push(text.slice(cursor, index))
    parts.push(
      <mark key={key++} className="rounded-sm bg-brand-soft px-0.5 text-foreground">
        {text.slice(index, index + value.length)}
      </mark>,
    )
    cursor = index + value.length
    index = lower.indexOf(needle, cursor)
  }
  if (cursor < text.length) parts.push(text.slice(cursor))
  return <>{parts}</>
}

function readSearchHistory(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem("motion.search.history") ?? "[]") as unknown
    if (!Array.isArray(parsed)) return []
    return parsed.filter((item): item is string => typeof item === "string").slice(0, 6)
  } catch {
    return []
  }
}
