import { useEffect, useRef, useState } from "react"
import {
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  Loader2,
  Lock,
  LockKeyhole,
  Pencil,
  ShieldCheck,
  Unlock,
} from "lucide-react"
import { toast } from "sonner"
import type { Block } from "@/lib/types"
import { decryptSecret, encryptSecret } from "@/lib/crypto"
import { tr } from "@/lib/i18n"
import { cn } from "@/lib/utils"

const AUTO_LOCK_MS = 10 * 60 * 1000

export function PasswordBlock({
  block,
  readOnly,
  autoFocus,
  onUpdate,
  onFocus,
}: {
  block: Block
  readOnly: boolean
  autoFocus?: boolean
  onUpdate: (patch: Partial<Block>) => void
  onFocus?: () => void
}) {
  const labelRef = useRef<HTMLInputElement>(null)
  const hasSecret = Boolean(block.ciphertext && block.salt && block.iv)
  const [mode, setMode] = useState<"locked" | "editing" | "unlocked">(hasSecret ? "locked" : "editing")
  const [label, setLabel] = useState(block.text || "")
  const [hint, setHint] = useState(block.caption || "")
  const [password, setPassword] = useState("")
  const [secret, setSecret] = useState("")
  const [unlocked, setUnlocked] = useState("")
  const [revealed, setRevealed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (autoFocus) labelRef.current?.focus()
  }, [autoFocus])

  useEffect(() => {
    if (mode !== "unlocked") return
    const timer = window.setTimeout(() => {
      setUnlocked("")
      setRevealed(false)
      setMode("locked")
    }, AUTO_LOCK_MS)
    return () => window.clearTimeout(timer)
  }, [mode])

  function beginEditing() {
    setLabel(block.text || "")
    setHint(block.caption || "")
    setPassword("")
    setSecret("")
    setError("")
    setMode("editing")
  }

  async function save() {
    if (readOnly || busy) return
    const nextLabel = label.trim() || tr("Protected area")
    if (password.length < 8) {
      setError(tr("Use at least 8 characters for the password."))
      return
    }
    if (!secret) {
      setError(tr("Enter the content you want to protect."))
      return
    }
    setBusy(true)
    setError("")
    try {
      const encrypted = await encryptSecret(secret, password)
      onUpdate({
        text: nextLabel,
        caption: hint.trim(),
        ciphertext: encrypted.ciphertext,
        salt: encrypted.salt,
        iv: encrypted.iv,
      })
      setUnlocked(secret)
      setRevealed(false)
      setPassword("")
      setSecret("")
      setMode("unlocked")
      toast.success(tr("Protected area encrypted"))
    } catch (err) {
      setError(err instanceof Error ? err.message : tr("Could not encrypt this area"))
    } finally {
      setBusy(false)
    }
  }

  async function unlock() {
    if (busy) return
    if (!password) {
      setError(tr("Enter the password to unlock this area."))
      return
    }
    setBusy(true)
    setError("")
    try {
      const value = await decryptSecret(
        { ciphertext: block.ciphertext ?? "", salt: block.salt ?? "", iv: block.iv ?? "" },
        password,
      )
      setUnlocked(value)
      setPassword("")
      setRevealed(false)
      setMode("unlocked")
    } catch {
      setError(tr("That password did not unlock this area."))
    } finally {
      setBusy(false)
    }
  }

  function lockNow() {
    setUnlocked("")
    setRevealed(false)
    setPassword("")
    setMode("locked")
  }

  return (
    <div
      id={`block-input-${block.id}`}
      data-block-input
      tabIndex={0}
      onFocus={onFocus}
      className="my-2 overflow-hidden rounded-xl border border-border/80 bg-card outline-none focus-visible:ring-2 focus-visible:ring-brand/25"
    >
      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/25 px-3 py-2">
        {mode === "unlocked" ? (
          <ShieldCheck className="size-3.5 text-emerald-600 dark:text-emerald-400" />
        ) : (
          <LockKeyhole className="size-3.5 text-brand" />
        )}
        <span className="text-[11px] font-medium">
          {mode === "unlocked" ? tr("Unlocked area") : tr("Password-protected area")}
        </span>
        <span className="ml-auto flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {hasSecret && mode !== "editing" && <span>{tr("End-to-end encrypted")}</span>}
          {readOnly && <span className="rounded bg-muted px-1.5 py-0.5">{tr("View only")}</span>}
        </span>
      </div>

      {mode === "editing" ? (
        <div className="space-y-3 p-3.5">
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="space-y-1.5 text-[11px] font-medium">
              {tr("Area name")}
              <input
                ref={labelRef}
                value={label}
                readOnly={readOnly}
                onChange={(event) => setLabel(event.target.value)}
                placeholder={tr("e.g. Production credentials")}
                className="h-8 w-full rounded-md border bg-background px-2.5 text-xs font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
              />
            </label>
            <label className="space-y-1.5 text-[11px] font-medium">
              {tr("Hint (optional)")}
              <input
                value={hint}
                readOnly={readOnly}
                onChange={(event) => setHint(event.target.value)}
                placeholder={tr("A clue that is safe to show")}
                className="h-8 w-full rounded-md border bg-background px-2.5 text-xs font-normal outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
              />
            </label>
          </div>
          <label className="block space-y-1.5 text-[11px] font-medium">
            {tr("Protected content")}
            <textarea
              value={secret}
              readOnly={readOnly}
              onChange={(event) => setSecret(event.target.value)}
              rows={4}
              spellCheck={false}
              placeholder={tr("Passwords, keys, private notes…")}
              className="w-full resize-y rounded-md border bg-background px-2.5 py-2 font-mono text-xs leading-5 outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
            />
          </label>
          <label className="block space-y-1.5 text-[11px] font-medium">
            {hasSecret ? tr("New password") : tr("Password")}
            <input
              type="password"
              value={password}
              readOnly={readOnly}
              autoComplete="new-password"
              onChange={(event) => setPassword(event.target.value)}
              placeholder={tr("At least 8 characters")}
              className="h-8 w-full rounded-md border bg-background px-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
            />
          </label>
          <p className="text-[10px] leading-4 text-muted-foreground">
            {tr("Encryption happens in your browser. Motion stores only ciphertext and cannot recover this password.")}
          </p>
          {error && <p className="text-[11px] text-destructive">{error}</p>}
          <div className="flex flex-wrap justify-end gap-2">
            {hasSecret && (
              <button
                type="button"
                onClick={() => { setError(""); setMode("locked") }}
                className="rounded-md border px-2.5 py-1.5 text-[11px] transition hover:bg-accent"
              >
                {tr("Cancel")}
              </button>
            )}
            <button
              type="button"
              disabled={readOnly || busy}
              onClick={() => void save()}
              className="flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-3 animate-spin" /> : <Lock className="size-3" />}
              {hasSecret ? tr("Update protected area") : tr("Encrypt & lock")}
            </button>
          </div>
        </div>
      ) : mode === "locked" ? (
        <div className="space-y-3 p-3.5">
          <div>
            <div className="text-sm font-medium">{block.text || tr("Protected area")}</div>
            {block.caption && <div className="mt-0.5 text-[11px] text-muted-foreground">{block.caption}</div>}
          </div>
          <div className="flex flex-col gap-1.5 sm:flex-row">
            <div className="relative min-w-0 flex-1">
              <KeyRound className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <input
                type="password"
                value={password}
                autoComplete="off"
                onChange={(event) => setPassword(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    void unlock()
                  }
                }}
                placeholder={tr("Enter password to unlock")}
                className="h-8 w-full rounded-md border bg-background pl-8 pr-2.5 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/25"
              />
            </div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void unlock()}
              className="flex h-8 shrink-0 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-[11px] font-medium text-primary-foreground transition hover:bg-primary/90 disabled:opacity-60"
            >
              {busy ? <Loader2 className="size-3 animate-spin" /> : <Unlock className="size-3" />}
              {tr("Unlock")}
            </button>
          </div>
          {error && <p className="text-[11px] text-destructive">{error}</p>}
          {!hasSecret && <p className="text-[11px] text-muted-foreground">{tr("No password has been set for this area yet.")}</p>}
        </div>
      ) : (
        <div className="space-y-3 p-3.5">
          <div>
            <div className="text-sm font-medium">{block.text || tr("Protected area")}</div>
            {block.caption && <div className="mt-0.5 text-[11px] text-muted-foreground">{block.caption}</div>}
          </div>
          <div className="relative rounded-lg border border-emerald-500/25 bg-emerald-500/5 p-3">
            <pre className={cn("whitespace-pre-wrap break-words font-mono text-xs leading-5", !revealed && "blur-[5px] select-none")}>
              {unlocked}
            </pre>
            {!revealed && (
              <button
                type="button"
                onClick={() => setRevealed(true)}
                className="absolute inset-0 flex items-center justify-center gap-1.5 rounded-lg text-[11px] font-medium text-emerald-800 transition hover:bg-emerald-500/10 dark:text-emerald-200"
              >
                <Eye className="size-3.5" /> {tr("Reveal protected content")}
              </button>
            )}
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setRevealed((value) => !value)}
              className="flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition hover:bg-accent"
            >
              {revealed ? <EyeOff className="size-3" /> : <Eye className="size-3" />}
              {revealed ? tr("Hide") : tr("Show")}
            </button>
            <button
              type="button"
              onClick={() => void navigator.clipboard.writeText(unlocked).then(
                () => toast.success(tr("Protected content copied")),
                () => toast.error(tr("Could not copy")),
              )}
              className="flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition hover:bg-accent"
            >
              <Copy className="size-3" /> {tr("Copy")}
            </button>
            <button
              type="button"
              onClick={lockNow}
              className="flex items-center gap-1 rounded-md border px-2 py-1 text-[11px] transition hover:bg-accent"
            >
              <Lock className="size-3" /> {tr("Lock now")}
            </button>
            {!readOnly && (
              <button
                type="button"
                onClick={beginEditing}
                className="ml-auto flex items-center gap-1 rounded-md px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-accent hover:text-foreground"
              >
                <Pencil className="size-3" /> {tr("Edit")}
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
