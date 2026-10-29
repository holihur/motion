import { useMemo, useState } from "react"
import { Braces, BarChart3, Network, ListTree, Eye, Code2, Copy, Check } from "lucide-react"
import { tr } from "@/lib/i18n"
import { toast } from "sonner"
import type { Block } from "@/lib/types"

type Graph = { nodes: { id: string; label?: string; x?: number; y?: number }[]; edges: { from: string; to: string; label?: string }[] }

function isGraph(v: any): v is Graph {
  return v && Array.isArray(v.nodes) && Array.isArray(v.edges)
}
function isChartData(v: any) {
  return Array.isArray(v) && v.length > 0 && typeof v[0] === "object" && "value" in v[0]
}

function MiniBar({ data }: { data: { name: string; value: number }[] }) {
  const max = Math.max(...data.map((d) => d.value), 1)
  return (
    <div className="space-y-1.5">
      {data.slice(0, 12).map((d) => (
        <div key={d.name} className="flex items-center gap-2 text-xs">
          <span className="w-16 truncate text-muted-foreground">{d.name}</span>
          <div className="flex-1 h-3 rounded bg-muted overflow-hidden">
            <div className="h-full bg-brand transition-all" style={{ width: `${(d.value / max) * 100}%` }} />
          </div>
          <span className="w-10 text-right tabular-nums">{d.value}</span>
        </div>
      ))}
    </div>
  )
}

function GraphView({ g }: { g: Graph }) {
  // simple force-free layout: grid
  const cols = Math.ceil(Math.sqrt(g.nodes.length))
  return (
    <svg viewBox="0 0 400 240" className="w-full h-[240px] bg-muted/20 rounded-lg border">
      {g.edges.map((e, i) => {
        const a = g.nodes.find((n) => n.id === e.from)
        const b = g.nodes.find((n) => n.id === e.to)
        if (!a || !b) return null
        const ai = g.nodes.indexOf(a), bi = g.nodes.indexOf(b)
        const ax = 60 + (ai % cols) * 90, ay = 40 + Math.floor(ai / cols) * 70
        const bx = 60 + (bi % cols) * 90, by = 40 + Math.floor(bi / cols) * 70
        return <g key={i}><line x1={ax} y1={ay} x2={bx} y2={by} stroke="hsl(var(--border))" strokeWidth={1.5} markerEnd="url(#arrow)" /><text x={(ax+bx)/2} y={(ay+by)/2-4} fontSize={8} fill="hsl(var(--muted-foreground))" textAnchor="middle">{e.label ?? ""}</text></g>
      })}
      <defs><marker id="arrow" viewBox="0 0 10 10" refX={8} refY={5} markerWidth={6} markerHeight={6} orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="hsl(var(--muted-foreground))" /></marker></defs>
      {g.nodes.map((n, i) => {
        const x = 60 + (i % cols) * 90, y = 40 + Math.floor(i / cols) * 70
        return <g key={n.id}><rect x={x-38} y={y-14} width={76} height={28} rx={8} fill="white" stroke="hsl(var(--border))" /><text x={x} y={y+4} fontSize={10} textAnchor="middle" fill="hsl(var(--foreground))">{n.label ?? n.id}</text></g>
      })}
    </svg>
  )
}

function JsonTree({ value, depth = 0 }: { value: any; depth?: number }) {
  if (value === null) return <span className="text-muted-foreground">null</span>
  if (typeof value !== "object") return <span className="text-brand font-mono text-xs">{JSON.stringify(value)}</span>
  const isArr = Array.isArray(value)
  const entries = isArr ? value.map((v: any, i: number) => [i, v] as const) : Object.entries(value)
  if (entries.length === 0) return <span className="text-muted-foreground text-xs">{isArr ? "[]" : "{}"}</span>
  return (
    <div className={depth ? "ml-3 border-l border-border/60 pl-2" : ""}>
      {entries.slice(0, 100).map(([k, v]) => (
        <div key={String(k)} className="py-0.5 text-xs"><span className="text-muted-foreground font-mono">{String(k)}:</span> {typeof v === "object" && v !== null ? <JsonTree value={v} depth={depth+1} /> : <span className="font-mono">{JSON.stringify(v)}</span>}</div>
      ))}
      {entries.length > 100 && <div className="text-[11px] text-muted-foreground">… {entries.length-100} more</div>}
    </div>
  )
}

