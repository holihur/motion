import { Moon, Sun } from "lucide-react"
import { useThemeStore } from "@/stores/theme"
import { tr } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"

export function ThemeToggle({ className }: { className?: string }) {
  const isDark = useThemeStore((state) => state.isDark)
  const toggle = useThemeStore((state) => state.toggle)
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggle}
          className={className}
          aria-label={tr("Toggle theme")}
        >
          {isDark ? <Sun className="size-4" /> : <Moon className="size-4" />}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{isDark ? tr("Light mode") : tr("Dark mode")}</TooltipContent>
    </Tooltip>
  )
}
