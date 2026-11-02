import { LogoMark } from "@/components/logo"
import { tr } from "@/lib/i18n"

export function Splash() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-4 bg-background">
      <LogoMark className="size-12 animate-pulse" />
      <div className="text-sm text-muted-foreground">{tr("Opening your workspace…")}</div>
    </div>
  )
}
