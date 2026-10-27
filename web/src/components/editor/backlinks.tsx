import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Link2 } from "lucide-react"
import type { Backlink } from "@/lib/types"
import { api } from "@/lib/api"
import { pageTitle } from "@/lib/tree"
import { tr } from "@/lib/i18n"

export function Backlinks({ pageId }: { pageId: string }) {
  const [links, setLinks] = useState<Backlink[]>([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => {
    let alive = true
    setLoading(true)
    api.pages.backlinks(pageId)
      .then((value) => { if (alive) setLinks(value) })
      .catch(() => { if (alive) setLinks([]) })
      .finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [pageId])

  if (loading || links.length === 0) return null

  return (
    <section className="mt-10 border-t border-border/70 pt-4">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Link2 className="size-3.5" /> {tr("Linked from")}
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{links.length}</span>
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {links.map((link) => (
          <button
            key={link.id}
            type="button"
            onClick={() => navigate(`/page/${link.id}`)}
            className="flex max-w-[240px] items-center gap-1.5 rounded-full border border-border/70 bg-card px-2.5 py-1 text-xs transition hover:border-brand/35 hover:bg-accent/40"
          >
            <span>{link.icon || "📄"}</span>
            <span className="truncate">{pageTitle(link.title)}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
