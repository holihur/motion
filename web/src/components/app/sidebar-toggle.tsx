import { PanelLeft } from "lucide-react"
import { useUIStore } from "@/stores/ui"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

export function SidebarToggle({ className }: { className?: string }) {
  const toggleCollapsed = useUIStore((state) => state.toggleSidebarCollapsed)
  const setSidebarOpen = useUIStore((state) => state.setSidebarOpen)

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Toggle sidebar"
          className={cn("text-muted-foreground", className)}
          onClick={() => {
            if (window.innerWidth < 768) setSidebarOpen(true)
            else toggleCollapsed()
          }}
        >
          <PanelLeft className="size-4" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>Toggle sidebar</TooltipContent>
    </Tooltip>
  )
}
