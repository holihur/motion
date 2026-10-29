import { useCallback, useEffect, useRef, useState } from "react"
import { useNavigate } from "react-router-dom"
import { AtSign, Bell, Bot, CheckCheck, MessageSquareReply } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { tr } from "@/lib/i18n"
import { useAuthStore } from "@/stores/auth"
import type { Notification } from "@/lib/types"
import { formatRelative } from "@/lib/utils"

export function useNotifications() {
  const [items, setItems] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const [prefs, setPrefs] = useState({ mention: true, reply: true, agentDone: true, browser: false })
  const myId = useAuthStore((s) => s.user?.id)
  const prefsRef = useRef(prefs)
  prefsRef.current = prefs

  const load = useCallback(async () => {
    try {
      const [res, p] = await Promise.all([
        api.notifications.list(50),
        api.notifications.prefs().catch(() => null),
      ])
      setItems(res.items)
      setUnread(res.unread)
      if (p) setPrefs(p)
    } catch {
      // ignore — bell just stays empty
    }
  }, [])

  useEffect(() => {
    void load()
    function onChanged(event: Event) {
      const detail = (event as CustomEvent<{ userId?: string; kind?: string; title?: string }>).detail
      if (detail?.userId && myId && detail.userId !== myId) return
      void load()
      if (detail?.userId) {
        const title = detail.title || tr("You have a new notification")
        toast.success(title, {
          description: detail.kind === "mention" ? tr("Someone @ mentioned you") : undefined,
        })
        if (prefsRef.current.browser && typeof window !== "undefined" && "Notification" in window && Notification.permission === "granted") {
          try {
            new Notification(title, { body: detail.kind === "mention" ? tr("Someone @ mentioned you") : undefined })
          } catch {
            // ignore
          }
        }
      }
    }
    window.addEventListener("motion:notifications-changed", onChanged)
    return () => window.removeEventListener("motion:notifications-changed", onChanged)
  }, [load, myId])

  const markRead = useCallback(async (id: string) => {
    setItems((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)))
    setUnread((u) => Math.max(0, u - 1))
    try {
      await api.notifications.read(id)
    } catch {
      // revert on failure
      void load()
    }
  }, [load])

  const markAllRead = useCallback(async () => {
    setItems((prev) => prev.map((n) => ({ ...n, read: true })))
    setUnread(0)
    try {
      await api.notifications.readAll()
    } catch (e) {
      toast.error(e instanceof Error ? e.message : tr("Could not update"))
      void load()
    }
  }, [load])

  return { items, unread, load, markRead, markAllRead }
}

