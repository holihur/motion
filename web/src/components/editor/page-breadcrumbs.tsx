import { Fragment, useMemo } from "react"
import { useNavigate } from "react-router-dom"
import { ChevronRight, FileText } from "lucide-react"
import { useWorkspaceStore } from "@/stores/workspace"
import { ancestorChain, pageTitle } from "@/lib/tree"
import type { Page } from "@/lib/types"
import { cn } from "@/lib/utils"

export function Breadcrumbs({ page, title, icon }: { page: Page; title: string; icon: string }) {
  const navigate = useNavigate()
  const pages = useWorkspaceStore((state) => state.pages)
  const chain = useMemo(() => {
    const fromStore = ancestorChain(pages, page.id)
    if (fromStore.length > 0) return fromStore
    return [{ ...page, title, icon } as typeof page]
  }, [pages, page, title, icon])

  return (
    <nav className="flex min-w-0 items-center gap-1 text-xs text-muted-foreground">
      {chain.slice(0, -1).map((item, index) => (
        <Fragment key={item.id}>
          <button
            type="button"
            onClick={() => navigate(`/page/${item.id}`)}
            className={cn(
              "max-w-[140px] items-center gap-1 truncate rounded px-1.5 py-0.5 hover:bg-accent hover:text-foreground",
              index < chain.length - 2 ? "hidden md:flex" : "hidden sm:flex",
            )}
          >
            {item.icon ? <span className="text-[12px] leading-none">{item.icon}</span> : <FileText className="size-3" />}
            <span className="truncate">{pageTitle(item.title)}</span>
          </button>
          <ChevronRight className={cn("size-3 shrink-0 text-muted-foreground/40", index < chain.length - 2 ? "hidden md:block" : "hidden sm:block")} />
        </Fragment>
      ))}
      <span className="flex min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 font-medium text-foreground">
        {icon ? <span className="text-[13px] leading-none">{icon}</span> : <FileText className="size-3.5 shrink-0 text-muted-foreground" />}
        <span className="truncate">{pageTitle(title)}</span>
      </span>
    </nav>
  )
}
