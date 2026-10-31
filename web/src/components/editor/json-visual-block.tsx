import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import {
  Braces, Code2, Eye, Copy, Check, Plus, Trash2, LayoutGrid,
  ArrowRight, Diamond, Square, Circle, GitBranch, Eraser, Sparkles,
  MousePointer2, Link2, Unlink,
} from "lucide-react"
import { toast } from "sonner"
import { isImeKeyEvent } from "@/lib/keyboard"
import { tr } from "@/lib/i18n"
import { uid } from "@/lib/utils"
import type { Block } from "@/lib/types"

/* ------------------------------------------------------------------ */
/* 数据模型：仍存为 JSON（兼容老数据），但用户永远不需要手写它        */
/* { nodes:[{id,label,x,y,color,shape}], edges:[{from,to,label}],      */
/*   direction:"LR"|"TB" }                                             */
/* ------------------------------------------------------------------ */

type Shape = "rect" | "diamond" | "ellipse"
type FlowNode = { id: string; label: string; x?: number; y?: number; color?: string; shape?: Shape }
type FlowEdge = { from: string; to: string; label?: string }
type FlowData = { nodes: FlowNode[]; edges: FlowEdge[]; direction?: "LR" | "TB" }

const W = 760
const H = 440
const NW = 128
const NH = 46

const COLORS: { key: string; fill: string; stroke: string; text: string; dot: string }[] = [
  { key: "violet", fill: "#ede9fe", stroke: "#8b5cf6", text: "#2e1065", dot: "#8b5cf6" },
  { key: "blue", fill: "#dbeafe", stroke: "#3b82f6", text: "#172554", dot: "#3b82f6" },
  { key: "green", fill: "#dcfce7", stroke: "#22c55e", text: "#052e16", dot: "#22c55e" },
  { key: "amber", fill: "#fef3c7", stroke: "#f59e0b", text: "#451a03", dot: "#f59e0b" },
  { key: "rose", fill: "#ffe4e6", stroke: "#f43f5e", text: "#4c0519", dot: "#f43f5e" },
  { key: "slate", fill: "#f1f5f9", stroke: "#64748b", text: "#0f172a", dot: "#64748b" },
]
function colorOf(key?: string) {
  return COLORS.find((c) => c.key === key) ?? COLORS[0]
}

function isGraph(v: any): v is FlowData {
  return !!v && Array.isArray(v.nodes) && Array.isArray(v.edges)
}
function isChartData(v: any) {
  return Array.isArray(v) && v.length > 0 && typeof v[0] === "object" && "value" in v[0]
}

/** 兼容各种老格式 → 统一 FlowData；非流程图返回 null */
function parseFlow(text: string): { flow: FlowData; legacy: null } | null {
  if (!text.trim()) return { flow: { nodes: [], edges: [], direction: "LR" }, legacy: null }
  let v: any
  try { v = JSON.parse(text) } catch { return null }
  if (isGraph(v)) return { flow: normalize(v), legacy: null }
  if (v && isGraph(v.graph)) return { flow: normalize({ ...v.graph, direction: v.direction ?? v.graph.direction }), legacy: null }
  return null
}
function normalize(f: FlowData): FlowData {
  return {
    nodes: f.nodes.filter((n) => n && typeof n.id === "string").map((n) => ({
      id: n.id, label: String(n.label ?? n.id),
      x: typeof n.x === "number" ? n.x : undefined,
      y: typeof n.y === "number" ? n.y : undefined,
      color: n.color, shape: (n.shape as Shape) ?? "rect",
    })),
    edges: f.edges.filter((e) => e && typeof e.from === "string").map((e) => ({ from: e.from, to: e.to, label: e.label })),
    direction: f.direction === "TB" ? "TB" : "LR",
  }
}

