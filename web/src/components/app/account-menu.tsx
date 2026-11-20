import { useNavigate } from "react-router-dom"
import { LogOut, Settings, ShieldCheck } from "lucide-react"
import { tr } from "@/lib/i18n"
import { useAuthStore } from "@/stores/auth"
import { useUIStore } from "@/stores/ui"
import {
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu"

/** Shared account menu for the sidebar footer and the compact page header. */
export function AccountMenu({ align = "end" }: { align?: "start" | "center" | "end" }) {
  const user = useAuthStore((state) => state.user)
  const logout = useAuthStore((state) => state.logout)
  const setSettingsOpen = useUIStore((state) => state.setSettingsOpen)
  const navigate = useNavigate()
  const opsUnlocked = typeof sessionStorage !== "undefined" && !!sessionStorage.getItem("motion.ops.token")
  return (
    <DropdownMenuContent align={align} className="w-56">
      <div className="px-2 py-1.5">
        <div className="text-sm font-medium">{user?.name}</div>
        <div className="truncate text-[11px] text-muted-foreground">{user?.email}</div>
      </div>
      <DropdownMenuSeparator />
      <DropdownMenuItem onSelect={() => setSettingsOpen(true)} data-catch-event="settings_open">
        <Settings /> {tr("Settings")}
      </DropdownMenuItem>
      {opsUnlocked && (
        <DropdownMenuItem onSelect={() => navigate("/ops")} data-catch-event="ops_open">
          <ShieldCheck /> {tr("Ops console")}
        </DropdownMenuItem>
      )}
      <DropdownMenuItem
        onSelect={() => {
          logout()
          navigate("/login", { replace: true })
        }}
        data-catch-event="sign_out"
      >
        <LogOut /> {tr("Sign out")}
      </DropdownMenuItem>
    </DropdownMenuContent>
  )
}
