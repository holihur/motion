import { useMemo, useRef, useState } from "react"
import type { Member } from "@/lib/types"
import { tr } from "@/lib/i18n"
import { initials } from "@/lib/utils"
import { cn } from "@/lib/utils"

function mentionQuery(text: string, caret: number): string | null {
  const before = text.slice(0, caret)
  const m = /@([\p{L}\p{N}_.-]*)$/u.exec(before)
  if (!m) return null
  // Don't trigger on email addresses (char before @ is word char).
  const at = caret - m[0].length
  if (at > 0 && /[\p{L}\p{N}_.-]/u.test(before[at - 1] ?? "")) return null
  return m[1]
}

export function extractMentionIds(body: string, known: Map<string, string>): string[] {
  const out = new Set<string>()
  for (const [name, userId] of known) {
    if (name && body.includes("@" + name)) out.add(userId)
  }
  return [...out]
}

function Picker({ members, active, onPick, query }: {
  members: Member[]
  active: number
  onPick: (m: Member) => void
  query: string
}) {
  if (members.length === 0) {
    return (
      <div className="px-2.5 py-2 text-[11px] text-muted-foreground">
        {query ? tr("No members match “{query}”", { query: "@" + query }) : tr("Type to filter members")}
      </div>
    )
  }
  return (
    <div className="max-h-44 overflow-y-auto p-1 thin-scrollbar">
      {members.map((m, i) => (
        <button
          key={m.userId}
          type="button"
          onMouseDown={(e) => {
            e.preventDefault()
            onPick(m)
          }}
          className={cn(
            "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs",
            i === active ? "bg-accent" : "",
          )}
        >
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-brand-soft text-[10px] font-semibold text-brand">
            {initials(m.name || m.email || "?")}
          </span>
          <span className="min-w-0 flex-1 truncate font-medium">{m.name || m.email}</span>
          <span className="shrink-0 text-[10px] text-muted-foreground">{m.role}</span>
        </button>
      ))}
    </div>
  )
}

function useMention(members: Member[]) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const known = useRef(new Map<string, string>())

  const filtered = useMemo(() => {
    const q = query.toLowerCase()
    return members
      .filter((m) => !q || (m.name || "").toLowerCase().includes(q) || (m.email || "").toLowerCase().includes(q))
      .slice(0, 8)
  }, [members, query])

  function sync(text: string, caret: number) {
    const q = mentionQuery(text, caret)
    if (q === null) {
      setOpen(false)
      return
    }
    setQuery(q)
    setActive(0)
    setOpen(true)
  }

  function pick(member: Member, text: string, caret: number): { text: string; caret: number } {
    const q = mentionQuery(text, caret) ?? ""
    const at = caret - q.length - 1
    const name = member.name || member.email
    known.current.set(name, member.userId)
    const next = text.slice(0, at) + "@" + name + " " + text.slice(caret)
    setOpen(false)
    return { text: next, caret: at + name.length + 2 }
  }

  return { open, setOpen, query, active, setActive, filtered, sync, pick, known }
}

export function MentionTextarea({ members, value, onChange, ...rest }: {
  members: Member[]
  value: string
  onChange: (value: string, mentionIds: string[]) => void
} & Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "value" | "onChange">) {
  const ref = useRef<HTMLTextAreaElement>(null)
  const mention = useMention(members)

  function emit(next: string) {
    onChange(next, extractMentionIds(next, mention.known.current))
  }

  return (
    <div className="relative">
      <textarea
        {...rest}
        ref={ref}
        value={value}
        onChange={(e) => {
          emit(e.target.value)
          mention.sync(e.target.value, e.target.selectionStart ?? e.target.value.length)
        }}
        onKeyDown={(e) => {
          if (mention.open && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === "Escape")) {
            if (e.key === "Escape") {
              mention.setOpen(false)
              return
            }
            e.preventDefault()
            if (e.key === "ArrowDown") mention.setActive((a) => Math.min(a + 1, mention.filtered.length - 1))
            else if (e.key === "ArrowUp") mention.setActive((a) => Math.max(a - 1, 0))
            else {
              const m = mention.filtered[mention.active]
              if (m && ref.current) {
                const caret = ref.current.selectionStart ?? value.length
                const { text, caret: next } = mention.pick(m, value, caret)
                emit(text)
                requestAnimationFrame(() => ref.current?.setSelectionRange(next, next))
              }
            }
            rest.onKeyDown?.(e)
            return
          }
          rest.onKeyDown?.(e)
        }}
        onBlur={() => window.setTimeout(() => mention.setOpen(false), 120)}
      />
      {mention.open && members.length > 0 && (
        <div className="absolute bottom-full z-50 mb-1 w-64 overflow-hidden rounded-lg border bg-popover shadow-lg">
          <Picker
            members={mention.filtered}
            active={mention.active}
            query={mention.query}
            onPick={(m) => {
              if (!ref.current) return
              const caret = ref.current.selectionStart ?? value.length
              const { text, caret: next } = mention.pick(m, value, caret)
              emit(text)
              requestAnimationFrame(() => {
                ref.current?.focus()
                ref.current?.setSelectionRange(next, next)
              })
            }}
          />
        </div>
      )}
    </div>
  )
}

export function MentionInput({ members, value, onChange, ...rest }: {
  members: Member[]
  value: string
  onChange: (value: string, mentionIds: string[]) => void
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, "value" | "onChange">) {
  const ref = useRef<HTMLInputElement>(null)
  const mention = useMention(members)

  function emit(next: string) {
    onChange(next, extractMentionIds(next, mention.known.current))
  }

  return (
    <div className="relative min-w-0 flex-1">
      <input
        {...rest}
        ref={ref}
        value={value}
        onChange={(e) => {
          emit(e.target.value)
          mention.sync(e.target.value, e.target.selectionStart ?? e.target.value.length)
        }}
        onKeyDown={(e) => {
          if (mention.open && (e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Enter" || e.key === "Escape")) {
            if (e.key === "Escape") {
              mention.setOpen(false)
              return
            }
            e.preventDefault()
            if (e.key === "ArrowDown") mention.setActive((a) => Math.min(a + 1, mention.filtered.length - 1))
            else if (e.key === "ArrowUp") mention.setActive((a) => Math.max(a - 1, 0))
            else {
              const m = mention.filtered[mention.active]
              if (m && ref.current) {
                const caret = ref.current.selectionStart ?? value.length
                const { text, caret: next } = mention.pick(m, value, caret)
                emit(text)
                requestAnimationFrame(() => ref.current?.setSelectionRange(next, next))
              }
            }
            rest.onKeyDown?.(e)
            return
          }
          rest.onKeyDown?.(e)
        }}
        onBlur={() => window.setTimeout(() => mention.setOpen(false), 120)}
      />
      {mention.open && members.length > 0 && (
        <div className="absolute bottom-full z-50 mb-1 w-64 overflow-hidden rounded-lg border bg-popover shadow-lg">
          <Picker
            members={mention.filtered}
            active={mention.active}
            query={mention.query}
            onPick={(m) => {
              if (!ref.current) return
              const caret = ref.current.selectionStart ?? value.length
              const { text, caret: next } = mention.pick(m, value, caret)
              emit(text)
              requestAnimationFrame(() => {
                ref.current?.focus()
                ref.current?.setSelectionRange(next, next)
              })
            }}
          />
        </div>
      )}
    </div>
  )
}
