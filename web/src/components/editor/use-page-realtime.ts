import { useEffect, useRef, useState } from "react"
import { RealtimeClient, type RealtimePresence } from "@/lib/realtime"

export function usePageRealtime(pageId: string | undefined, enabled: boolean) {
  const [collaborators, setCollaborators] = useState<RealtimePresence[]>([])
  const [liveStatus, setLiveStatus] = useState<"connecting" | "connected" | "disconnected">("connecting")
  const clientRef = useRef<RealtimeClient | null>(null)

  useEffect(() => {
    if (!pageId || !enabled) return
    const client = new RealtimeClient(pageId, {
      onStatus: setLiveStatus,
      onEvent: (event) => {
        if (event.type === "presence") setCollaborators((event.users as RealtimePresence[]) ?? [])
      },
    })
    client.connect()
    clientRef.current = client
    return () => {
      client.close()
      clientRef.current = null
      setCollaborators([])
    }
  }, [pageId, enabled])

  return { collaborators, liveStatus, clientRef }
}
