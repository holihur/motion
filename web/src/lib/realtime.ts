import { getClientId, getToken } from "@/lib/api"

export type RealtimeStatus = "connecting" | "connected" | "disconnected"

export interface RealtimeHandlers {
  onStatus?: (status: RealtimeStatus) => void
  onOpen?: () => void
  onEvent: (event: Record<string, unknown>) => void
}

export class RealtimeClient {
  private socket: WebSocket | null = null
  private retry = 0
  private timer: number | null = null
  private closed = false
  private pageId: string
  private handlers: RealtimeHandlers

  constructor(pageId: string, handlers: RealtimeHandlers) {
    this.pageId = pageId
    this.handlers = handlers
  }

  connect() {
    if (this.closed) return
    const token = getToken()
    if (!token) return
    this.handlers.onStatus?.("connecting")
    const protocol = window.location.protocol === "https:" ? "wss:" : "ws:"
    const socket = new WebSocket(`${protocol}//${window.location.host}/api/ws`)
    this.socket = socket

    socket.onopen = () => {
      this.retry = 0
      // Send credentials in the first frame instead of the URL so token
      // material cannot leak through proxy/access logs or browser history.
      socket.send(JSON.stringify({
        type: "auth",
        token,
        pageId: this.pageId,
        clientId: getClientId(),
      }))
      this.handlers.onStatus?.("connected")
      this.handlers.onOpen?.()
    }
    socket.onmessage = (message) => {
      try {
        const event = JSON.parse(message.data) as Record<string, unknown>
        this.handlers.onEvent(event)
      } catch {
        // Ignore malformed frames.
      }
    }
    socket.onclose = () => {
      if (this.socket === socket) this.socket = null
      this.handlers.onStatus?.("disconnected")
      if (this.closed) return
      const delay = Math.min(1000 * 2 ** this.retry, 15_000)
      this.retry += 1
      this.timer = window.setTimeout(() => this.connect(), delay)
    }
    socket.onerror = () => {
      socket.close()
    }
  }

  send(payload: Record<string, unknown>) {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(payload))
    }
  }

  focus(blockId: string | null) {
    this.send({ type: "focus", blockId: blockId ?? "" })
  }

  retryNow() {
    if (this.closed) return
    if (this.timer) window.clearTimeout(this.timer)
    this.retry = 0
    this.socket?.close()
    this.socket = null
    this.connect()
  }

  close() {
    this.closed = true
    if (this.timer) window.clearTimeout(this.timer)
    this.socket?.close()
    this.socket = null
  }
}

export type { RealtimePresence } from "@/lib/types"