/** 简单分层自动排布：按拓扑深度分层，同层均匀分布 */
function autoLayout(flow: FlowData): FlowData {
  const { nodes, edges, direction } = flow
  if (nodes.length === 0) return flow
  const byId = new Map(nodes.map((n) => [n.id, n]))
  const incoming = new Map<string, number>(nodes.map((n) => [n.id, 0]))
  const adj = new Map<string, string[]>()
  for (const e of edges) {
    if (!byId.has(e.from) || !byId.has(e.to)) continue
    incoming.set(e.to, (incoming.get(e.to) ?? 0) + 1)
    if (!adj.has(e.from)) adj.set(e.from, [])
    adj.get(e.from)!.push(e.to)
  }
  const depth = new Map<string, number>()
  const queue: string[] = nodes.filter((n) => (incoming.get(n.id) ?? 0) === 0).map((n) => n.id)
  if (queue.length === 0) queue.push(nodes[0].id)
  for (const id of queue) if (!depth.has(id)) depth.set(id, 0)
  const visited = new Set<string>()
  const bfs = [...queue]
  while (bfs.length) {
    const cur = bfs.shift()!
    if (visited.has(cur)) continue
    visited.add(cur)
    for (const nxt of adj.get(cur) ?? []) {
      const d = (depth.get(cur) ?? 0) + 1
      if (d > (depth.get(nxt) ?? -1)) depth.set(nxt, d)
      bfs.push(nxt)
    }
  }
  for (const n of nodes) if (!depth.has(n.id)) depth.set(n.id, 0)
  const layers = new Map<number, FlowNode[]>()
  for (const n of nodes) {
    const d = depth.get(n.id) ?? 0
    if (!layers.has(d)) layers.set(d, [])
    layers.get(d)!.push(n)
  }
  const maxDepth = Math.max(...depth.values(), 0)
  const next = nodes.map((n) => ({ ...n }))
  const pos = new Map(next.map((n) => [n.id, n]))
  for (const [d, layer] of layers) {
    layer.forEach((n, i) => {
      const t = pos.get(n.id)!
      if (direction === "TB") {
        t.x = W / 2 + (i - (layer.length - 1) / 2) * (NW + 48)
        t.y = 70 + (d / Math.max(maxDepth, 1)) * (H - 140)
      } else {
        t.x = 90 + (d / Math.max(maxDepth, 1)) * (W - 180)
        t.y = H / 2 + (i - (layer.length - 1) / 2) * (NH + 36)
      }
      t.x = Math.min(Math.max(t.x, NW / 2 + 8), W - NW / 2 - 8)
      t.y = Math.min(Math.max(t.y, NH / 2 + 8), H - NH / 2 - 8)
    })
  }
  return { nodes: next, edges, direction }
}

function ensurePos(flow: FlowData): FlowData {
  if (flow.nodes.length === 0) return flow
  if (flow.nodes.every((n) => typeof n.x === "number" && typeof n.y === "number")) return flow
  // 部分缺坐标：缺的按网格补齐，不打乱已有坐标
  const missing = flow.nodes.filter((n) => typeof n.x !== "number" || typeof n.y !== "number")
  if (missing.length === flow.nodes.length) return autoLayout(flow)
  const next = flow.nodes.map((n) => ({ ...n }))
  missing.forEach((m, k) => {
    const t = next.find((n) => n.id === m.id)!
    t.x = W / 2 + ((k % 3) - 1) * (NW + 30)
    t.y = 90 + Math.floor(k / 3) * (NH + 40)
  })
  return { ...flow, nodes: next }
}

function edgePath(a: FlowNode, b: FlowNode, dir: "LR" | "TB") {
  const ax = a.x ?? W / 2, ay = a.y ?? H / 2
  const bx = b.x ?? W / 2, by = b.y ?? H / 2
  let x1 = ax, y1 = ay, x2 = bx, y2 = by
  if (dir === "LR") { x1 = ax + NW / 2; x2 = bx - NW / 2 }
  else { y1 = ay + NH / 2; y2 = by - NH / 2 }
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2
  const cx1 = dir === "LR" ? mx : x1
  const cy1 = dir === "LR" ? y1 : my
  const cx2 = dir === "LR" ? mx : x2
  const cy2 = dir === "LR" ? y2 : my
  return { d: `M ${x1} ${y1} C ${cx1} ${cy1}, ${cx2} ${cy2}, ${x2} ${y2}`, mx, my }
}

const TEMPLATES: { name: string; desc: string; make: () => FlowData }[] = [
  {
    name: tr("Approval flow"), desc: tr("Submit → Review → Publish"),
    make: () => ({
      direction: "LR",
      nodes: [
        { id: "start", label: tr("Submit request"), x: 100, y: 220, color: "blue", shape: "ellipse" },
        { id: "review", label: tr("Approve"), x: 320, y: 220, color: "amber", shape: "diamond" },
        { id: "fix", label: tr("Send back for revision"), x: 320, y: 330, color: "rose", shape: "rect" },
        { id: "ship", label: tr("Launch"), x: 560, y: 220, color: "green", shape: "ellipse" },
      ],
      edges: [
        { from: "start", to: "review" },
        { from: "review", to: "ship", label: tr("Approved") },
        { from: "review", to: "fix", label: tr("Rejected") },
        { from: "fix", to: "review", label: tr("Resubmit") },
      ],
    }),
  },
  {
    name: tr("Product launch"), desc: tr("Requirement → Dev → Test → Launch"),
    make: () => ({
      direction: "LR",
      nodes: [
        { id: "req", label: tr("Requirement review"), x: 95, y: 220, color: "violet" },
        { id: "dev", label: tr("Development"), x: 285, y: 220, color: "blue" },
        { id: "test", label: tr("Test"), x: 475, y: 220, color: "amber", shape: "diamond" },
        { id: "live", label: tr("Launch"), x: 655, y: 220, color: "green", shape: "ellipse" },
      ],
      edges: [
        { from: "req", to: "dev" },
        { from: "dev", to: "test" },
        { from: "test", to: "live", label: tr("Approved") },
        { from: "test", to: "dev", label: "bug" },
      ],
    }),
  },
]

