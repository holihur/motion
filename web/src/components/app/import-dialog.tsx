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
import { parseMarkdownToBlocks } from "@/lib/markdown-import"
import { extractHTMLTitle, parseHTMLToBlocks } from "@/lib/html-import"
import { inlineMarkdownToRich } from "@/lib/inline-markdown"

type Tab = "file" | "notion" | "yuque" | "feishu" | "export"

const GUIDES: { name: string; steps: string; formats: string }[] = [
  { name: "Notion", steps: "打开页面 → 右上 ⋯ → 导出 → 选择 Markdown 或 HTML", formats: "Markdown / HTML" },
  { name: "飞书文档", steps: "文档右上 ⋯ → 导出为 → Markdown / HTML", formats: "Markdown / HTML" },
  { name: "语雀", steps: "文档右上 ⋯ → 导出 → Markdown / HTML（含图片需联网）", formats: "Markdown / HTML" },
  { name: "Obsidian", steps: "本地库里的 .md 文件，可多选一次性导入", formats: "Markdown" },
  { name: "印象笔记", steps: "客户端将笔记导出为 HTML 后导入", formats: "HTML" },
  { name: "FlowUs / Wolai / 有道云", steps: "导出为 Markdown 或 HTML 后导入", formats: "Markdown / HTML" },
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
      }
      await afterImport(created, created.length)
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Could not import files"))
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
      toast.error(e instanceof Error ? e.message : tr("Import failed"))
    } finally {
      setBusy(false)
    }
  }

  /* ---------------- 批量导出 ---------------- */
  async function exportAll() {
    if (!activeId) return
    setBusy(true)
    try {
      const blob = await api.integrations.exportWorkspace(activeId, exportFormat)
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
      toast.error(e instanceof Error ? e.message : tr("Could not export page"))
    } finally {
      setBusy(false)
    }
  }

  const tabs: { id: Tab; label: string }[] = [
    { id: "file", label: tr("Import files") },
    { id: "notion", label: "Notion" },
    { id: "yuque", label: "语雀" },
    { id: "feishu", label: "飞书" },
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
              1. 打开 <a className="underline" href="https://www.notion.so/my-account/integrations" target="_blank" rel="noreferrer">Notion Integrations</a> 新建 Internal Integration 并复制 Token（以 <code>ntn_</code> 或 <code>secret_</code> 开头）
              2. 把该 Integration 分享给要导入的页面（页面 ⋯ → 添加连接）
              3. 粘贴页面链接回来导入。Token 仅保存在本工作区，可随时删除。
            </div>
            <div className="space-y-1.5">
              <Label>Notion Token（已保存过可不填）</Label>
              <Input type="password" value={notionToken} onChange={(e) => setNotionToken(e.target.value)} placeholder="ntn_…" autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label>页面链接或 ID</Label>
              <Input value={notionURL} onChange={(e) => setNotionURL(e.target.value)} placeholder="https://www.notion.so/… 或 32 位 ID" />
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
              1. 语雀 头像 → 账户设置 → Token 新建并复制
              2. 粘贴文档链接（如 <code>https://xxx.yuque.com/org/book/slug</code>）回来导入。
            </div>
            <div className="space-y-1.5">
              <Label>语雀 Token（已保存过可不填）</Label>
              <Input type="password" value={yuqueToken} onChange={(e) => setYuqueToken(e.target.value)} placeholder="语雀个人 Token" autoComplete="off" />
            </div>
            <div className="space-y-1.5">
              <Label>文档链接</Label>
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
              1. <a className="underline" href="https://open.feishu.cn/app" target="_blank" rel="noreferrer">飞书开放平台</a> 创建自建应用，开通 <code>docx:document:readonly</code> 权限并发布
              2. 把要导入的文档分享给该应用（或开启“互联网可读”）
              3. 填 App ID / App Secret，粘贴文档链接或 ID。
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1.5">
                <Label>App ID</Label>
                <Input value={feishuAppId} onChange={(e) => setFeishuAppId(e.target.value)} placeholder="cli_…" autoComplete="off" />
              </div>
              <div className="space-y-1.5">
                <Label>App Secret（已保存过可不填）</Label>
                <Input type="password" value={feishuSecret} onChange={(e) => setFeishuSecret(e.target.value)} placeholder="…" autoComplete="off" />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>文档链接或 ID</Label>
              <Input value={feishuId} onChange={(e) => setFeishuId(e.target.value)} placeholder="https://….feishu.cn/docx/… 或 Docx_…" />
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
