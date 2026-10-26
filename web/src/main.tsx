import { createRoot } from "react-dom/client"
import { Toaster } from "sonner"
import App from "./App"
import { TooltipProvider } from "@/components/ui/tooltip"
import { useThemeStore } from "@/stores/theme"
import "./index.css"

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

createRoot(document.getElementById("root")!).render(<Root />)