export function NotificationBell() {
  const { items, unread, markRead, markAllRead } = useNotifications()
  const [open, setOpen] = useState(false)
  const navigate = useNavigate()

  function openNotification(n: Notification) {
    if (!n.read) void markRead(n.id)
    setOpen(false)
    if (n.type.startsWith("agent_") && !n.pageId) {
      navigate("/inbox")
      return
    }
    if (n.pageId) {
      navigate(`/page/${n.pageId}`)
      if (n.blockId) {
        window.setTimeout(() => {
          window.dispatchEvent(new CustomEvent("motion:focus-block", { detail: { id: n.blockId } }))
        }, 600)
      }
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={tr("Notifications")}
        className="relative flex size-7 items-center justify-center rounded-md text-muted-foreground transition hover:bg-sidebar-accent hover:text-foreground"
      >
        <Bell className="size-3.5" />
        {unread > 0 && (
          <span className="absolute -right-0.5 -top-0.5 flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[9px] font-bold leading-4 text-white">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85svh] max-w-md overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Bell className="size-4 text-brand" /> {tr("Notifications")}
              {unread > 0 && (
                <Button variant="ghost" size="sm" className="ml-auto h-7 gap-1 text-[11px]" onClick={() => void markAllRead()}>
                  <CheckCheck className="size-3.5" /> {tr("Mark all read")}
                </Button>
              )}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-1.5">
            {items.length === 0 && (
              <div className="rounded-xl border border-dashed px-4 py-10 text-center text-xs text-muted-foreground">
                {tr("No notifications — @ someone to try it out.")}
              </div>
            )}
            {items.map((n) => (
              <button
                key={n.id}
                type="button"
                onClick={() => openNotification(n)}
                className={`flex w-full items-start gap-2.5 rounded-xl border px-3 py-2.5 text-left transition hover:border-brand/30 ${n.read ? "opacity-65" : "bg-brand-soft/20"}`}
              >
                <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted">
                  {n.type === "mention" ? <AtSign className="size-3.5 text-brand" /> : n.type === "comment_reply" ? <MessageSquareReply className="size-3.5 text-brand" /> : <Bot className="size-3.5 text-brand" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 text-xs font-medium">
                    {n.title}
                    {!n.read && <span className="size-1.5 shrink-0 rounded-full bg-brand" />}
                  </span>
                  {n.body && <span className="mt-0.5 line-clamp-2 block text-[11px] leading-4 text-muted-foreground">{n.body}</span>}
                  <span className="mt-0.5 block text-[10px] text-muted-foreground/70">{formatRelative(n.createdAt)}</span>
                </span>
              </button>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}

/* ---------------- 通知偏好（设置页用） ---------------- */

export function NotificationSettings() {
  const [prefs, setPrefs] = useState({ mention: true, reply: true, agentDone: true, browser: false })
  const [loaded, setLoaded] = useState(false)
  const [saving, setSaving] = useState(false)
  const [permission, setPermission] = useState(typeof Notification !== "undefined" ? Notification.permission : "denied")

  useEffect(() => {
    api.notifications
      .prefs()
      .then(setPrefs)
      .catch(() => undefined)
      .finally(() => setLoaded(true))
  }, [])

  async function toggle(key: "mention" | "reply" | "agentDone" | "browser", value: boolean) {
    if (key === "browser" && value && typeof Notification !== "undefined" && Notification.permission === "default") {
      try {
        setPermission(await Notification.requestPermission())
      } catch {
        // ignore
      }
    }
    const next = { ...prefs, [key]: value }
    setPrefs(next)
    setSaving(true)
    try {
      await api.notifications.savePrefs({ [key]: value })
      window.dispatchEvent(new CustomEvent("motion:notifications-changed"))
    } catch {
      // revert
      setPrefs(prefs)
    } finally {
      setSaving(false)
    }
  }

  const rows: { key: "mention" | "reply" | "agentDone" | "browser"; label: string; desc: string }[] = [
    { key: "mention", label: tr("Mentions"), desc: tr("When someone @ mentions you in pages or comments") },
    { key: "reply", label: tr("Replies"), desc: tr("When someone replies to your comment") },
    { key: "agentDone", label: tr("Agent tasks"), desc: tr("When your dispatched or scheduled agent task finishes") },
    { key: "browser", label: tr("Browser notification"), desc: permission === "denied" ? tr("Blocked by the browser — allow notifications in site settings") : tr("Also pop a system notification") },
  ]

  return (
    <div className="space-y-1 rounded-xl border p-2">
      <div className="px-2 pb-1 pt-1 text-xs font-semibold">{tr("Notifications")}</div>
      {!loaded ? (
        <div className="px-2 pb-2 text-xs text-muted-foreground">{tr("Loading…")}</div>
      ) : (
        rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-3 rounded-lg px-2 py-1.5">
            <div>
              <div className="text-xs font-medium">{r.label}</div>
              <div className="text-[11px] text-muted-foreground">{r.desc}</div>
            </div>
            <Switch checked={prefs[r.key]} onCheckedChange={(v) => void toggle(r.key, v)} disabled={saving} />
          </div>
        ))
      )}
    </div>
  )
}
