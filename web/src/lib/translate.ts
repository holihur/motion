import { api } from "@/lib/api"

const LANGS = [
  { code: "en", label: "English" },
  { code: "zh", label: "中文" },
  { code: "es", label: "Español" },
  { code: "hi", label: "हिन्दी" },
  { code: "ar", label: "العربية" },
  { code: "pt", label: "Português" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "ja", label: "日本語" },
  { code: "ru", label: "Русский" },
] as const

export type LangCode = typeof LANGS[number]["code"]

export const TRANSLATE_LANGS = LANGS

// Best-effort: try AI translate, fallback to prefix marker
export async function translateText(text: string, target: LangCode): Promise<string> {
  if (!text.trim()) return text
  try {
    // Use BYOK AI if configured; prompt is lightweight
    const res = await api.ai.chat({ message: `Translate the following to ${target} (only output translation, keep formatting):\n\n${text}` })
    if (res.reply && res.reply.trim().length > 1) return res.reply.trim()
  } catch {}
  // fallback: simple marker (preserves CI without AI key)
  return `[${target.toUpperCase()}] ${text}`
}

/** 改写选中文本：无专用后端，复用通用 AI chat（BYOK），失败抛错。 */
export async function rewriteText(text: string, instruction: string): Promise<string> {
  if (!text.trim()) return text
  const res = await api.ai.chat({
    message: `${instruction} (only output the rewritten text, keep the same language and formatting):\n\n${text}`,
  })
  const out = res.reply?.trim() ?? ""
  if (out.length < 2) throw new Error("empty rewrite")
  return out
}
