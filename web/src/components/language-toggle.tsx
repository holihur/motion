import { Check, Languages } from "lucide-react"
import { LANGUAGES, ensureLanguageLoaded, getLanguage, setLanguage, type Language } from "@/lib/i18n"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"

export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const language = getLanguage()
  const current = LANGUAGES.find((l) => l.code === language) ?? LANGUAGES[0]
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size={compact ? "icon-sm" : "sm"}
          className="gap-1.5 text-muted-foreground"
          aria-label="Switch language"
        >
          <Languages className="size-4" />
          {!compact && <span className="text-xs">{current.native}</span>}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-36">
        {LANGUAGES.map((lang) => (
          <DropdownMenuItem key={lang.code} onSelect={async () => { await ensureLanguageLoaded(lang.code as Language); setLanguage(lang.code as Language) }} className="gap-2">
            <span className="flex-1">{lang.native}</span>
            <span className="text-[11px] text-muted-foreground">{lang.label}</span>
            {language === lang.code && <Check className="size-3.5 text-brand" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
