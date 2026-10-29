import { useEffect, useRef } from "react"
import { useLocation, useNavigate } from "react-router-dom"
import { toast } from "sonner"
import { RealtimeClient } from "@/lib/realtime"
import { tr } from "@/lib/i18n"
import { useWorkspaceStore } from "@/stores/workspace"

/**
 * Workspace-level realtime channel (no page): proposal + tree events so the
 * Agent Inbox badge/lists and the page tree stay fresh without manual refresh.
 */
export function useWorkspaceRealtime(workspaceId: string | null) {
  const location = useLocation()
  const navigate = useNavigate()
  const pathRef = useRef(location.pathname)
  pathRef.current = location.pathname
  const navigateRef = useRef(navigate)
  navigateRef.current = navigate
  const treeTimer = useRef<number | null>(null)

  useEffect(() => {
    if (!workspaceId) return
    const client = new RealtimeClient(
      "",
      {
        onEvent: (event) => {
          if (event.workspaceId && event.workspaceId !== workspaceId) return
          if (event.type === "tree") {
            // Auto-mode agent runs change pages directly; refresh the tree (debounced).
            if (treeTimer.current) window.clearTimeout(treeTimer.current)
            treeTimer.current = window.setTimeout(() => {
              void useWorkspaceStore.getState().refreshPages(workspaceId).catch(() => undefined)
            }, 1500)
            return
          }
          if (event.type === "agent-run" && event.action === "failed") {
            toast.error(tr("Agent task failed"))
            return
          }
          if (event.type !== "proposals" && event.type !== "agent-run") return
          window.dispatchEvent(new CustomEvent("motion:proposals-changed"))
          if ((event.type === "proposals" && event.action === "created") ||
            (event.type === "agent-run" && event.action === "finished")) {
            if (!pathRef.current.startsWith("/inbox")) {
              toast.success(tr("AI changes are waiting for review"), {
                action: {
                  label: tr("Review"),
                  onClick: () => navigateRef.current("/inbox"),
                },
              })
            }
          }
        },
      },
      workspaceId,
    )
    client.connect()
    return () => {
      client.close()
      if (treeTimer.current) window.clearTimeout(treeTimer.current)
    }
  }, [workspaceId])
}
