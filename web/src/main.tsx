import { createRoot } from "react-dom/client"
import { Toaster } from "sonner"
import App from "./App"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useThemeStore } from "@/stores/theme"
import { ensureLanguageLoaded, getLanguage } from "@/lib/i18n"
import { installClipboardFallback } from "@/lib/clipboard"
import "./index.css"

installClipboardFallback()

function Root() {
  const isDark = useThemeStore((state) => state.isDark)
  return (
    <TooltipProvider delayDuration={280} skipDelayDuration={120}>
      <App />
      <Toaster
        theme={isDark ? "dark" : "light"}
        position="bottom-right"
        closeButton
        offset={16}
        toastOptions={{
          classNames: {
            toast:
              "!rounded-xl !border-border !bg-popover !text-popover-foreground !shadow-xl !font-sans",
            description: "!text-muted-foreground",
            actionButton: "!bg-primary !text-primary-foreground",
          },
        }}
      />
    </TooltipProvider>
  )
}

// Load the active language dictionary before the first render so the UI never
// flashes English while the locale chunk is still in flight.
ensureLanguageLoaded(getLanguage()).finally(() => {
  createRoot(document.getElementById("root")!).render(<Root />)
})

// Offline app-shell cache (production only; API data is never cached).
if (import.meta.env.PROD && "serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => undefined)
  })
}
