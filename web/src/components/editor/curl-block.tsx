import { useMemo, useState } from "react"
import { Check, Code2, Copy, Eye, TerminalSquare } from "lucide-react"
import { toast } from "sonner"
import { tr } from "@/lib/i18n"
import { cn } from "@/lib/utils"
import { parseCurl } from "@/lib/curl"
import type { Block } from "@/lib/types"

const METHOD_COLORS: Record<string, string> = {
  GET: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  POST: "bg-blue-500/10 text-blue-700 dark:text-blue-300",
  PUT: "bg-amber-500/10 text-amber-700 dark:text-amber-300",
  PATCH: "bg-violet-500/10 text-violet-700 dark:text-violet-300",
  DELETE: "bg-rose-500/10 text-rose-700 dark:text-rose-300",
}

export function CurlBlock({ block, readOnly, autoFocus, onUpdate }: {
  block: Block
  readOnly: boolean
  autoFocus?: boolean
  onUpdate: (patch: Partial<Block>) => void
}) {
  const [raw, setRaw] = useState(false)
  const [copied, setCopied] = useState(false)
  const parsed = useMemo(() => parseCurl(block.text), [block.text])

  function copy() {
    void navigator.clipboard.writeText(block.text).then(
      () => {
        setCopied(true)
        toast.success(tr("Command copied"))
        window.setTimeout(() => setCopied(false), 1200)
      },
      () => toast.error(tr("Could not copy")),
    )
  }

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-border/80 bg-card">
      <div className="flex items-center gap-1.5 border-b border-border/60 px-2.5 py-1.5 text-[10px]">
        <TerminalSquare className="size-3.5 text-brand" />
        <span className="font-semibold uppercase tracking-wider">{tr("cURL")}</span>
        {parsed && <span className={cn("rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold", METHOD_COLORS[parsed.method] ?? "bg-muted text-muted-foreground")}>{parsed.method}</span>}
        {parsed && <span className="min-w-0 truncate font-mono text-[11px] text-muted-foreground">{parsed.url}</span>}
        <div className="ml-auto flex items-center gap-0.5">
          <button type="button" onClick={() => setRaw((value) => !value)} className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-muted-foreground hover:bg-accent hover:text-foreground">
            {raw ? <><Eye className="size-3" /> {tr("Preview")}</> : <><Code2 className="size-3" /> {tr("Raw")}</>}
          </button>
          <button type="button" onClick={copy} aria-label={tr("Copy command")} className="rounded p-1 text-muted-foreground hover:bg-accent hover:text-foreground">
            {copied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
          </button>
        </div>
      </div>

      {raw || !parsed ? (
        readOnly ? (
          <pre className="max-h-80 overflow-auto whitespace-pre-wrap break-words bg-muted/20 p-3 font-mono text-xs leading-5 thin-scrollbar">{block.text}</pre>
        ) : (
          <textarea
            autoFocus={autoFocus}
            value={block.text}
            onChange={(event) => onUpdate({ text: event.target.value })}
            spellCheck={false}
            rows={Math.min(16, Math.max(5, block.text.split("\n").length + 1))}
            placeholder={`curl -X POST https://api.example.com/v1/items \\\n  -H 'Content-Type: application/json' \\\n  -d '{"name":"example"}'`}
            className="block w-full resize-y bg-transparent p-3 font-mono text-xs leading-5 outline-none"
          />
        )
      ) : (
        <div className="space-y-3 p-3">
          <div className="flex min-w-0 items-center gap-2 rounded-lg border bg-muted/20 px-2.5 py-2">
            <span className={cn("rounded px-1.5 py-0.5 font-mono text-[10px] font-semibold", METHOD_COLORS[parsed.method] ?? "bg-muted text-muted-foreground")}>{parsed.method}</span>
            <code className="min-w-0 break-all font-mono text-xs">{parsed.url}</code>
          </div>
          {parsed.headers.length > 0 && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{tr("Headers")}</div>
              <div className="overflow-hidden rounded-lg border bg-muted/10">
                {parsed.headers.map(([key, value], index) => (
                  <div key={`${key}-${index}`} className="flex gap-2 border-b border-border/40 px-2.5 py-1.5 text-[11px] last:border-b-0">
                    <span className="w-32 shrink-0 font-mono font-medium text-muted-foreground">{key}</span>
                    <span className="min-w-0 break-all font-mono">{value}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {(parsed.auth || parsed.cookies) && (
            <div className="flex flex-wrap gap-2 text-[11px]">
              {parsed.auth && <span className="rounded border bg-muted/20 px-2 py-1 font-mono">{tr("Auth")}: {parsed.auth}</span>}
              {parsed.cookies && <span className="rounded border bg-muted/20 px-2 py-1 font-mono">{tr("Cookies")}: {parsed.cookies}</span>}
            </div>
          )}
          {parsed.body && (
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{tr("Body")}</div>
              <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-lg border bg-muted/10 p-2.5 font-mono text-[11px] leading-5 thin-scrollbar">{parsed.body}</pre>
            </div>
          )}
        </div>
      )}
      {!parsed && block.text.trim() && <div className="border-t border-border/60 px-2.5 py-1.5 text-[11px] text-muted-foreground">{tr("Could not parse the cURL command.")}</div>}
    </div>
  )
}
