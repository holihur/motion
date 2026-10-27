import { Fragment, lazy, Suspense, useEffect, useMemo, useRef, useState } from "react"
import { useNavigate, useParams } from "react-router-dom"
import {
  AlertCircle,
  Check,
  ChevronRight,
  Clock3,
  FileQuestion,
  FileText,
  ImagePlus,
  LockKeyhole,
  Loader2,
  MessageSquare,
  MessageSquarePlus,
  MoreHorizontal,
  Plus,
  RotateCcw,
  SmilePlus,
  Sparkles,
  SquarePen,
  Star,
  Users,
} from "lucide-react"
import { toast } from "sonner"
import { ApiError, api, getClientId } from "@/lib/api"
import { tr } from "@/lib/i18n"
import type { Block, Comment, Member, Page } from "@/lib/types"
import { applyBlockSync, diffBlocks } from "@/lib/blocks"
import { cn, initials, uid } from "@/lib/utils"
import { caretOffset, focusBlockById, setCaret } from "@/lib/caret"
import { RealtimeClient, type RealtimePresence } from "@/lib/realtime"
import { coverStyle } from "@/lib/covers"
import { buildTree, ancestorChain, pageTitle } from "@/lib/tree"
import { Backlinks } from "@/components/editor/backlinks"
import { useWorkspaceStore } from "@/stores/workspace"
import { SidebarToggle } from "@/components/app/sidebar-toggle"
import { PageActionsMenu } from "@/components/app/page-actions"
import { BlockEditor } from "@/components/editor/block-editor"
import { EmojiPicker } from "@/components/editor/emoji-picker"
import { CoverPicker } from "@/components/editor/cover-picker"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import type { CommentSelection } from "@/components/comments/comment-composer"

const ShareDialog = lazy(() =>
  import("@/components/app/share-dialog").then((module) => ({ default: module.ShareDialog })),
)
const HistoryDialog = lazy(() =>
  import("@/components/editor/history-dialog").then((module) => ({ default: module.HistoryDialog })),
)
const CommentsPanel = lazy(() =>
  import("@/components/comments/comments-panel").then((module) => ({ default: module.CommentsPanel })),
)
const AIPanel = lazy(() =>
  import("@/components/ai/ai-panel").then((module) => ({ default: module.AIPanel })),
)
const CommentComposer = lazy(() =>
  import("@/components/comments/comment-composer").then((module) => ({
    default: module.CommentComposer,
  })),
)

type SaveState = "saved" | "saving" | "error"

interface Snapshot {
  pageId: string
  title: string
  icon: string
  cover: string
  blocks: Block[]
}

function signature(snapshot: Pick<Snapshot, "title" | "icon" | "cover" | "blocks">) {
  return JSON.stringify({
    title: snapshot.title,
    icon: snapshot.icon,
    cover: snapshot.cover,
    blocks: snapshot.blocks,
  })
}

function emptyBlock(): Block {
  return { id: uid(), type: "paragraph", text: "", checked: false }
}

