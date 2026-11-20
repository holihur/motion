// Catch browser SDK integration.
//
// Configuration is build-time only (Vite exposes VITE_* variables). The ingest
// key is write-only and safe to ship in the bundle; leave it empty to disable
// reporting entirely.
//
// Besides errors/logs the SDK also collects product telemetry without touching
// business code (see `data-auto-track`): SPA page views, clicks, form submits
// and element exposures. Named product events are declared in the markup with
// `data-catch-event="<name>"` / `data-catch-props='{"k":"v"}'`; anything that
// renders user content (documents, comments, AI replies, page titles) is kept
// out of the auto collector with `data-catch-ignore`.

interface CatchUser {
  id?: string
  email?: string
  username?: string
}

interface CatchSdk {
  setUser(user: CatchUser | null): void
  captureError(error: unknown, context?: Record<string, unknown>): void
  log(level: "debug" | "info" | "warn" | "error" | "fatal", message: string, context?: Record<string, unknown>): void
  track?(name: string, properties?: Record<string, unknown>): void
}

declare global {
  interface Window {
    Catch?: CatchSdk
  }
}

const env = (key: string) => ((import.meta.env[key] as string | undefined) ?? "").trim()

const baseURL = env("VITE_CATCH_URL").replace(/\/+$/, "")
const ingestKey = env("VITE_CATCH_INGEST_KEY")
const environment = env("VITE_CATCH_ENV") || "production"
const service = env("VITE_CATCH_SERVICE") || "motion-web"
const release = env("VITE_CATCH_RELEASE")
// Auto telemetry is opt-out: set VITE_CATCH_AUTO_TRACK=none to keep errors only.
const autoTrack = env("VITE_CATCH_AUTO_TRACK") || "pageview,click,submit,expose"
const sampleRate = env("VITE_CATCH_SAMPLE_RATE")
const trackSampleRate = env("VITE_CATCH_TRACK_SAMPLE_RATE")

const MAX_PENDING = 50

let ready = false
let pendingUser: CatchUser | null | undefined
const pendingErrors: Array<{ error: unknown; context?: Record<string, unknown> }> = []
const pendingTracks: Array<{ name: string; properties?: Record<string, unknown> }> = []

function flushPending() {
  if (!ready) return
  if (pendingUser !== undefined) {
    window.Catch?.setUser(pendingUser)
    pendingUser = undefined
  }
  for (const item of pendingErrors.splice(0)) {
    window.Catch?.captureError(item.error, item.context)
  }
  for (const item of pendingTracks.splice(0)) {
    window.Catch?.track?.(item.name, item.properties)
  }
}

export function initCatch() {
  if (typeof window === "undefined" || !baseURL || !ingestKey || window.Catch) return
  const script = document.createElement("script")
  script.src = `${baseURL}/catch-sdk.js`
  script.async = true
  script.crossOrigin = "anonymous"
  script.dataset.key = ingestKey
  script.dataset.endpoint = `${baseURL}/api/ingest`
  script.dataset.env = environment
  script.dataset.service = service
  script.dataset.autoTrack = autoTrack
  if (release) script.dataset.release = release
  if (sampleRate) script.dataset.sampleRate = sampleRate
  if (trackSampleRate) script.dataset.trackSampleRate = trackSampleRate
  script.addEventListener("load", () => {
    ready = true
    flushPending()
  })
  document.head.appendChild(script)
}

export function identifyCatchUser(user: { id?: string; email?: string; name?: string; username?: string } | null) {
  if (!user) {
    clearCatchUser()
    return
  }
  pendingUser = {
    id: user.id,
    email: user.email,
    username: user.username || user.name,
  }
  flushPending()
}

export function clearCatchUser() {
  pendingUser = null
  if (ready) window.Catch?.setUser(null)
}

export function captureCatchError(error: unknown, context?: Record<string, unknown>) {
  if (ready && window.Catch) {
    window.Catch.captureError(error, context)
    return
  }
  pendingErrors.push({ error, context })
  if (pendingErrors.length > 20) pendingErrors.shift()
}

export function catchLog(level: "debug" | "info" | "warn" | "error" | "fatal", message: string, context?: Record<string, unknown>) {
  if (ready) window.Catch?.log(level, message, context)
}

/**
 * Report a named product event. Prefer the declarative `data-catch-event`
 * attribute for plain clicks/submits; use this for events that only exist in
 * code (e.g. "AI run finished", "export completed").
 */
export function catchTrack(name: string, properties?: Record<string, unknown>) {
  if (typeof window === "undefined" || !baseURL || !ingestKey) return
  const enriched = { ...properties }
  if (enriched.route === undefined) enriched.route = window.location.pathname
  if (ready && window.Catch?.track) {
    window.Catch.track(name, enriched)
    return
  }
  pendingTracks.push({ name, properties: enriched })
  if (pendingTracks.length > MAX_PENDING) pendingTracks.shift()
}
