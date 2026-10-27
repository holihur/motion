import { clsx, type ClassValue } from "clsx"
import { locale, tr } from "./i18n"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function uid() {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID()
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36)
}

export function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("")
}

export function formatRelative(iso: string) {
  const date = new Date(iso)
  const diff = Date.now() - date.getTime()
  const minute = 60_000
  const hour = 60 * minute
  const day = 24 * hour
  if (diff < minute) return tr("just now")
  if (diff < hour) return tr("{n}m ago", { n: Math.floor(diff / minute) })
  if (diff < day) return tr("{n}h ago", { n: Math.floor(diff / hour) })
  if (diff < 7 * day) return tr("{n}d ago", { n: Math.floor(diff / day) })
  return date.toLocaleDateString(locale(), { month: "short", day: "numeric" })
}

export function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString(locale(), {
    month: "long",
    day: "numeric",
    year: "numeric",
  })
}

export function greeting() {
  const hour = new Date().getHours()
  if (hour < 5) return tr("Good night")
  if (hour < 12) return tr("Good morning")
  if (hour < 18) return tr("Good afternoon")
  return tr("Good evening")
}

export function isMac() {
  if (typeof navigator === "undefined") return false
  return /Mac|iPhone|iPad/.test(navigator.platform)
}

export function modKey() {
  return isMac() ? "⌘" : "Ctrl"
}