/* ---------------- 旧版 JSON 图表兼容渲染（只读展示） ---------------- */
function LegacyPreview({ text }: { text: string }) {
  let parsed: any = null
  try { parsed = JSON.parse(text) } catch { parsed = null }
  let chart: { name: string; value: number }[] | null = null
  if (parsed && isChartData(parsed)) chart = parsed
  else if (parsed && typeof parsed === "object" && isChartData(parsed.chart)) chart = parsed.chart
  else if (parsed && typeof parsed === "object" && isChartData(parsed.data)) chart = parsed.data
  const max = chart ? Math.max(...chart.map((d) => d.value), 1) : 1
  return (
    <div className="p-3">
      <div className="mb-2 rounded-md bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-700 dark:text-amber-300">
        {tr("Legacy JSON chart, kept for display. Use Clear & redraw above for flowcharts.")}
      </div>
      {chart ? (
        <div className="space-y-1.5">
          {chart.slice(0, 12).map((d) => (
            <div key={d.name} className="flex items-center gap-2 text-xs">
              <span className="w-16 truncate text-muted-foreground">{d.name}</span>
              <div className="flex-1 h-3 rounded bg-muted overflow-hidden">
                <div className="h-full bg-brand" style={{ width: `${(d.value / max) * 100}%` }} />
              </div>
              <span className="w-10 text-right tabular-nums">{d.value}</span>
            </div>
          ))}
        </div>
      ) : (
        <pre className="max-h-[280px] overflow-auto rounded-md border bg-muted/10 p-2 font-mono text-[11px] thin-scrollbar">{JSON.stringify(parsed, null, 2)}</pre>
      )}
    </div>
  )
}

function InlineConfirm({ label, confirmLabel, onConfirm, className }: {
  label: ReactNode
  confirmLabel: string
  onConfirm: () => void
  className?: string
}) {
  const [arming, setArming] = useState(false)
  useEffect(() => {
    if (!arming) return
    const timer = window.setTimeout(() => setArming(false), 3000)
    return () => window.clearTimeout(timer)
  }, [arming])
  if (!arming) {
    return <button type="button" onClick={() => setArming(true)} className={className}>{label}</button>
  }
  return (
    <span className="inline-flex items-center gap-1">
      <button type="button" onClick={() => { setArming(false); onConfirm() }} className="rounded-md bg-destructive px-2 py-1 text-[11px] font-medium text-white">{confirmLabel}</button>
      <button type="button" onClick={() => setArming(false)} className="rounded-md border px-1.5 py-1 text-[11px] text-muted-foreground hover:bg-accent">{tr("Cancel")}</button>
    </span>
  )
}

/* ============================== 主组件 ============================== */

