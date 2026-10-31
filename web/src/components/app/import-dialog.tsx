import { useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import {
  ArrowDownToLine, ArrowUpFromLine, CheckCircle2, FileUp, Link2, Loader2,
} from "lucide-react"
import { toast } from "sonner"
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { api } from "@/lib/api"
import { tr } from "@/lib/i18n"
import type { Block } from "@/lib/types"
import { useWorkspaceStore } from "@/stores/workspace"
import { useTasksStore } from "@/stores/tasks"
import { parseMarkdownToBlocks } from "@/lib/markdown-import"
import { extractHTMLTitle, parseHTMLToBlocks } from "@/lib/html-import"
import { inlineMarkdownToRich } from "@/lib/inline-markdown"

type Tab = "file" | "notion" | "yuque" | "feishu" | "export"

const GUIDES: { name: string; steps: string; formats: string }[] = [
  { name: "Notion", steps: tr("Open a page → top-right ⋯ → Export → Markdown or HTML"), formats: "Markdown / HTML" },
  { name: "Feishu Docs", steps: tr("Doc top-right ⋯ → Export as → Markdown / HTML"), formats: "Markdown / HTML" },
  { name: "Yuque", steps: tr("Doc top-right ⋯ → Export → Markdown / HTML (images need network)"), formats: "Markdown / HTML" },
  { name: "Obsidian", steps: tr("Local .md files — select many at once"), formats: "Markdown" },
  { name: "Evernote", steps: tr("Export notes as HTML from the client"), formats: "HTML" },
  { name: "FlowUs / Wolai / Youdao", steps: tr("Export as Markdown or HTML first"), formats: "Markdown / HTML" },
]

/** 后端直连返回的 blocks 只有 text(markdown)，补上 rich 富文本。 */
export function enrichBlocksWithRich(blocks: Block[]): Block[] {
  return blocks.map((b) => {
    if (b.rich || !b.text || ["table", "image", "divider", "code"].includes(b.type)) return b
    try {
      const parsed = inlineMarkdownToRich(b.text)
      return parsed.rich ? { ...b, text: parsed.plain, rich: parsed.rich } : b
    } catch {
      return b
    }
  })
}

async function createPageWithBlocks(workspaceId: string, title: string, blocks: Block[]) {
  const page = await api.pages.create({ workspaceId, title: title || tr("Imported page") })
  await api.pages.saveBlocks(page.id, blocks)
  return page
}

export function ImportDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (v: boolean) => void }) {
  const navigate = useNavigate()
  const activeId = useWorkspaceStore((s) => s.activeId)
  const pages = useWorkspaceStore((s) => s.pages)
  const refreshPages = useWorkspaceStore((s) => s.refreshPages)
  const [tab, setTab] = useState<Tab>("file")
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  // 直连表单
  const [notionURL, setNotionURL] = useState("")
  const [notionToken, setNotionToken] = useState("")
  const [yuqueURL, setYuqueURL] = useState("")
  const [yuqueToken, setYuqueToken] = useState("")
  const [feishuId, setFeishuId] = useState("")
  const [feishuAppId, setFeishuAppId] = useState("")
  const [feishuSecret, setFeishuSecret] = useState("")
  const [exportFormat, setExportFormat] = useState<"md" | "html">("md")

  async function afterImport(pageIds: string[], total: number) {
    if (activeId) await refreshPages(activeId).catch(() => undefined)
    if (pageIds.length === 1) navigate(`/page/${pageIds[0]}`)
    toast.success(tr("Imported {n} page(s)", { n: total }))
    onOpenChange(false)
  }

  /* ---------------- 批量文件导入：每个文件新建一页 ---------------- */
  async function onPickFiles(files: FileList | null) {
    if (!files?.length || !activeId) return
    const list = [...files].slice(0, 50)
    setBusy(true)
    setProgress({ done: 0, total: list.length })
    const taskId = useTasksStore.getState().start(tr("Importing {n} file(s)", { n: list.length }))
    const created: string[] = []
    try {
      for (const file of list) {
        const lower = file.name.toLowerCase()
        const isHTML = lower.endsWith(".html") || lower.endsWith(".htm")
        const raw = await file.text()
        const blocks = isHTML ? parseHTMLToBlocks(raw) : parseMarkdownToBlocks(raw)
        if (!blocks.length) {
          toast.error(tr("No blocks found in this file") + `：${file.name}`)
          setProgress((p) => p && { done: p.done + 1, total: p.total })
          continue
        }
        const base = file.name.replace(/\.(md|markdown|txt|html?|text)$/i, "")
        const title = (isHTML ? extractHTMLTitle(raw) : "") || base || tr("Imported page")
        const page = await createPageWithBlocks(activeId, title.slice(0, 120), blocks)
        created.push(page.id)
        setProgress((p) => p && { done: p.done + 1, total: p.total })
        useTasksStore.getState().update(taskId, { progress: Math.round((created.length / list.length) * 100) })
      }
      useTasksStore.getState().finish(taskId, tr("Imported {n} page(s)", { n: created.length }))
      await afterImport(created, created.length)
    } catch (e) {
      const message = e instanceof Error ? e.message : tr("Could not import files")
      useTasksStore.getState().fail(taskId, message)
      toast.error(message, {
        action: { label: tr("Retry"), onClick: () => void onPickFiles(files) },
      })
    } finally {
      setBusy(false)
      setProgress(null)
    }
  }

  /* ---------------- 直连导入 ---------------- */
  async function importDirect(kind: "notion" | "yuque" | "feishu") {
    if (!activeId) return
    setBusy(true)
    try {
      let result: { title: string; blocks: Block[] }
      if (kind === "notion") {
        if (!notionURL.trim()) throw new Error(tr("Please paste a Notion page link or ID"))
        if (notionToken.trim()) {
          await api.integrations.save(activeId, "notion", { config: {}, secret: notionToken.trim() })
          setNotionToken("")
        }
        result = await api.integrations.importNotion(activeId, notionURL.trim())
      } else if (kind === "yuque") {
        if (!yuqueURL.trim()) throw new Error(tr("Please paste a Yuque doc link"))
        if (yuqueToken.trim()) {
          await api.integrations.save(activeId, "yuque", { config: {}, secret: yuqueToken.trim() })
          setYuqueToken("")
        }
        result = await api.integrations.importYuque(activeId, yuqueURL.trim())
      } else {
        if (!feishuId.trim()) throw new Error(tr("Please enter a Feishu document ID or link"))
        if (feishuAppId.trim() && feishuSecret.trim()) {
          await api.integrations.save(activeId, "feishu", { config: { appId: feishuAppId.trim() }, secret: feishuSecret.trim() })
          setFeishuSecret("")
        }
        result = await api.integrations.importFeishu(activeId, feishuId.trim())
      }
      if (!result.blocks?.length) throw new Error(tr("No blocks found in this file"))
      const page = await createPageWithBlocks(activeId, (result.title || tr("Imported page")).slice(0, 120), enrichBlocksWithRich(result.blocks))
      await afterImport([page.id], 1)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Import failed"), {
        action: { label: tr("Retry"), onClick: () => void importDirect(kind) },
      })
    } finally {
      setBusy(false)
    }
  }

  /* ---------------- 批量导出 ---------------- */
  async function exportAll() {
    if (!activeId) return
    setBusy(true)
    const taskId = useTasksStore.getState().start(tr("Export workspace"))
    const tasks = useTasksStore.getState()
    try {
      const { jobId } = await api.integrations.exportJob(activeId, exportFormat)
      // Poll for real progress (1s); job TTL is 10min server-side.
      let status = "queued"
      let done = 0
      let total = 0
      for (let i = 0; i < 600; i++) {
        await new Promise((r) => window.setTimeout(r, 1000))
        const st = await api.integrations.exportJobStatus(activeId, jobId)
        status = st.status
        done = st.done
        total = st.total
        if (status === "failed") throw new Error(st.error || tr("Could not export page"))
        if (status === "done") break
        tasks.update(taskId, { progress: total > 0 ? Math.round((done / total) * 100) : null })
      }
      if (status !== "done") throw new Error(tr("Export timed out"))
      const blob = await api.integrations.exportJobDownload(activeId, jobId)
      tasks.finish(taskId)
      const href = URL.createObjectURL(blob)
      const link = document.createElement("a")
      link.href = href
      link.download = `motion-export.${exportFormat === "md" ? "zip" : "zip"}`
      document.body.appendChild(link)
      link.click()
      link.remove()
      window.setTimeout(() => URL.revokeObjectURL(href), 2000)
      toast.success(tr("Export ready"))
    } catch (e) {
      const message = e instanceof Error ? e.message : tr("Could not export page")
      tasks.fail(taskId, message)
      toast.error(message, {
        action: { label: tr("Retry"), onClick: () => void exportAll() },
      })
    } finally {
      setBusy(false)
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "file", label: tr("Import files") },
    { id: "notion", label: "Notion" },
    { id: "yuque", label: "Yuque" },
    { id: "feishu", label: "Feishu" },
    { id: "export", label: tr("Batch export") },
  ]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] max-w-xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ArrowDownToLine className="size-4 text-brand" />
            {tr("Move from other notes")}
          </DialogTitle>
          <DialogDescription>
            {tr("Import Markdown / HTML exports in batch, or connect Notion, Yuque and Feishu directly.")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-wrap gap-1 rounded-lg bg-muted/50 p-1">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              className={`flex-1 whitespace-nowrap rounded-md px-2 py-1.5 text-xs font-medium transition ${tab === t.id ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
            >
              {t.label}
            </button>
          ))}
        </div>

        {tab === "file" && (
          <div className="space-y-3">
            <div className="space-y-1.5">
              {GUIDES.map((g) => (
                <div key={g.name} className="flex items-start gap-2 rounded-lg border border-border/60 px-2.5 py-2 text-xs">
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 text-emerald-500" />
                  <div className="min-w-0">
                    <span className="font-semibold">{g.name}</span>
                    <span className="ml-1.5 rounded bg-muted px-1 py-0.5 text-[10px] text-muted-foreground">{g.formats}</span>
                    <div className="mt-0.5 leading-5 text-muted-foreground">{g.steps}</div>
                  </div>
                </div>
              ))}
            </div>
            <Button className="w-full gap-2" disabled={busy || !activeId} onClick={() => fileRef.current?.click()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <FileUp className="size-4" />}
              {progress ? tr("Importing {a}/{b}…", { a: progress.done, b: progress.total }) : tr("Select files (batch supported)")}
            </Button>
            <input
              ref={fileRef}
              type="file"
              multiple
              accept=".md,.markdown,.txt,.text,.html,.htm,text/markdown,text/plain,text/html"
              className="hidden"
              onChange={(e) => { void onPickFiles(e.target.files); e.target.value = "" }}
            />
            <p className="text-center text-[11px] text-muted-foreground">{tr("Each file becomes a new page · up to 50 at a time")}</p>
          </div>
        )}

        {tab === "notion" && (
          <div className="space-y-3">
            <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
              {tr("1. Create an Internal Integration at")} <a className="underline" href="https://www.notion.so/my-account/integrations" target="_blank" rel="noreferrer">Notion Integrations</a> {tr("and copy the token (starts with ntn_ or secret_)")}
              <br />{tr("2. Share the integration with the page to import (page ⋯ → Add connections)")}
              <br />{tr("3. Paste the page link back here. The token stays in this workspace and can be deleted anytime.")}
            </div>
            <div className="space-y-1.5">
              <Label>{tr("Notion token (skip if saved)")}</Label>
              <Input type="password" value={notionToken} onChange={(e) => setNotionToken(e.target.value)} placeholder="ntn_…" autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label>{tr("Page link or ID")}</Label>
              <Input value={notionURL} onChange={(e) => setNotionURL(e.target.value)} placeholder="https://www.notion.so/… or 32-char ID" />
            </div>
            <Button className="w-full gap-2" disabled={busy || !activeId} onClick={() => void importDirect("notion")}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
              {tr("Import page")}
            </Button>
          </div>
        )}

        {tab === "yuque" && (
          <div className="space-y-3">
            <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
              {tr("1. Yuque avatar → Settings → Token, create and copy one")}
              <br />{tr("2. Paste the doc link back here (e.g.")} <code>https://xxx.yuque.com/org/book/slug</code>)
            </div>
            <div className="space-y-1.5">
              <Label>{tr("Yuque token (skip if saved)")}</Label>
              <Input type="password" value={yuqueToken} onChange={(e) => setYuqueToken(e.target.value)} placeholder="Yuque token" autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label>{tr("Doc link")}</Label>
              <Input value={yuqueURL} onChange={(e) => setYuqueURL(e.target.value)} placeholder="https://….yuque.com/…/…/slug" />
            </div>
            <Button className="w-full gap-2" disabled={busy || !activeId} onClick={() => void importDirect("yuque")}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
              {tr("Import page")}
            </Button>
          </div>
        )}

        {tab === "feishu" && (
          <div className="space-y-3">
            <div className="rounded-lg bg-muted/40 px-3 py-2 text-xs leading-5 text-muted-foreground">
              {tr("1. Create a custom app at")} <a className="underline" href="https://open.feishu.cn/app" target="_blank" rel="noreferrer">Feishu Open Platform</a> {tr("with docx:document:readonly permission and publish it")}
              <br />{tr("2. Share the doc with the app (or turn on public web access)")}
              <br />{tr("3. Fill App ID / App Secret, then paste the doc link or ID.")}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>App ID</Label>
                <Input value={feishuAppId} onChange={(e) => setFeishuAppId(e.target.value)} placeholder="cli_…" autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <Label>{tr("App secret (skip if saved)")}</Label>
                <Input type="password" value={feishuSecret} onChange={(e) => setFeishuSecret(e.target.value)} placeholder="…" autoComplete="off" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>{tr("Doc link or ID")}</Label>
              <Input value={feishuId} onChange={(e) => setFeishuId(e.target.value)} placeholder="https://….feishu.cn/docx/… or Docx_…" />
            </div>
            <Button className="w-full gap-2" disabled={busy || !activeId} onClick={() => void importDirect("feishu")}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <Link2 className="size-4" />}
              {tr("Import page")}
            </Button>
          </div>
        )}

        {tab === "export" && (
          <div className="space-y-3">
            <div className="rounded-lg border border-border/60 px-3 py-2.5 text-xs leading-5 text-muted-foreground">
              导出工作区全部 <b className="text-foreground">{pages.filter((p) => !p.archived).length}</b> 个页面为 ZIP（含 Markdown 或 HTML 两种格式），方便备份或迁往其他笔记。
            </div>
            <div className="flex gap-1 rounded-lg bg-muted/50 p-1">
              {(["md", "html"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setExportFormat(f)}
                  className={`flex-1 rounded-md px-2 py-1.5 text-xs font-medium transition ${exportFormat === f ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}
                >
                  {f === "md" ? "Markdown .zip" : "HTML .zip"}
                </button>
              ))}
            </div>
            <Button className="w-full gap-2" disabled={busy || !activeId} onClick={() => void exportAll()}>
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ArrowUpFromLine className="size-4" />}
              {tr("Export workspace")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  )
}