export function PageEditor() {
  const { pageId } = useParams<{ pageId: string }>()
  const navigate = useNavigate()
  const pages = useWorkspaceStore((state) => state.pages)
  const activeId = useWorkspaceStore((state) => state.activeId)
  const setActive = useWorkspaceStore((state) => state.setActive)
  const patchSummary = useWorkspaceStore((state) => state.patchSummary)
  const refreshPages = useWorkspaceStore((state) => state.refreshPages)
  const toggleFavorite = useWorkspaceStore((state) => state.toggleFavorite)

  const [page, setPage] = useState<Page | null>(null)
  const [blocks, setBlocks] = useState<Block[]>([emptyBlock()])
  const [members, setMembers] = useState<Member[]>([])
  const [title, setTitle] = useState("")
  const [icon, setIcon] = useState("")
  const [cover, setCover] = useState("")
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [saveState, setSaveState] = useState<SaveState>("saved")
  const [collaborators, setCollaborators] = useState<RealtimePresence[]>([])
  const [liveStatus, setLiveStatus] = useState<"connecting" | "connected" | "disconnected">("connecting")
  const [online, setOnline] = useState(() => navigator.onLine)
  const [shareOpen, setShareOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [aiOpen, setAiOpen] = useState(false)
  const [composerOpen, setComposerOpen] = useState(false)
  const [comments, setComments] = useState<Comment[]>([])
  const [commentsLoading, setCommentsLoading] = useState(false)
  const [commentVersion, setCommentVersion] = useState(0)
  const [selection, setSelection] = useState<(CommentSelection & { x: number; y: number }) | null>(null)

  const titleRef = useRef<HTMLTextAreaElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const stateRef = useRef<Snapshot>({ pageId: "", title: "", icon: "", cover: "", blocks: [] })
  const lastSavedRef = useRef("")
  const dirtyRef = useRef(false)
  const savingRef = useRef(false)
  const resumeRef = useRef(false)
  const timerRef = useRef<number | null>(null)
  const loadIdRef = useRef<string | undefined>(pageId)
  const clientIdRef = useRef(getClientId())
  const baseBlocksRef = useRef<Block[]>([])
  const blocksRevRef = useRef(0)
  const pendingRemoteRef = useRef<Block[] | null>(null)
  const pendingOpsRef = useRef<
    { order: string[]; upserts: Block[]; deletes: string[]; blocksRev: number }[]
  >([])
  const realtimeRef = useRef<RealtimeClient | null>(null)
  const lastFocusRef = useRef("")
  const openedBeforeRef = useRef(false)

  const summary = pages.find((item) => item.id === pageId)
  const favorite = summary?.favorite ?? page?.favorite ?? false
  const pageLocked = Boolean(page?.locked)
  const readOnly = page?.role === "viewer" || pageLocked

  useEffect(() => {
    stateRef.current = { pageId: page?.id ?? "", title, icon, cover, blocks }
  }, [page?.id, title, icon, cover, blocks])

  // Auto-grow title.
  useEffect(() => {
    const el = titleRef.current
    if (!el) return
    el.style.height = "auto"
    el.style.height = `${el.scrollHeight}px`
  }, [title, loading])

  useEffect(() => {
    if (!pageId || !page) return
    document.title = `${title.trim() || tr("Untitled")} · Motion`
    return () => {
      document.title = "Motion"
    }
  }, [title, page, pageId])

  function sameBlocks(a: Block[], b: Block[]) {
    return JSON.stringify(a) === JSON.stringify(b)
  }

  function applyRemoteBlocks(next: Block[], rev?: number) {
    if (stateRef.current.pageId !== pageId) return
    if (rev) blocksRevRef.current = rev
    if (sameBlocks(stateRef.current.blocks, next)) {
      baseBlocksRef.current = next
      lastSavedRef.current = signature({
        title: stateRef.current.title,
        icon: stateRef.current.icon,
        cover: stateRef.current.cover,
        blocks: next,
      })
      return
    }
    const active = document.activeElement as HTMLElement | null
    const editable = active?.closest("[data-block-input]") as HTMLElement | null
    let focusId = ""
    let focusOffset = 0
    if (editable?.id.startsWith("block-input-")) {
      focusId = editable.id.slice("block-input-".length)
      focusOffset =
        editable instanceof HTMLTextAreaElement ? editable.selectionStart : caretOffset(editable)
    }

    setBlocks(next)
    baseBlocksRef.current = next
    lastSavedRef.current = signature({
      title: stateRef.current.title,
      icon: stateRef.current.icon,
      cover: stateRef.current.cover,
      blocks: next,
    })
    dirtyRef.current = false
    pendingRemoteRef.current = null
    setSaveState("saved")

    if (focusId) {
      requestAnimationFrame(() => {
        const el = document.getElementById(`block-input-${focusId}`) as HTMLElement | null
        if (!el) return
        if (el.hasAttribute("data-lexical-input")) {
          focusBlockById(focusId, "end", focusOffset)
          return
        }
        el.focus()
        if (el instanceof HTMLTextAreaElement) {
          const offset = Math.min(focusOffset, el.value.length)
          el.setSelectionRange(offset, offset)
        } else {
          setCaret(el, focusOffset)
        }
      })
    }
  }

  // Load page.
  useEffect(() => {
    if (!pageId) return
    let alive = true
    loadIdRef.current = pageId
    setLoading(true)
    setError(null)
    setPage(null)

    api.pages
      .get(pageId)
      .then(async (loaded) => {
        if (!alive) return
        if (loaded.workspaceId !== useWorkspaceStore.getState().activeId) {
          await setActive(loaded.workspaceId)
        }
        if (!alive) return
        const initialBlocks = loaded.blocks?.length ? loaded.blocks : [emptyBlock()]
        setPage(loaded)
        setBlocks(initialBlocks)
        baseBlocksRef.current = initialBlocks
        blocksRevRef.current = loaded.blocksRev ?? 0
        setTitle(loaded.title)
        setIcon(loaded.icon)
        setCover(loaded.cover)
        lastSavedRef.current = signature({
          title: loaded.title,
          icon: loaded.icon,
          cover: loaded.cover,
          blocks: initialBlocks,
        })
        dirtyRef.current = false
        setSaveState("saved")
        patchSummary(loaded.id, {
          title: loaded.title,
          icon: loaded.icon,
          cover: loaded.cover,
          favorite: loaded.favorite,
        })
        setLoading(false)
      })
      .catch((err) => {
        if (!alive) return
        setError(err instanceof Error ? err.message : "Could not load this page")
        setLoading(false)
      })

    return () => {
      alive = false
      if (timerRef.current) {
        window.clearTimeout(timerRef.current)
        timerRef.current = null
      }
      if (dirtyRef.current) {
        const snapshot = stateRef.current
        dirtyRef.current = false
        void persist(snapshot, true)
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId])

  // Keep in sync with renames or metadata changes made elsewhere (sidebar, menus).
  useEffect(() => {
    function onMeta(event: Event) {
      const detail = (event as CustomEvent<{ id: string; patch: Partial<Page> }>).detail
      if (!detail || detail.id !== pageId) return
      const { patch } = detail
      if (patch.title !== undefined) {
        const editingTitle = document.activeElement?.getAttribute("data-editor-title") === "true"
        if (!editingTitle) setTitle(patch.title)
      }
      if (patch.icon !== undefined) setIcon(patch.icon)
      if (patch.cover !== undefined) setCover(patch.cover)
    }
    window.addEventListener("motion:page-meta", onMeta)
    return () => window.removeEventListener("motion:page-meta", onMeta)
  }, [pageId])

  // Paint persistent highlights for commented ranges using the CSS Custom
  // Highlight API. This keeps the anchor visible after the selection loses
  // focus, without mutating the editable DOM.
  useEffect(() => {
    const registry = (CSS as unknown as {
      highlights?: { set: (name: string, value: unknown) => void; delete: (name: string) => void }
    })?.highlights
    const HighlightCtor = (globalThis as unknown as {
      Highlight?: new (...ranges: Range[]) => unknown
    }).Highlight
    if (!registry || !HighlightCtor) return
    const ranges: Range[] = []
    for (const comment of comments) {
      if (comment.parentId || !comment.quote) continue
      const el = document.getElementById(`block-input-${comment.blockId}`)
      if (!el || el instanceof HTMLTextAreaElement || !el.isContentEditable) continue
      const text = el.textContent ?? ""
      let start = comment.startOffset
      let end = comment.endOffset
      if (start < 0 || end > text.length || text.slice(start, end) !== comment.quote) {
        const found = text.indexOf(comment.quote)
        if (found === -1) continue
        start = found
        end = found + comment.quote.length
      }
      const range = rangeFromOffsets(el, start, end)
      if (range) ranges.push(range)
    }
    if (ranges.length > 0) {
      registry.set("motion-comment", new HighlightCtor(...ranges))
    } else {
      registry.delete("motion-comment")
    }
    return () => registry.delete("motion-comment")
  }, [comments, blocks])

  useEffect(() => {
    if (!pageId || !page) return
    let alive = true
    setCommentsLoading(true)
    api.pages
      .comments(pageId)
      .then((items) => {
        if (alive) setComments(items)
      })
      .catch(() => undefined)
      .finally(() => {
        if (alive) setCommentsLoading(false)
      })
    return () => {
      alive = false
    }
  }, [pageId, page?.id, commentVersion])

  useEffect(() => {
    if (!page || loading || composerOpen || readOnly) return
    function readSelection() {
      const native = window.getSelection()
      if (!native || native.isCollapsed || native.rangeCount === 0) {
        setSelection(null)
        return
      }
      const quote = native.toString().trim()
      if (!quote || quote.length > 500) {
        setSelection(null)
        return
      }
      const range = native.getRangeAt(0)
      const startNode = range.startContainer
      const endNode = range.endContainer
      const startElement = (startNode.nodeType === Node.ELEMENT_NODE
        ? startNode
        : startNode.parentElement) as HTMLElement | null
      const endElement = (endNode.nodeType === Node.ELEMENT_NODE
        ? endNode
        : endNode.parentElement) as HTMLElement | null
      const startBlock = startElement?.closest("[data-block-input]") as HTMLElement | null
      const endBlock = endElement?.closest("[data-block-input]") as HTMLElement | null
      if (!startBlock || startBlock !== endBlock || startBlock instanceof HTMLTextAreaElement) {
        setSelection(null)
        return
      }
      if (!startBlock.id.startsWith("block-input-")) {
        setSelection(null)
        return
      }
      const before = range.cloneRange()
      before.selectNodeContents(startBlock)
      before.setEnd(range.startContainer, range.startOffset)
      const startOffset = before.toString().length
      const endOffset = startOffset + range.toString().length
      const rect = range.getBoundingClientRect()
      setSelection({
        blockId: startBlock.id.slice("block-input-".length),
        quote,
        startOffset,
        endOffset,
        x: rect.left + rect.width / 2,
        y: rect.bottom,
      })
    }
    function clearOnScroll() {
      setSelection(null)
    }
    document.addEventListener("mouseup", readSelection)
    document.addEventListener("keyup", readSelection)
    window.addEventListener("scroll", clearOnScroll, true)
    return () => {
      document.removeEventListener("mouseup", readSelection)
      document.removeEventListener("keyup", readSelection)
      window.removeEventListener("scroll", clearOnScroll, true)
    }
  }, [page?.id, loading, composerOpen])

  // Live collaboration: presence, remote edits and remote metadata.
  useEffect(() => {
    if (!pageId || !page || page.id !== pageId) return
    const client = new RealtimeClient(pageId, {
      onStatus: setLiveStatus,
      onOpen: () => {
        if (!openedBeforeRef.current) {
          openedBeforeRef.current = true
          return
        }
        void api.pages
          .get(pageId)
          .then((fresh) => {
            if (stateRef.current.pageId !== pageId) return
            useWorkspaceStore.getState().patchSummary(fresh.id, {
              title: fresh.title,
              icon: fresh.icon,
              cover: fresh.cover,
              favorite: fresh.favorite,
            })
            blocksRevRef.current = fresh.blocksRev ?? blocksRevRef.current
            if (dirtyRef.current || savingRef.current) {
              pendingRemoteRef.current = fresh.blocks
              baseBlocksRef.current = fresh.blocks
              return
            }
            baseBlocksRef.current = fresh.blocks
            applyRemoteBlocks(fresh.blocks, fresh.blocksRev)
            if (document.activeElement?.getAttribute("data-editor-title") !== "true") {
              setTitle(fresh.title)
            }
            setIcon(fresh.icon)
            setCover(fresh.cover)
            setPage(fresh)
          })
          .catch(() => undefined)
      },
      onEvent: (event) => {
        if (event.type === "presence") {
          setCollaborators((event.users as RealtimePresence[]) ?? [])
          return
        }
        if (event.clientId === clientIdRef.current) return
        if (event.type === "ops") {
          const rev = Number(event.blocksRev ?? 0)
          const op = {
            order: (event.order as string[]) ?? [],
            upserts: (event.upserts as Block[]) ?? [],
            deletes: (event.deletes as string[]) ?? [],
            blocksRev: rev,
          }
          if (dirtyRef.current || savingRef.current) {
            pendingOpsRef.current.push(op)
            return
          }
          if (rev && blocksRevRef.current && rev !== blocksRevRef.current + 1) {
            void refreshFromServer()
            return
          }
          const next = applyBlockSync(
            stateRef.current.blocks,
            op.order,
            op.upserts,
            op.deletes,
          )
          applyRemoteBlocks(next, rev || blocksRevRef.current + 1)
          return
        }
        if (event.type === "blocks") {
          const remote = (event.blocks as Block[]) ?? []
          const rev = Number(event.blocksRev ?? 0)
          baseBlocksRef.current = remote
          if (rev) blocksRevRef.current = rev
          if (dirtyRef.current || savingRef.current) {
            pendingRemoteRef.current = remote
          } else {
            applyRemoteBlocks(remote, rev)
          }
          return
        }
        if (event.type === "meta") {
          const patch = (event.page ?? {}) as Partial<Page>
          if (patch.archived) {
            toast(tr("This page was moved to Trash"))
            navigate("/")
            return
          }
          if (patch.locked !== undefined) {
            setPage((current) => current ? { ...current, locked: patch.locked, lockedByName: (patch as { lockedByName?: string }).lockedByName ?? current.lockedByName } : current)
            if (patch.locked) dirtyRef.current = false
          }
          if (patch.title !== undefined && document.activeElement?.getAttribute("data-editor-title") !== "true") {
            setTitle(patch.title)
          }
          if (patch.icon !== undefined) setIcon(patch.icon)
          if (patch.cover !== undefined) setCover(patch.cover)
          if (patch.favorite !== undefined) {
            setPage((current) => (current ? { ...current, favorite: patch.favorite! } : current))
          }
          useWorkspaceStore.getState().patchSummary(pageId, {
            ...(patch.title !== undefined ? { title: patch.title } : {}),
            ...(patch.icon !== undefined ? { icon: patch.icon } : {}),
            ...(patch.cover !== undefined ? { cover: patch.cover } : {}),
            ...(patch.favorite !== undefined ? { favorite: patch.favorite } : {}),
          })
          if (!dirtyRef.current) {
            lastSavedRef.current = signature({
              title: patch.title ?? stateRef.current.title,
              icon: patch.icon ?? stateRef.current.icon,
              cover: patch.cover ?? stateRef.current.cover,
              blocks: baseBlocksRef.current,
            })
          }
          return
        }
        if (event.type === "deleted") {
          toast(tr("This page was permanently deleted"))
          navigate("/")
          return
        }
        if (event.type === "comments") {
          setCommentVersion((value) => value + 1)
          return
        }
        if (event.type === "tree") {
          if (event.workspaceId === useWorkspaceStore.getState().activeId) {
            void refreshPages()
          }
        }
      },
    })
    client.connect()
    realtimeRef.current = client
    return () => {
      client.close()
      realtimeRef.current = null
      setCollaborators([])
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pageId, page?.id])

  useEffect(() => {
    function onOnline() {
      setOnline(true)
      if (dirtyRef.current) void saveNow()
    }
    function onOffline() {
      setOnline(false)
    }
    window.addEventListener("online", onOnline)
    window.addEventListener("offline", onOffline)
    return () => {
      window.removeEventListener("online", onOnline)
      window.removeEventListener("offline", onOffline)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      if (!dirtyRef.current) return
      event.preventDefault()
      event.returnValue = ""
    }
    window.addEventListener("beforeunload", onBeforeUnload)
    return () => window.removeEventListener("beforeunload", onBeforeUnload)
  }, [])

  async function refreshFromServer() {
    if (!pageId) return
    try {
      const fresh = await api.pages.get(pageId)
      blocksRevRef.current = fresh.blocksRev ?? 0
      baseBlocksRef.current = fresh.blocks
      if (dirtyRef.current || savingRef.current) {
        pendingRemoteRef.current = fresh.blocks
        return
      }
      applyRemoteBlocks(fresh.blocks, fresh.blocksRev)
    } catch {
      // The next autosave or reconnect will retry.
    }
  }

  function drainPendingOps(blocks: Block[], rev: number) {
    let next = blocks
    for (const op of pendingOpsRef.current) next = applyBlockSync(next, op.order, op.upserts, op.deletes)
    pendingOpsRef.current = []
    return { blocks: next, rev: Math.max(rev, blocksRevRef.current) }
  }

  async function persist(snapshot: Snapshot, silent = false) {
    if (!snapshot.pageId) return
    if (savingRef.current) {
      resumeRef.current = true
      return
    }
    const sig = signature(snapshot)
    if (sig === lastSavedRef.current) {
      dirtyRef.current = false
      if (!silent) setSaveState("saved")
      return
    }
    savingRef.current = true
    dirtyRef.current = false
    if (!silent) setSaveState("saving")
    try {
      let merged = snapshot.blocks
      let rev = blocksRevRef.current
      try {
        const [, saved] = await Promise.all([
          api.pages.update(snapshot.pageId, {
            title: snapshot.title,
            icon: snapshot.icon,
            cover: snapshot.cover,
          }),
          api.pages.applyOps(snapshot.pageId, {
            baseRev: blocksRevRef.current,
            ...diffBlocks(baseBlocksRef.current, snapshot.blocks),
          }),
        ])
        rev = saved.blocksRev
        merged = applyBlockSync(snapshot.blocks, saved.order, saved.upserts, saved.deletes)
        const known = new Set([...snapshot.blocks.map((block) => block.id), ...saved.upserts.map((block) => block.id)])
        if (saved.order.some((id) => !known.has(id))) {
          const fresh = await api.pages.get(snapshot.pageId)
          merged = fresh.blocks
          rev = fresh.blocksRev ?? rev
        }
      } catch (error) {
        if (!(error instanceof ApiError) || error.status !== 409) throw error
        // A collaborator saved first. Fall back to the three-way merge endpoint.
        const saved = await api.pages.saveBlocks(
          snapshot.pageId,
          snapshot.blocks,
          baseBlocksRef.current,
        )
        merged = saved.blocks
        rev = saved.blocksRev ?? rev
      }
      if (stateRef.current.pageId === snapshot.pageId) {
        const drained = drainPendingOps(merged, rev)
        merged = drained.blocks
        rev = drained.rev
        blocksRevRef.current = rev
        baseBlocksRef.current = merged
        lastSavedRef.current = signature({
          title: snapshot.title,
          icon: snapshot.icon,
          cover: snapshot.cover,
          blocks: merged,
        })
        if (dirtyRef.current) {
          pendingRemoteRef.current = merged
        } else if (!silent) {
          applyRemoteBlocks(merged, rev)
        }
        if (!silent) setSaveState(dirtyRef.current ? "saving" : "saved")
      }
      useWorkspaceStore.getState().patchSummary(snapshot.pageId, {
        title: snapshot.title,
        icon: snapshot.icon,
        cover: snapshot.cover,
      })
    } catch (err) {
      dirtyRef.current = true
      if (!silent && stateRef.current.pageId === snapshot.pageId) {
        setSaveState("error")
      }
    } finally {
      savingRef.current = false
      if (resumeRef.current) {
        resumeRef.current = false
        const latest = stateRef.current
        if (latest.pageId === snapshot.pageId && dirtyRef.current) {
          void persist(latest)
        }
      }
    }
  }

  async function saveNow() {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current)
      timerRef.current = null
    }
    if (!dirtyRef.current) {
      if (stateRef.current.pageId === pageId) setSaveState("saved")
      return
    }
    await persist(stateRef.current)
  }

  useEffect(() => {
    if (!page) return
    let alive = true
    api.workspaces.members(page.workspaceId)
      .then((value) => { if (alive) setMembers(value) })
      .catch(() => { if (alive) setMembers([]) })
    return () => { alive = false }
  }, [page?.workspaceId])

  useEffect(() => {
    function onPageLock(event: Event) {
      const detail = (event as CustomEvent<{ id: string; locked: boolean; lockedByName?: string }>).detail
      if (!detail || detail.id !== pageId) return
      setPage((current) => current ? { ...current, locked: detail.locked, lockedByName: detail.lockedByName ?? "" } : current)
      if (detail.locked) {
        dirtyRef.current = false
        toast(tr("This page is locked. Editing is paused."))
      }
    }
    window.addEventListener("motion:page-lock", onPageLock)
    return () => window.removeEventListener("motion:page-lock", onPageLock)
  }, [pageId])

  async function unlockPage() {
    if (!page) return
    try {
      await api.pages.unlock(page.id)
      setPage(await api.pages.get(page.id))
      toast.success(tr("Page unlocked"))
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Could not unlock page"))
    }
  }

  async function uploadAttachments(files: FileList | File[]) {
    if (readOnly || !page) return
    const list = Array.from(files).filter((file) => file.size > 0).slice(0, 10)
    if (list.length === 0) return
    const created: Block[] = []
    for (const file of list) {
      try {
        const uploaded = await api.files.upload(file, page.workspaceId)
        if (uploaded.contentType.startsWith("image/")) {
          created.push({ id: uid(), type: "image", text: "", url: uploaded.url, caption: uploaded.name })
        } else {
          created.push({
            id: uid(),
            type: "file",
            text: uploaded.name,
            url: uploaded.url,
            caption: `${Math.max(1, Math.round(uploaded.size / 1024))} KB`,
          })
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : tr("Could not upload file"))
      }
    }
    if (created.length === 0) return
    setBlocks((previous) => [...previous, ...created])
    scheduleSave()
    toast.success(tr("{n} attachment(s) uploaded", { n: created.length }))
  }

  useEffect(() => {
    function onPaste(event: ClipboardEvent) {
      if (readOnly) return
      const target = event.target as HTMLElement | null
      if (target?.closest("textarea, input") && !target.closest("[data-lexical-input]")) return
      const files = Array.from(event.clipboardData?.files ?? []).filter((file) => file.type.startsWith("image/"))
      if (files.length === 0) return
      event.preventDefault()
      void uploadAttachments(files)
    }
    document.addEventListener("paste", onPaste)
    return () => document.removeEventListener("paste", onPaste)
    // uploadAttachments intentionally follows the current page state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readOnly, page?.id])

  function scheduleSave() {
    if (readOnly) return
    dirtyRef.current = true
    if (page) setSaveState("saving")
    if (timerRef.current) window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null
      void saveNow()
    }, 600)
  }

  function onTitleChange(value: string) {
    if (readOnly) return
    const singleLine = value.replace(/\n/g, " ")
    setTitle(singleLine)
    scheduleSave()
  }

  function onIconChange(value: string) {
    setIcon(value)
    if (page) patchSummary(page.id, { icon: value })
    scheduleSave()
  }

  function onCoverChange(value: string) {
    setCover(value)
    if (page) patchSummary(page.id, { cover: value })
    scheduleSave()
  }

  async function onToggleFavorite() {
    if (!page) return
    try {
      const next = await toggleFavorite(page.id)
      toast.success(next ? "Added to Favorites" : "Removed from Favorites")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not update Favorites")
    }
  }

  async function restorePage() {
    if (!page) return
    try {
      await api.pages.update(page.id, { archived: false })
      setPage({ ...page, archived: false })
      await refreshPages()
      toast.success("Page restored")
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not restore page")
    }
  }

  const collaboratorsForDisplay = collaborators.filter(
    (person) => person.clientId !== clientIdRef.current,
  )
  const remoteFocus: Record<string, RealtimePresence[]> = {}
  for (const person of collaboratorsForDisplay) {
    if (!person.blockId) continue
    ;(remoteFocus[person.blockId] ??= []).push(person)
  }

  function openBlockComment(blockId: string) {
    setSelection({ blockId, quote: "", startOffset: 0, endOffset: 0, x: 0, y: 0 })
    setComposerOpen(true)
  }

  function applyRestoredPage(restored: Page) {
    setPage(restored)
    setTitle(restored.title)
    setIcon(restored.icon)
    setCover(restored.cover)
    setBlocks(restored.blocks)
    baseBlocksRef.current = restored.blocks
    blocksRevRef.current = restored.blocksRev ?? blocksRevRef.current + 1
    dirtyRef.current = false
    lastSavedRef.current = signature({
      title: restored.title,
      icon: restored.icon,
      cover: restored.cover,
      blocks: restored.blocks,
    })
    setSaveState("saved")
    useWorkspaceStore.getState().patchSummary(restored.id, {
      title: restored.title,
      icon: restored.icon,
      cover: restored.cover,
    })
  }

  async function undoAIRevision(revisionId: string) {
    if (!page) return
    const restored = await api.pages.restoreRevision(page.id, revisionId)
    applyRestoredPage(restored)
  }

  function addParagraph() {
    if (readOnly) return
    const last = blocks[blocks.length - 1]
    if (last && last.type === "paragraph" && last.text === "") {
      focusBlockById(last.id, "end")
      return
    }
    const block = emptyBlock()
    setBlocks([...blocks, block])
    scheduleSave()
    requestAnimationFrame(() => focusBlockById(block.id, "start"))
  }

  function announceFocus(blockId: string) {
    if (lastFocusRef.current === blockId) return
    lastFocusRef.current = blockId
    realtimeRef.current?.focus(blockId)
  }

  const commentCounts: Record<string, number> = {}
  const blockComments: Record<string, Comment[]> = {}
  let unresolvedComments = 0
  for (const comment of comments) {
    if (comment.parentId || comment.resolved) continue
    unresolvedComments += 1
    commentCounts[comment.blockId] = (commentCounts[comment.blockId] ?? 0) + 1
    ;(blockComments[comment.blockId] ??= []).push(comment)
  }

  if (!pageId) return null

  if (loading || (page && page.id !== pageId)) {
    return (
      <div className="flex h-full flex-col">
        <header className="flex h-11 shrink-0 items-center gap-1 border-b border-border/70 px-3">
          <SidebarToggle />
          <Skeleton className="ml-1 h-4 w-40" />
        </header>
        <div className="mx-auto w-full max-w-3xl px-6 pt-16 sm:px-10">
          <Skeleton className="size-14 rounded-xl" />
          <Skeleton className="mt-5 h-10 w-2/3" />
          <div className="mt-10 space-y-3">
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-11/12" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        </div>
      </div>
    )
  }

  if (error || !page) {
    return (
      <div className="flex h-full flex-col">
        <header className="flex h-11 shrink-0 items-center gap-1 border-b border-border/70 px-3">
          <SidebarToggle />
        </header>
        <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl bg-muted">
            <FileQuestion className="size-5 text-muted-foreground" />
          </div>
          <h1 className="text-lg font-semibold">{tr("We couldn’t open this page")}</h1>
          <p className="max-w-sm text-sm text-muted-foreground">
            {error ?? "It may have been deleted, or you may not have access."}
          </p>
          <div className="mt-2 flex gap-2">
            <Button variant="outline" onClick={() => navigate("/")}>{tr("Back home")}</Button>
            <Button onClick={() => window.location.reload()}>{tr("Try again")}</Button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col">
      <header className="flex h-11 shrink-0 items-center gap-1 border-b border-border/70 px-3">
        <SidebarToggle />
        <Breadcrumbs page={page} title={title} icon={icon} />
        {readOnly && (
          <span className="ml-1 rounded-full border border-border bg-muted/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
            {tr("View only")}
          </span>
        )}
        <div className="ml-auto flex shrink-0 items-center gap-0.5">
          {collaboratorsForDisplay.length > 0 && (
            <div className="mr-1 flex items-center -space-x-1.5">
              {collaboratorsForDisplay.slice(0, 5).map((person) => (
                <Tooltip key={person.clientId}>
                  <TooltipTrigger asChild>
                    <span
                      aria-label={`${person.name} is here`}
                      className="flex size-6 items-center justify-center rounded-full border-2 border-background text-[9px] font-semibold text-white shadow-sm"
                      style={{ backgroundColor: person.color }}
                    >
                      {initials(person.name)}
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{person.name} is here</TooltipContent>
                </Tooltip>
              ))}
              {collaboratorsForDisplay.length > 5 && (
                <span className="flex size-6 items-center justify-center rounded-full border-2 border-background bg-muted text-[9px] text-muted-foreground">
                  +{collaboratorsForDisplay.length - 5}
                </span>
              )}
            </div>
          )}
          <span
            className={cn(
              "hidden items-center gap-1.5 rounded-full border px-2 py-0.5 text-[10px] sm:flex",
              liveStatus === "connected"
                ? "border-emerald-500/20 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300"
                : "border-amber-500/20 bg-amber-500/10 text-amber-800 dark:text-amber-200",
            )}
            title={liveStatus === "connected" ? "Live collaboration connected" : "Reconnecting…"}
          >
            <span className={cn("size-1.5 rounded-full", liveStatus === "connected" ? "bg-emerald-500" : "bg-amber-500")} />
            {liveStatus === "connected" ? tr("Live") : tr("Reconnecting")}
          </span>
          {!readOnly && <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  setAiOpen((value) => !value)
                  setCommentsOpen(false)
                }}
                aria-label={tr("Ask Motion AI")}
                className={cn("text-muted-foreground", aiOpen && "bg-brand-soft text-brand")}
              >
                <Sparkles className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{tr("Ask Motion AI · BYOK")}</TooltipContent>
          </Tooltip>}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => {
                  setCommentsOpen((value) => !value)
                  setAiOpen(false)
                }}
                aria-label={tr("Comments")}
                className="relative text-muted-foreground"
              >
                <MessageSquare className="size-4" />
                {unresolvedComments > 0 && (
                  <span className="absolute -right-0.5 -top-0.5 flex min-w-3.5 items-center justify-center rounded-full bg-brand px-1 text-[9px] font-semibold leading-3.5 text-white">
                    {unresolvedComments}
                  </span>
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>{tr("Comments")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setHistoryOpen(true)}
                aria-label={tr("Version history")}
                className="text-muted-foreground"
              >
                <Clock3 className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{tr("Version history")}</TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setShareOpen(true)}
                aria-label={tr("Share")}
                className="text-muted-foreground"
              >
                <Users className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{tr("Share workspace")}</TooltipContent>
          </Tooltip>
          {!readOnly && <SaveIndicator state={saveState} onRetry={() => void saveNow()} />}
          {!readOnly && <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => void onToggleFavorite()}
                aria-label={favorite ? tr("Remove from Favorites") : tr("Add to Favorites")}
                className="text-muted-foreground"
              >
                <Star className={cn("size-4", favorite && "fill-amber-400 text-amber-400")} />
              </Button>
            </TooltipTrigger>
            <TooltipContent>{favorite ? tr("Remove from Favorites") : tr("Add to Favorites")}</TooltipContent>
          </Tooltip>}
          <PageActionsMenu
            readOnly={page.role === "viewer"}
            page={{ ...page, title, icon, cover, favorite, locked: page.locked, lockedByName: page.lockedByName }}
            align="end"
            trigger={
              <button
                type="button"
                aria-label={tr("Page options")}
                className="flex size-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-accent hover:text-foreground data-[state=open]:bg-accent"
              >
                <MoreHorizontal className="size-4" />
              </button>
            }
          />
        </div>
      </header>

      {(liveStatus === "disconnected" || !online) && (
        <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-1.5 text-[11px] text-amber-900 dark:text-amber-100">
          <AlertCircle className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {!online
              ? tr("You’re offline. Changes stay on this device until the connection returns.")
              : tr("Live connection lost. Reconnecting automatically…")}
          </span>
          <button
            type="button"
            onClick={() => realtimeRef.current?.retryNow()}
            className="shrink-0 rounded border border-amber-600/30 px-2 py-0.5 font-medium transition hover:bg-amber-500/10"
          >
            {tr("Retry now")}
          </button>
        </div>
      )}

      {pageLocked && (
        <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-1.5 text-[11px] text-amber-900 dark:text-amber-100">
          <LockKeyhole className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate">
            {tr("This page is locked{name}. Editing is paused to prevent accidents.", {
              name: page.lockedByName ? ` by ${page.lockedByName}` : "",
            })}
          </span>
          {page.role !== "viewer" && (
            <button type="button" onClick={() => void unlockPage()} className="shrink-0 rounded border border-amber-600/30 px-2 py-0.5 font-medium transition hover:bg-amber-500/10">
              {tr("Unlock")}
            </button>
          )}
        </div>
      )}

      {page.archived && (
        <div className="flex items-center gap-2 border-b border-amber-500/20 bg-amber-500/10 px-4 py-2 text-xs text-amber-900 dark:text-amber-100">
          {tr("This page is in Trash.")}
          <button
            type="button"
            onClick={() => void restorePage()}
            className="inline-flex items-center gap-1 font-medium underline underline-offset-2 hover:no-underline"
          >
            <RotateCcw className="size-3" /> {tr("Restore")}
          </button>
        </div>
      )}

      <div
        ref={scrollRef}
        onDragOver={(event) => { if (event.dataTransfer.types.includes("Files")) event.preventDefault() }}
        onDrop={(event) => {
          if (event.dataTransfer.files.length === 0) return
          event.preventDefault()
          void uploadAttachments(event.dataTransfer.files)
        }}
        className="min-h-0 flex-1 overflow-y-auto thin-scrollbar"
      >
        {cover && (
          <div
            className="group/cover relative h-40 w-full sm:h-52"
            style={coverStyle(cover)}
          >
            <div className="absolute inset-0 bg-gradient-to-b from-black/5 to-transparent" />
            {!readOnly && <div className="absolute right-3 top-3 flex items-center gap-1.5 opacity-0 transition-opacity group-hover/cover:opacity-100 focus-within:opacity-100">
              <CoverPicker value={cover} onSelect={onCoverChange}>
                <button
                  type="button"
                  className="rounded-md bg-background/85 px-2 py-1 text-[11px] font-medium text-foreground shadow-sm backdrop-blur transition hover:bg-background"
                >
                  Change cover
                </button>
              </CoverPicker>
              <button
                type="button"
                onClick={() => onCoverChange("")}
                className="rounded-md bg-background/85 px-2 py-1 text-[11px] font-medium text-muted-foreground shadow-sm backdrop-blur transition hover:bg-background hover:text-foreground"
              >
                Remove
              </button>
            </div>}
          </div>
        )}

        <div className={cn("mx-auto w-full max-w-3xl px-5 pb-28 sm:px-10", !cover && "pt-6")}>
          <div className={cn("relative z-10 flex items-center gap-2", cover ? "-mt-9 mb-1" : "mt-1")}>
            {readOnly ? (
              icon ? <span className="rounded-xl px-1 text-[58px] leading-none">{icon}</span> : null
            ) : <EmojiPicker value={icon} onSelect={onIconChange}>
              {icon ? (
                <button
                  type="button"
                  aria-label={tr("Add icon")}
                  className="rounded-xl px-1 text-[58px] leading-none transition hover:bg-accent/60"
                >
                  {icon}
                </button>
              ) : (
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
                >
                  <SmilePlus className="size-3.5" /> {tr("Add icon")}
                </button>
              )}
            </EmojiPicker>}
            {!cover && !readOnly && (
              <CoverPicker value={cover} onSelect={onCoverChange}>
                <button
                  type="button"
                  className="flex items-center gap-1.5 rounded-md px-2 py-1 text-xs text-muted-foreground transition hover:bg-accent hover:text-foreground"
                >
                  <ImagePlus className="size-3.5" /> {tr("Add cover")}
                </button>
              </CoverPicker>
            )}
          </div>

          <textarea
            ref={titleRef}
            data-editor-title="true"
            value={title}
            rows={1}
            readOnly={readOnly}
            placeholder={tr("Untitled")}
            spellCheck={false}
            onChange={(event) => onTitleChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey && !readOnly) {
                event.preventDefault()
                const first = blocks[0]
                if (first) {
                  requestAnimationFrame(() => focusBlockById(first.id, "start"))
                }
              }
            }}
            className="mt-2 block w-full resize-none overflow-hidden bg-transparent text-[40px] font-bold leading-[1.15] tracking-[-0.025em] outline-none placeholder:text-muted-foreground/35 sm:text-[44px]"
          />

          <div className="mt-5">
            <BlockEditor
              blocks={blocks}
              readOnly={readOnly}
              scrollParentRef={scrollRef}
              onChange={(next) => {
                if (readOnly) return
                setBlocks(next)
                scheduleSave()
              }}
              onFocusBlock={announceFocus}
              remoteFocus={remoteFocus}
              commentCounts={commentCounts}
              blockComments={blockComments}
              onOpenComments={() => setCommentsOpen(true)}
              onCommentBlock={openBlockComment}
              breadcrumb={ancestorChain(pages, page.id).map((item) => ({
                id: item.id,
                title: item.title,
                icon: item.icon,
              }))}
              workspaceId={page.workspaceId}
              members={members}
            />
          </div>
          <Backlinks pageId={page.id} />
        </div>
      </div>

      {selection && !composerOpen && !readOnly && (
        <button
          type="button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setComposerOpen(true)}
          className="fixed z-50 flex -translate-x-1/2 items-center gap-1.5 rounded-full border bg-popover px-3 py-1.5 text-xs font-medium text-popover-foreground shadow-xl transition hover:bg-accent animate-in fade-in-0 zoom-in-95"
          style={{ left: selection.x, top: Math.min(selection.y + 8, window.innerHeight - 48) }}
        >
          <MessageSquarePlus className="size-3.5 text-brand" />
          Comment
        </button>
      )}

      {!readOnly && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-border/70 bg-background/95 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 shadow-[0_-8px_24px_-18px_rgba(0,0,0,0.35)] backdrop-blur md:hidden">
          <div className="mx-auto flex max-w-md items-center justify-around">
            <MobileToolButton label={tr("Add block")} onClick={addParagraph}>
              <Plus className="size-5" />
            </MobileToolButton>
            <MobileToolButton
              label={tr("Insert block")}
              onClick={() => window.dispatchEvent(new CustomEvent("motion:open-insert"))}
            >
              <SquarePen className="size-5" />
            </MobileToolButton>
            <MobileToolButton
              label={tr("Comments")}
              onClick={() => {
                setCommentsOpen(true)
                setAiOpen(false)
              }}
            >
              <span className="relative">
                <MessageSquare className="size-5" />
                {unresolvedComments > 0 && (
                  <span className="absolute -right-2 -top-1.5 flex min-w-3.5 items-center justify-center rounded-full bg-brand px-1 text-[9px] font-semibold leading-3.5 text-white">
                    {unresolvedComments}
                  </span>
                )}
              </span>
            </MobileToolButton>
            <MobileToolButton
              label={tr("Ask Motion AI")}
              onClick={() => {
                setAiOpen(true)
                setCommentsOpen(false)
              }}
            >
              <Sparkles className="size-5" />
            </MobileToolButton>
          </div>
        </div>
      )}

      {aiOpen && (
        <Suspense fallback={null}>
          <AIPanel
            open
            onOpenChange={setAiOpen}
            pageId={page.id}
            workspaceId={page.workspaceId}
            pageTitle={title}
            onUndoRevision={undoAIRevision}
          />
        </Suspense>
      )}
      {commentsOpen && (
        <Suspense fallback={null}>
          <CommentsPanel
            open
            onOpenChange={setCommentsOpen}
            pageId={page.id}
            comments={comments}
            loading={commentsLoading}
            readOnly={readOnly}
            onReload={() => setCommentVersion((value) => value + 1)}
          />
        </Suspense>
      )}
      {composerOpen && (
        <Suspense fallback={null}>
          <CommentComposer
            open
            onOpenChange={(value) => {
              setComposerOpen(value)
              if (!value) {
                setSelection(null)
                window.getSelection()?.removeAllRanges()
              }
            }}
            pageId={page.id}
            selection={selection}
            onCreated={() => {
              setCommentVersion((value) => value + 1)
              setSelection(null)
              setCommentsOpen(true)
              window.getSelection()?.removeAllRanges()
            }}
          />
        </Suspense>
      )}

      {shareOpen && (
        <Suspense fallback={null}>
          <ShareDialog open onOpenChange={setShareOpen} page={page} />
        </Suspense>
      )}
      {historyOpen && (
        <Suspense fallback={null}>
          <HistoryDialog open onOpenChange={setHistoryOpen} page={page} onRestored={applyRestoredPage} />
        </Suspense>
      )}
    </div>
  )
}

function MobileToolButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="flex min-w-14 flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-muted-foreground transition active:bg-accent"
    >
      {children}
      <span className="text-[9px] font-medium">{label}</span>
    </button>
  )
}

function Breadcrumbs({ page, title, icon }: { page: Page; title: string; icon: string }) {
  const navigate = useNavigate()
  const pages = useWorkspaceStore((state) => state.pages)
  const chain = useMemo(() => {
    const fromStore = ancestorChain(pages, page.id)
    if (fromStore.length > 0) return fromStore
    return [{ ...page, title, icon }]
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
          <ChevronRight
            className={cn(
              "size-3 shrink-0 text-muted-foreground/40",
              index < chain.length - 2 ? "hidden md:block" : "hidden sm:block",
            )}
          />
        </Fragment>
      ))}
      <span className="flex min-w-0 items-center gap-1.5 rounded px-1.5 py-0.5 font-medium text-foreground">
        {icon ? (
          <span className="text-[13px] leading-none">{icon}</span>
        ) : (
          <FileText className="size-3.5 shrink-0 text-muted-foreground" />
        )}
        <span className="truncate">{pageTitle(title)}</span>
      </span>
    </nav>
  )
}

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  if (state === "error") {
    return (
      <button
        type="button"
        onClick={onRetry}
        className="flex items-center gap-1.5 rounded-md px-2 py-1 text-[11px] font-medium text-destructive transition hover:bg-destructive/10"
      >
        <AlertCircle className="size-3.5" />
        <span className="hidden sm:inline">{tr("Couldn’t save · Retry")}</span>
      </button>
    )
  }
  return (
    <div className="hidden items-center gap-1.5 px-2 text-[11px] text-muted-foreground sm:flex">
      {state === "saving" ? (
        <Loader2 className="size-3 animate-spin" />
      ) : (
        <Check className="size-3" />
      )}
      <span>{state === "saving" ? tr("Saving…") : tr("Saved")}</span>
    </div>
  )
}

function rangeFromOffsets(root: HTMLElement, start: number, end: number): Range | null {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT)
  let position = 0
  let startNode: Text | null = null
  let startOffset = 0
  let endNode: Text | null = null
  let endOffset = 0
  let node = walker.nextNode() as Text | null
  while (node) {
    const length = node.textContent?.length ?? 0
    if (!startNode && start >= position && start <= position + length) {
      startNode = node
      startOffset = start - position
    }
    if (!endNode && end >= position && end <= position + length) {
      endNode = node
      endOffset = end - position
      break
    }
    position += length
    node = walker.nextNode() as Text | null
  }
  if (!startNode || !endNode) return null
  const range = document.createRange()
  try {
    range.setStart(startNode, startOffset)
    range.setEnd(endNode, endOffset)
    return range
  } catch {
    return null
  }
}