export function JsonVisualBlock({ block, readOnly, onUpdate }: { block: Block; readOnly: boolean; onUpdate: (p: Partial<Block>) => void }) {
  const [tab, setTab] = useState<"canvas" | "code">("canvas")
  const [copied, setCopied] = useState(false)
  const parsed = useMemo(() => parseFlow(block.text), [block.text])
  const isLegacyChart = useMemo(() => {
    if (parsed) return false
    try {
      const v = JSON.parse(block.text || "{}")
      return isChartData(v) || isChartData(v?.chart) || isChartData(v?.data)
    } catch { return false }
  }, [block.text, parsed])
  const parseError = !parsed && !isLegacyChart && block.text.trim()

  const [flow, setFlow] = useState<FlowData>(() => parsed?.flow ?? { nodes: [], edges: [], direction: "LR" })
  // 外部（协同/撤销）变化 → 同步本地
  useEffect(() => {
    if (!parsed) return
    setFlow((prev) => (JSON.stringify(prev) === JSON.stringify(ensurePos(parsed.flow)) ? prev : ensurePos(parsed.flow)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [block.text])

  const [selNode, setSelNode] = useState<string | null>(null)
  const [selEdge, setSelEdge] = useState<number | null>(null)
  const [connectFrom, setConnectFrom] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const dragRef = useRef<{ id: string; dx: number; dy: number } | null>(null)

  const laid = useMemo(() => ensurePos(flow), [flow])
  const byId = useMemo(() => new Map(laid.nodes.map((n) => [n.id, n])), [laid])
  const laidRef = useRef(laid)
  laidRef.current = laid

  function commit(next: FlowData) {
    setFlow(next)
    onUpdate({ text: JSON.stringify(next, null, 2) })
  }
  function patch(next: FlowData) {
    setFlow(next) // 拖拽中只改本地，松手再 commit
  }

  function toSvg(e: React.PointerEvent) {
    const svg = svgRef.current!
    const r = svg.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * W, y: ((e.clientY - r.top) / r.height) * H }
  }

  function addNode() {
    const id = `n${uid().slice(0, 4)}`
    const next: FlowData = {
      ...laid,
      nodes: [...laid.nodes, { id, label: tr("New node {n}", { n: laid.nodes.length + 1 }), x: W / 2 + (Math.random() * 80 - 40), y: H / 2 + (Math.random() * 80 - 40), color: "violet", shape: "rect" }],
    }
    commit(next)
    setSelNode(id); setSelEdge(null); setEditingId(id)
  }
  function delNode(id: string) {
    commit({ ...laid, nodes: laid.nodes.filter((n) => n.id !== id), edges: laid.edges.filter((e) => e.from !== id && e.to !== id) })
    if (selNode === id) setSelNode(null)
    if (connectFrom === id) setConnectFrom(null)
  }
  function delEdge(i: number) {
    commit({ ...laid, edges: laid.edges.filter((_, k) => k !== i) })
    setSelEdge(null)
  }
  function connect(a: string, b: string) {
    if (a === b) { toast.error(tr("Cannot connect to itself")); return }
    if (laid.edges.some((e) => e.from === a && e.to === b)) { toast.error(tr("Already connected")); return }
    commit({ ...laid, edges: [...laid.edges, { from: a, to: b }] })
    setSelEdge(laid.edges.length); setSelNode(null)
  }

  const sel = laid.nodes.find((n) => n.id === selNode) ?? null

  // ---- 只读：纯展示 ----
  if (readOnly) {
    if (!parsed || isLegacyChart) return (
      <div className="my-2 overflow-hidden rounded-xl border border-border/80 bg-card">
        <div className="flex items-center gap-1.5 border-b border-border/60 px-2.5 py-1.5 text-[10px] text-muted-foreground"><GitBranch className="size-3 text-brand" />{tr("Flowchart")}</div>
        {parsed ? <StaticCanvas flow={ensurePos(parsed.flow)} /> : <LegacyPreview text={block.text} />}
      </div>
    )
    return (
      <div className="my-2 overflow-hidden rounded-xl border border-border/80 bg-card">
        <div className="flex items-center gap-1.5 border-b border-border/60 px-2.5 py-1.5 text-[10px] text-muted-foreground"><GitBranch className="size-3 text-brand" />{tr("Flowchart")} · {tr("{n} nodes", { n: laid.nodes.length })}</div>
        <StaticCanvas flow={laid} />
      </div>
    )
  }

  return (
    <div className="my-2 overflow-hidden rounded-xl border border-border/80 bg-card">
      {/* 顶栏 */}
      <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 px-2.5 py-1.5 text-[10px]">
        <GitBranch className="size-3.5 text-brand" />
        <span className="font-semibold tracking-wider uppercase">{tr("Flowchart")}</span>
        <span className="text-muted-foreground/70 hidden sm:inline">{tr("Draw by pointing and dragging — no code needed")}</span>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">{tr("{a} nodes · {b} edges", { a: laid.nodes.length, b: laid.edges.length })}</span>
        <div className="ml-auto flex items-center gap-1">
          <button type="button" title={tr("Toggle horizontal / vertical")} onClick={() => commit(autoLayout({ ...laid, direction: laid.direction === "TB" ? "LR" : "TB" }))} className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] hover:bg-accent">
            <LayoutGrid className="size-3" />{laid.direction === "TB" ? tr("Vertical") : tr("Horizontal")}
          </button>
          <button type="button" title={tr("Auto layout")} onClick={() => commit(autoLayout(laid))} className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] hover:bg-accent">
            <Sparkles className="size-3" />{tr("Tidy")}
          </button>
          <button type="button" onClick={() => setTab(tab === "canvas" ? "code" : "canvas")} className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent">
            {tab === "canvas" ? <><Code2 className="size-3" />{tr("Data")}</> : <><Eye className="size-3" />{tr("Canvas")}</>}
          </button>
        </div>
      </div>

      {tab === "code" ? (
        <div>
          <textarea
            value={block.text} onChange={(e) => onUpdate({ text: e.target.value })} spellCheck={false}
            rows={Math.min(18, Math.max(6, block.text.split("\n").length + 1))}
            className="block w-full bg-transparent p-3 font-mono text-xs leading-5 outline-none"
          />
          <div className="border-t border-border/60 px-2.5 py-1.5 text-[11px] text-muted-foreground">{tr("Advanced: flowchart archive (JSON). No need to edit by hand — use the canvas.")}</div>
        </div>
      ) : !parsed ? (
        <div>
          {isLegacyChart || parseError ? <LegacyPreview text={block.text} /> : null}
          {parseError && !isLegacyChart && (
            <div className="mx-3 mb-2 rounded-md bg-destructive/10 px-2.5 py-2 text-xs text-destructive">{tr("Archive corrupted (JSON parse failed). Clear & redraw; old data is kept — back it up first.")}</div>
          )}
          <div className="flex flex-wrap gap-1.5 border-t border-border/60 p-2.5">
            <button type="button" onClick={() => { commit(TEMPLATES[0].make()); setSelNode(null); setSelEdge(null); setTab("canvas") }} className="rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white">{tr("Start with the approval template")}</button>
            <button type="button" onClick={() => { commit({ nodes: [], edges: [], direction: "LR" }); setSelNode(null); setSelEdge(null) }} className="rounded-lg border px-3 py-1.5 text-xs hover:bg-accent">{tr("Start over")}</button>
          </div>
        </div>
      ) : laid.nodes.length === 0 ? (
        /* 空态：手把手 */
        <div className="p-4 sm:p-6">
          <div className="mx-auto max-w-md rounded-2xl border border-dashed border-brand/40 bg-gradient-to-br from-brand-soft/40 to-transparent p-5 text-center">
            <div className="mx-auto mb-2 flex size-10 items-center justify-center rounded-xl bg-brand text-white"><GitBranch className="size-5" /></div>
            <div className="text-sm font-semibold">{tr("Start with your first node")}</div>
            <div className="mt-1 text-xs leading-5 text-muted-foreground">{tr("No syntax to learn: add nodes → double-click to rename → drag to arrange → one-click connect")}</div>
            <div className="mt-3 flex flex-wrap justify-center gap-1.5">
              <button type="button" onClick={addNode} className="flex items-center gap-1 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white"><Plus className="size-3.5" />{tr("Add your first node")}</button>
              {TEMPLATES.map((t) => (
                <button key={t.name} type="button" title={t.desc} onClick={() => { commit(t.make()); setSelNode(null); setSelEdge(null); setConnectFrom(null) }} className="rounded-lg border px-3 py-1.5 text-xs hover:bg-accent">{t.name}{tr("Template")}</button>
              ))}
            </div>
          </div>
        </div>
      ) : (
        <div className="sm:flex">
          {/* 画布 */}
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1 px-2.5 pt-2">
              <button type="button" onClick={addNode} className="flex items-center gap-1 rounded-lg bg-brand px-2.5 py-1.5 text-xs font-medium text-white"><Plus className="size-3.5" />{tr("Node")}</button>
              {selNode ? (
                <button
                  type="button"
                  onClick={() => setConnectFrom(connectFrom === selNode ? null : selNode)}
                  className={`flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium ${connectFrom === selNode ? "bg-amber-500 text-white" : "border hover:bg-accent"}`}
                >
                  <Link2 className="size-3.5" />{connectFrom === selNode ? tr("Click a target node to finish connecting…") : "连线"}
                </button>
              ) : (
                <button type="button" disabled title={tr("Select a node first")} className="flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs opacity-40 border"><Link2 className="size-3.5" />{tr("Connect")}</button>
              )}
              {connectFrom && <span className="animate-pulse text-[11px] text-amber-600">{tr("Connecting… click another node as the target (click empty space to cancel)")}</span>}
              <div className="ml-auto hidden items-center gap-1 text-[11px] text-muted-foreground md:flex"><MousePointer2 className="size-3" />{tr("Drag nodes · double-click to rename · click connections to label")}</div>
            </div>
            <div className="overflow-auto p-2.5 thin-scrollbar">
              <svg
                ref={svgRef} viewBox={`0 0 ${W} ${H}`}
                className={`min-w-[560px] w-full h-[380px] rounded-lg border bg-muted/20 touch-none select-none ${connectFrom ? "cursor-crosshair" : ""}`}
                onPointerMove={(e) => {
                  const d = dragRef.current
                  if (!d) return
                  const p = toSvg(e)
                  patch({
                    ...laidRef.current,
                    nodes: laidRef.current.nodes.map((n) => n.id === d.id
                      ? { ...n, x: Math.min(Math.max(p.x - d.dx, NW / 2 + 4), W - NW / 2 - 4), y: Math.min(Math.max(p.y - d.dy, NH / 2 + 4), H - NH / 2 - 4) }
                      : n),
                  })
                }}
                onPointerUp={() => {
                  if (dragRef.current) { dragRef.current = null; commit(laidRef.current) }
                }}
                onPointerLeave={() => { if (dragRef.current) { dragRef.current = null; commit(laidRef.current) } }}
                onClick={() => { setSelNode(null); setSelEdge(null); if (connectFrom) setConnectFrom(null) }}
              >
                <defs>
                  <marker id="fl-arrow" viewBox="0 0 10 10" refX={8} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#71717a" />
                  </marker>
                  <marker id="fl-arrow-hl" viewBox="0 0 10 10" refX={8} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="#8b5cf6" />
                  </marker>
                </defs>
                {/* 连线 */}
                {laid.edges.map((e, i) => {
                  const a = byId.get(e.from), b = byId.get(e.to)
                  if (!a || !b) return null
                  const { d, mx, my } = edgePath(a, b, laid.direction ?? "LR")
                  const active = selEdge === i
                  return (
                    <g key={i}
                      onClick={(ev) => { ev.stopPropagation(); setSelEdge(i); setSelNode(null) }}
                      className="cursor-pointer"
                    >
                      <path d={d} fill="none" stroke="transparent" strokeWidth={16} />
                      <path d={d} fill="none" stroke={active ? "#8b5cf6" : "#a1a1aa"} strokeWidth={active ? 2.5 : 1.8} markerEnd={active ? "url(#fl-arrow-hl)" : "url(#fl-arrow)"} />
                      {(e.label || active) && (
                        <g transform={`translate(${mx},${my})`}>
                          <rect x={-26} y={-10} width={52} height={18} rx={9} fill={active ? "#8b5cf6" : "white"} stroke={active ? "#8b5cf6" : "#e4e4e7"} />
                          <text y={3.5} fontSize={10} textAnchor="middle" fill={active ? "white" : "#52525b"}>{e.label || tr("Label")}</text>
                        </g>
                      )}
                    </g>
                  )
                })}
                {/* 节点 */}
                {laid.nodes.map((n) => {
                  const c = colorOf(n.color)
                  const x = n.x ?? W / 2, y = n.y ?? H / 2
                  const isSel = selNode === n.id
                  const isSrc = connectFrom === n.id
                  const shape = n.shape ?? "rect"
                  return (
                    <g key={n.id}
                      transform={`translate(${x},${y})`}
                      className="cursor-grab active:cursor-grabbing"
                      onPointerDown={(e) => {
                        e.stopPropagation()
                        ;(e.target as Element).setPointerCapture?.(e.pointerId)
                        const p = toSvg(e)
                        dragRef.current = { id: n.id, dx: p.x - x, dy: p.y - y }
                      }}
                      onPointerUp={(e) => {
                        e.stopPropagation()
                        const wasDrag = dragRef.current
                        dragRef.current = null
                        if (wasDrag) commit(laidRef.current)
                      }}
                      onClick={(e) => {
                        e.stopPropagation()
                        if (connectFrom && connectFrom !== n.id) { connect(connectFrom, n.id); setConnectFrom(null); return }
                        if (connectFrom === n.id) { setConnectFrom(null); return }
                        setSelNode(n.id); setSelEdge(null)
                      }}
                      onDoubleClick={(e) => { e.stopPropagation(); setSelNode(n.id); setEditingId(n.id) }}
                    >
                      {shape === "diamond" ? (
                        <path d={`M 0 ${-NH / 2 - 8} L ${NW / 2 + 10} 0 L 0 ${NH / 2 + 8} L ${-NW / 2 - 10} 0 Z`}
                          fill={c.fill} stroke={isSel || isSrc ? "#8b5cf6" : c.stroke} strokeWidth={isSel || isSrc ? 2.5 : 1.8} />
                      ) : shape === "ellipse" ? (
                        <rect x={-NW / 2} y={-NH / 2} width={NW} height={NH} rx={NH / 2} fill={c.fill} stroke={isSel || isSrc ? "#8b5cf6" : c.stroke} strokeWidth={isSel || isSrc ? 2.5 : 1.8} />
                      ) : (
                        <rect x={-NW / 2} y={-NH / 2} width={NW} height={NH} rx={10} fill={c.fill} stroke={isSel || isSrc ? "#8b5cf6" : c.stroke} strokeWidth={isSel || isSrc ? 2.5 : 1.8} />
                      )}
                      {editingId === n.id ? (
                        <foreignObject x={-NW / 2 + 4} y={-14} width={NW - 8} height={28}>
                          <input
                            autoFocus defaultValue={n.label}
                            onClick={(e) => e.stopPropagation()}
                            onBlur={(e) => {
                              const v = e.target.value.trim() || n.label
                              commit({ ...laid, nodes: laid.nodes.map((m) => m.id === n.id ? { ...m, label: v } : m) })
                              setEditingId(null)
                            }}
                            onKeyDown={(e) => {
                              e.stopPropagation()
                              if (isImeKeyEvent(e)) return
                              if (e.key === "Enter") (e.target as HTMLInputElement).blur()
                              if (e.key === "Escape") setEditingId(null)
                            }}
                            className="h-full w-full rounded bg-white/90 text-center text-xs font-medium outline-none"
                            style={{ color: c.text }}
                          />
                        </foreignObject>
                      ) : (
                        <text y={4} fontSize={12} fontWeight={600} textAnchor="middle" fill={c.text}>
                          {n.label.length > 10 ? n.label.slice(0, 10) + "…" : n.label}
                        </text>
                      )}
                      {isSrc && (
                        <circle r={5} cx={laid.direction === "TB" ? 0 : NW / 2 + 6} cy={laid.direction === "TB" ? NH / 2 + 8 : 0} fill="#f59e0b" className="animate-ping" />
                      )}
                    </g>
                  )
                })}
              </svg>
            </div>
          </div>

          {/* 右侧编辑面板 */}
          <div className="border-t border-border/60 sm:w-52 sm:shrink-0 sm:border-l sm:border-t-0">
            <div className="space-y-3 p-3">
              {sel && (
                <div className="space-y-2 rounded-lg border bg-muted/20 p-2">
                  <div className="text-[11px] font-semibold">{tr("Node settings")}</div>
                  <input
                    value={sel.label}
                    onChange={(e) => commit({ ...laid, nodes: laid.nodes.map((m) => m.id === sel.id ? { ...m, label: e.target.value } : m) })}
                    className="w-full rounded-md border bg-background px-2 py-1 text-xs outline-none focus:border-brand"
                  />
                  <div className="flex gap-1">
                    {([["rect", Square, tr("Rectangle")], ["diamond", Diamond, tr("Decision")], ["ellipse", Circle, tr("Start/End")]] as const).map(([k, Icon, tip]) => (
                      <button key={k} type="button" title={tip}
                        onClick={() => commit({ ...laid, nodes: laid.nodes.map((m) => m.id === sel.id ? { ...m, shape: k } : m) })}
                        className={`flex flex-1 items-center justify-center gap-0.5 rounded-md border px-1 py-1 text-[11px] ${(sel.shape ?? "rect") === k ? "border-brand bg-brand-soft font-semibold" : "hover:bg-accent"}`}>
                        <Icon className="size-3" />{tip}
                      </button>
                    ))}
                  </div>
                  <div className="flex gap-1.5">
                    {COLORS.map((c) => (
                      <button key={c.key} type="button" title={c.key}
                        onClick={() => commit({ ...laid, nodes: laid.nodes.map((m) => m.id === sel.id ? { ...m, color: c.key } : m) })}
                        className={`size-5 rounded-full border-2 ${sel.color === c.key || (!sel.color && c.key === "violet") ? "border-foreground" : "border-transparent"}`}
                        style={{ background: c.dot }} />
                    ))}
                  </div>
                  <div className="flex gap-1">
                    <button type="button" onClick={() => setConnectFrom(sel.id)} className="flex flex-1 items-center justify-center gap-1 rounded-md border px-2 py-1 text-[11px] hover:bg-accent"><ArrowRight className="size-3" />{tr("Connect from here")}</button>
                    <button type="button" onClick={() => delNode(sel.id)} className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10"><Trash2 className="size-3" />{tr("Delete")}</button>
                  </div>
                </div>
              )}
              {selEdge !== null && laid.edges[selEdge] && (
                <div className="space-y-2 rounded-lg border border-brand/30 bg-brand-soft/20 p-2">
                  <div className="flex items-center gap-1 text-[11px] font-semibold"><Unlink className="size-3" />{tr("Connection settings")}</div>
                  <div className="truncate text-[11px] text-muted-foreground">
                    {(byId.get(laid.edges[selEdge].from)?.label ?? "?") + " → " + (byId.get(laid.edges[selEdge].to)?.label ?? "?")}
                  </div>
                  <input
                    value={laid.edges[selEdge].label ?? ""}
                    placeholder={tr("Label, e.g. Approved / Rejected (optional)")}
                    onChange={(e) => {
                      const edges = laid.edges.map((x, k) => k === selEdge ? { ...x, label: e.target.value } : x)
                      commit({ ...laid, edges })
                    }}
                    className="w-full rounded-md border bg-background px-2 py-1 text-xs outline-none focus:border-brand"
                  />
                  <button type="button" onClick={() => delEdge(selEdge)} className="flex w-full items-center justify-center gap-1 rounded-md px-2 py-1 text-[11px] text-destructive hover:bg-destructive/10"><Trash2 className="size-3" />{tr("Delete this connection")}</button>
                </div>
              )}
              {!sel && selEdge === null && (
                <div className="rounded-lg border border-dashed p-2 text-[11px] leading-5 text-muted-foreground">
                  {tr("Click a")}<b>{tr("Node")}</b>{tr("Rename and recolor,")}<br />{tr("Click a")}<b>{tr("Connection")}</b>{tr("add labels,")}<br />{tr("drag nodes anywhere.")}
                </div>
              )}
              <div className="space-y-1">
                <div className="text-[11px] font-semibold text-muted-foreground">{tr("Quick actions")}</div>
                <div className="flex flex-wrap gap-1">
                  <button type="button" onClick={addNode} className="rounded-md border px-2 py-1 text-[11px] hover:bg-accent">+ {tr("Node")}</button>
                  <button
                    type="button"
                    title={tr("Download PNG")}
                    onClick={() => {
                      const el = svgRef.current
                      if (!el) {
                        toast.error(tr("No flowchart to export"))
                        return
                      }
                      const clone = el.cloneNode(true) as SVGSVGElement
                      clone.setAttribute("xmlns", "http://www.w3.org/2000/svg")
                      const href = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" }))
                      const img = new Image()
                      img.onload = () => {
                        const canvas = document.createElement("canvas")
                        canvas.width = 1520
                        canvas.height = 880
                        const ctx = canvas.getContext("2d")
                        if (ctx) {
                          ctx.fillStyle = getComputedStyle(document.body).backgroundColor || "#ffffff"
                          ctx.fillRect(0, 0, canvas.width, canvas.height)
                          ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
                          canvas.toBlob((blob) => {
                            if (!blob) return
                            const url = URL.createObjectURL(blob)
                            const link = document.createElement("a")
                            link.href = url
                            link.download = "flowchart.png"
                            link.click()
                            window.setTimeout(() => URL.revokeObjectURL(url), 2000)
                          }, "image/png")
                        }
                        URL.revokeObjectURL(href)
                      }
                      img.src = href
                    }}
                    className="rounded-md border px-2 py-1 text-[11px] hover:bg-accent"
                  >
                    PNG
                  </button>
                  <button type="button" onClick={() => commit(autoLayout(laid))} className="rounded-md border px-2 py-1 text-[11px] hover:bg-accent">{tr("Auto layout")}</button>
                  <button type="button" onClick={() => { void navigator.clipboard.writeText(block.text).then(() => { toast.success(tr("Copied")); setCopied(true); setTimeout(() => setCopied(false), 1200) }) }} className="flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] hover:bg-accent">{copied ? <Check className="size-3 text-green-600" /> : <Copy className="size-3" />}{tr("Copy data")}</button>
                </div>
                <div className="flex flex-wrap gap-1 pt-1">
                  {TEMPLATES.map((t) => (
                    laid.nodes.length ? (
                      <InlineConfirm key={t.name} label={<span title={t.desc}>{t.name}{tr("Template")}</span>} confirmLabel={tr("Confirm overwrite?")} onConfirm={() => { commit(t.make()); setSelNode(null); setSelEdge(null); setConnectFrom(null) }} className="rounded-md bg-muted px-2 py-1 text-[11px] hover:bg-accent" />
                    ) : (
                      <button key={t.name} type="button" title={t.desc} onClick={() => { commit(t.make()); setSelNode(null); setSelEdge(null); setConnectFrom(null) }} className="rounded-md bg-muted px-2 py-1 text-[11px] hover:bg-accent">{t.name}{tr("Template")}</button>
                    )
                  ))}
                  {laid.nodes.length ? (
                    <InlineConfirm label={<span className="flex items-center gap-1"><Eraser className="size-3" />{tr("Clear")}</span>} confirmLabel={tr("Confirm clear?")} onConfirm={() => { commit({ nodes: [], edges: [], direction: "LR" }); setSelNode(null); setSelEdge(null) }} className="flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground hover:bg-accent" />
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
      {/* 底栏小字 */}
      <div className="hidden border-t border-border/60 px-2.5 py-1 text-[11px] text-muted-foreground sm:block">
        <Braces className="mr-1 inline size-3" />{tr("Auto-saved as structured data")} · <button type="button" className="underline underline-offset-2 hover:text-foreground" onClick={() => setTab(tab === "canvas" ? "code" : "canvas")}>{tr("View")}</button> · {tr("For classic Mermaid use the")} <code className="rounded bg-muted px-1">diagram</code> 块
      </div>
    </div>
  )
}

function StaticCanvas({ flow }: { flow: FlowData }) {
  const laid = ensurePos(flow)
  const byId = new Map(laid.nodes.map((n) => [n.id, n]))
  if (!laid.nodes.length) return <div className="p-6 text-center text-xs text-muted-foreground">{tr("(Empty flowchart)")}</div>
  return (
    <div className="overflow-auto p-2.5 thin-scrollbar">
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full min-w-[480px] h-[320px] rounded-lg border bg-muted/20">
        <defs>
          <marker id="fls-arrow" viewBox="0 0 10 10" refX={8} refY={5} markerWidth={7} markerHeight={7} orient="auto-start-reverse">
            <path d="M 0 0 L 10 5 L 0 10 z" fill="#71717a" />
          </marker>
        </defs>
        {laid.edges.map((e, i) => {
          const a = byId.get(e.from), b = byId.get(e.to)
          if (!a || !b) return null
          const { d, mx, my } = edgePath(a, b, laid.direction ?? "LR")
          return (
            <g key={i}>
              <path d={d} fill="none" stroke="#a1a1aa" strokeWidth={1.8} markerEnd="url(#fls-arrow)" />
              {e.label && (
                <g transform={`translate(${mx},${my})`}>
                  <rect x={-26} y={-10} width={52} height={18} rx={9} fill="white" stroke="#e4e4e7" />
                  <text y={3.5} fontSize={10} textAnchor="middle" fill="#52525b">{e.label}</text>
                </g>
              )}
            </g>
          )
        })}
        {laid.nodes.map((n) => {
          const c = colorOf(n.color)
          const x = n.x ?? W / 2, y = n.y ?? H / 2
          const shape = n.shape ?? "rect"
          return (
            <g key={n.id} transform={`translate(${x},${y})`}>
              {shape === "diamond" ? (
                <path d={`M 0 ${-NH / 2 - 8} L ${NW / 2 + 10} 0 L 0 ${NH / 2 + 8} L ${-NW / 2 - 10} 0 Z`} fill={c.fill} stroke={c.stroke} strokeWidth={1.8} />
              ) : shape === "ellipse" ? (
                <rect x={-NW / 2} y={-NH / 2} width={NW} height={NH} rx={NH / 2} fill={c.fill} stroke={c.stroke} strokeWidth={1.8} />
              ) : (
                <rect x={-NW / 2} y={-NH / 2} width={NW} height={NH} rx={10} fill={c.fill} stroke={c.stroke} strokeWidth={1.8} />
              )}
              <text y={4} fontSize={12} fontWeight={600} textAnchor="middle" fill={c.text}>{n.label.length > 10 ? n.label.slice(0, 10) + "…" : n.label}</text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}
