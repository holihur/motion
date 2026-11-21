import { useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { Blocks, Link2 } from "lucide-react"
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
    <section className="mt-12 pt-2">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
        <Link2 className="size-3.5" /> {tr("Linked from")}
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px]">{links.filter((link) => !link.blockId).length}</span>
        {links.some((link) => link.blockId) && (
          <span className="flex items-center gap-1 rounded-full bg-brand-soft/60 px-1.5 py-0.5 text-[10px] text-brand">
            <Blocks className="size-3" /> {tr("{n} block references", { n: links.filter((link) => link.blockId).length })}
          </span>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {links.map((link) => (
          <button
            key={`${link.id}-${link.blockId ?? "page"}`}
            type="button"
            onClick={() => {
              navigate(`/page/${link.id}`)
              if (link.blockId) {
                window.setTimeout(() => {
                  window.dispatchEvent(new CustomEvent("motion:scroll-block", { detail: { id: link.blockId } }))
                  document.getElementById(`block-${link.blockId}`)?.scrollIntoView({ block: "center", behavior: "smooth" })
                }, 400)
              }
            }}
            className="flex max-w-[260px] items-center gap-1.5 rounded-full bg-muted/60 px-2.5 py-1 text-xs transition hover:bg-muted"
          >
            <span>{link.icon || "📄"}</span>
            <span className="truncate">{pageTitle(link.title)}</span>
            {link.blockId && <span className="shrink-0 rounded bg-brand-soft px-1 text-[9px] font-medium text-brand">{tr("block")}</span>}
          </button>
        ))}
      </div>
    </section>
  )
}
