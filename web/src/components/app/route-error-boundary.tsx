import { Component, type ReactNode } from "react"
import { AlertTriangle, RefreshCw } from "lucide-react"
import { tr } from "@/lib/i18n"

export class RouteErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error) {
    // eslint-disable-next-line no-console
    console.error("route crash:", error)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="flex h-svh flex-col items-center justify-center gap-3 bg-background px-6 text-center">
        <span className="flex size-12 items-center justify-center rounded-2xl bg-destructive/10">
          <AlertTriangle className="size-5 text-destructive" />
        </span>
        <h1 className="text-base font-semibold">{tr("Something went wrong")}</h1>
        <p className="max-w-sm text-xs leading-5 text-muted-foreground">
          {this.state.error.message || tr("The page crashed — a refresh usually fixes it.")}
        </p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="flex items-center gap-1.5 rounded-lg bg-brand px-3.5 py-2 text-xs font-medium text-white"
          >
            <RefreshCw className="size-3.5" /> {tr("Reload page")}
          </button>
          <button
            type="button"
            onClick={() => {
              this.setState({ error: null })
              window.location.hash = "/"
              if (window.location.pathname !== "/") window.location.pathname = "/"
            }}
            className="rounded-lg border px-3.5 py-2 text-xs hover:bg-accent"
          >
            {tr("Go home")}
          </button>
        </div>
      </div>
    )
  }
}
