import { Languages } from "lucide-react"
import { getLanguage, setLanguage } from "@/lib/i18n"
import { Button } from "@/components/ui/button"

export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const language = getLanguage()
  return (
    <Button
      type="button"
      variant="ghost"
      size={compact ? "icon-sm" : "sm"}
      onClick={() => setLanguage(language === "zh" ? "en" : "zh")}
      className="gap-1.5 text-muted-foreground"
      aria-label="Switch language"
    >
      <Languages className="size-4" />
      {!compact && <span className="text-xs">{language === "zh" ? "中文" : "EN"}</span>}
    </Button>
  )
}