export function JsonVisualBlock({ block, readOnly, onUpdate }: { block: Block; readOnly: boolean; onUpdate: (p: Partial<Block>) => void }) {
  const [view, setView] = useState<"preview" | "code">("preview")
  const [copied, setCopied] = useState(false)
  const parsed = useMemo(() => { try { return JSON.parse(block.text || "{}") } catch { return null } }, [block.text])
  const error = useMemo(() => { if (!block.text.trim()) return "Empty"; try { JSON.parse(block.text); return null } catch (e: any) { return e.message } }, [block.text])
  const chartData = useMemo(() => {
    if (!parsed) return null
    if (isChartData(parsed)) return parsed as { name: string; value: number }[]
    if (parsed && typeof parsed === "object" && isChartData((parsed as any).chart)) return (parsed as any).chart
    if (parsed && typeof parsed === "object" && isChartData((parsed as any).data)) return (parsed as any).data
    return null
  }, [parsed])
  const graph = useMemo(() => (parsed && isGraph(parsed) ? parsed as Graph : parsed && isGraph((parsed as any).graph) ? (parsed as any).graph : null), [parsed])

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-border/80 bg-card">
      <div className="flex items-center gap-1.5 border-b border-border/60 px-2.5 py-1.5 text-[10px]">
        <Braces className="size-3 text-brand" />
        <span className="font-medium tracking-wider uppercase text-muted-foreground">JSON Visual</span>
        <span className="text-muted-foreground/60">Mermaid 替代 · 粘贴 JSON 即出图</span>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" onClick={() => setView(view === "preview" ? "code" : "preview")} className="flex items-center gap-1 rounded px-2 py-0.5 hover:bg-accent text-[11px]">
            {view === "preview" ? <><Code2 className="size-3" /> 代码</> : <><Eye className="size-3" /> 预览</>}
          </button>
          <button type="button" onClick={() => { void navigator.clipboard.writeText(block.text).then(() => { toast.success(tr("Copied")); setCopied(true); setTimeout(()=>setCopied(false),1200) }) }} className="rounded p-1 hover:bg-accent">{copied ? <Check className="size-3 text-green-600" /> : <Copy className="size-3" />}</button>
        </div>
      </div>
      {view === "code" ? (
        <textarea value={block.text} readOnly={readOnly} onChange={(e)=>onUpdate({ text: e.target.value })} spellCheck={false} rows={Math.min(18, Math.max(6, block.text.split("\n").length+1))} placeholder={'{\n  "chart": [{"name":"A","value":40},{"name":"B","value":30}]\n}  或  {"nodes":[{"id":"A"},{"id":"B"}],"edges":[{"from":"A","to":"B"}]}'} className="block w-full bg-transparent p-3 font-mono text-xs leading-5 outline-none" />
      ) : (
        <div className="p-3">
          {error ? (
            <div className="rounded-md bg-destructive/10 px-2.5 py-2 text-xs text-destructive">JSON 解析失败：{error} — 请切换到“代码”粘贴合法 JSON</div>
          ) : graph ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground"><Network className="size-3" /> 流程图 · {graph.nodes.length} 节点 {graph.edges.length} 连线</div>
              <GraphView g={graph} />
              <div className="text-[11px] text-muted-foreground">数据格式：{"{ nodes:[{id,label}], edges:[{from,to,label}] }"}，支持直接粘贴</div>
            </div>
          ) : chartData ? (
            <div className="space-y-2">
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground"><BarChart3 className="size-3" /> 柱状/饼图 · {chartData.length} 项</div>
              <MiniBar data={chartData} />
              <div className="flex gap-1 pt-1">{chartData.slice(0,6).map(d=> <span key={d.name} className="rounded bg-brand-soft px-1.5 py-0.5 text-[11px]">{d.name}:{d.value}</span>)}</div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-center gap-1 text-[11px] text-muted-foreground"><ListTree className="size-3" /> 结构预览 · 点击“代码”编辑</div>
              <div className="max-h-[320px] overflow-auto rounded-md border bg-muted/10 p-2 thin-scrollbar"><JsonTree value={parsed} /></div>
              <div className="rounded-md bg-muted/40 px-2 py-1.5 text-[11px] leading-4 text-muted-foreground">小技巧：<code className="rounded bg-background px-1">{"{ chart:[{name,value}] }"}</code> 出柱状图；<code className="rounded bg-background px-1">{"{ nodes, edges }"}</code> 出流程图；任意 JSON 自动树形展开。</div>
            </div>
          )}
        </div>
      )}
      {!readOnly && view==="preview" && <div className="border-t border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground">粘贴 JSON 即渲染，无需学习 Mermaid 语法 · 支持一键切回 Mermaid <code className="rounded bg-muted px-1">diagram</code> 块</div>}
    </div>
  )
}
