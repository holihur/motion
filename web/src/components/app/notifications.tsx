import { useCallback, useEffect, useState } from "react"
import { useNavigate } from "react-router-dom"
import { AtSign, Bell, CheckCheck, MessageSquareReply } from "lucide-react"
import { toast } from "sonner"
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { api } from "@/lib/api"
import { tr } from "@/lib/i18n"
import { useAuthStore } from "@/stores/auth"
import type { Notification } from "@/lib/types"
import { formatRelative } from "@/lib/utils"

export function useNotifications() {
  const [items, setItems] = useState<Notification[]>([])
  const [unread, setUnread] = useState(0)
  const myId = useAuthStore((s) => s.user?.id)

  const load = useCallback(async () => {
    try {
      const res = await api.notifications.list(50)
      setItems(res.items)
      setUnread(res.unread)
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
        toast.success(detail.title || tr("You have a new notification"), {
          description: detail.kind === "mention" ? tr("Someone @ mentioned you") : undefined,
        })
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
                  {n.type === "mention" ? <AtSign className="size-3.5 text-brand" /> : <MessageSquareReply className="size-3.5 text-brand" />}
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
