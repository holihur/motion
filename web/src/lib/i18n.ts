export type Language = "en" | "zh" | "es" | "hi" | "ar" | "pt" | "fr" | "de" | "ja" | "ru"

export const LANGUAGES: { code: Language; label: string; native: string }[] = [
  { code: "en", label: "English", native: "English" },
  { code: "zh", label: "Chinese", native: "中文" },
  { code: "es", label: "Spanish", native: "Español" },
  { code: "hi", label: "Hindi", native: "हिन्दी" },
  { code: "ar", label: "Arabic", native: "العربية" },
  { code: "pt", label: "Portuguese", native: "Português" },
  { code: "fr", label: "French", native: "Français" },
  { code: "de", label: "German", native: "Deutsch" },
  { code: "ja", label: "Japanese", native: "日本語" },
  { code: "ru", label: "Russian", native: "Русский" },
]

const LANGUAGE_KEY = "motion.language"

// On-demand dictionaries: en is built-in (fallback), all others (zh/es/hi/ar/pt/fr/de/ja/ru) are split chunks
const dictionaryCache: Record<Language, Record<string, string>> = { en: {} } as Record<Language, Record<string, string>>
const dictionaries: Record<Language, Record<string, string>> = dictionaryCache
// Preload current language chunk (fire-and-forget, tr() falls back to English until loaded)
const _currentLang = typeof localStorage !== "undefined" ? (localStorage.getItem(LANGUAGE_KEY) as Language | null) : null
if (_currentLang && _currentLang !== "en" && !dictionaryCache[_currentLang]) {
  // Fire-and-forget; tr() will fallback to English until chunk loads, then next render picks it up
  import(`./locales/${_currentLang}.json`).then((mod) => {
    dictionaryCache[_currentLang] = (mod.default ?? mod) as Record<string, string>
  }).catch(() => {})
}
export async function ensureLanguageLoaded(lang: Language): Promise<void> {
  if (dictionaryCache[lang]) return
  try {
    const mod = await import(`./locales/${lang}.json`)
    dictionaryCache[lang] = (mod.default ?? mod) as Record<string, string>
  } catch {
    // Keep fallback to English
  }
}
const API_ERROR_ZH: Record<string, string> = {
  "page not found": "页面不存在",
  "workspace not found": "工作区不存在",
  "parent page not found": "父页面不存在",
  "you do not have permission to edit this workspace": "你没有编辑此工作区的权限",
  "you do not have permission to edit this page": "你没有编辑此页面的权限",
  "you do not have permission to comment": "你没有评论权限",
  "you only have view access": "你只有查看权限",
  "unlock the block before editing or deleting it": "请先解锁该块再编辑或删除",
  "invalid request body": "请求内容无效",
  "invalid page id": "页面 ID 无效",
  "invalid workspace id": "工作区 ID 无效",
  "title is too long": "标题过长",
  "model name is too long": "模型名称过长",
  "API key is too long": "API Key 过长",
  "an API key is required for": "需要 API Key：",
  "save your AI provider first": "请先保存 AI 服务商",
  "add your API key first": "请先添加 API Key",
  "configure your AI provider in Settings → AI first": "请先在 设置 → AI 中配置服务商",
  "add your API key in Settings → AI first": "请先在 设置 → AI 中添加 API Key",
  "could not read the saved API key; save it again": "无法读取已保存的 API Key，请重新保存",
  "the provider returned an empty response": "服务商返回了空响应",
  "could not save AI settings": "无法保存 AI 设置",
  "could not load AI settings": "无法加载 AI 设置",
  "could not load AI status": "无法加载 AI 状态",
  "no workspace found": "没有找到工作区",
  "invalid parent comment id": "父评论 ID 无效",
  "parent comment not found": "父评论不存在",
  "replies can only be one level deep": "回复只能有一层",
  "block not found": "块不存在",
  "comment must be between 1 and 5000 characters": "评论长度需在 1 到 5000 字符之间",
  "selection is too long to comment on": "选中的文字过长，无法评论",
  "only the author can edit this comment": "只有作者可以编辑此评论",
  "only the author or workspace owner can delete this comment": "只有作者或工作区所有者可以删除此评论",
  "email is already registered": "该邮箱已注册",
  "invalid email or password": "邮箱或密码错误",
  "sign-ups are disabled": "注册已关闭",
  "invalid or expired token": "Token 无效或已过期",
  "account no longer exists": "账号已不存在",
  "invalid or expired invitation": "邀请无效或已过期",
  "workspace name is required": "请输入工作区名称",
  "name is required": "请输入名称",
  "email is required": "请输入邮箱",
  "password must be at least 8 characters": "密码至少需要 8 个字符",

}
const API_ERROR_PREFIXES: [RegExp, string][] = [
  [/^AI request failed: /i, "AI 请求失败："],
  [/^AI connection failed: /i, "AI 连接失败："],
  [/^could not initialise Gemini: /i, "无法初始化 Gemini："],
  [/^could not save the page/i, "无法保存页面"],
  [/^could not/i, "操作失败"],
]

export function localizeApiError(message: string) {
  if (getLanguage() !== "zh") return message
  if (zh[message]) return zh[message]
  if (API_ERROR_ZH[message]) return API_ERROR_ZH[message]
  for (const [pattern, label] of API_ERROR_PREFIXES) {
    if (pattern.test(message)) return message.replace(pattern, label)
  }
  return message
}

const LOCALE_MAP: Record<Language, string> = { en: "en-US", zh: "zh-CN", es: "es-ES", hi: "hi-IN", ar: "ar", pt: "pt-BR", fr: "fr-FR", de: "de-DE", ja: "ja-JP", ru: "ru-RU" }
const HTML_LANG_MAP: Record<Language, string> = { en: "en", zh: "zh-CN", es: "es", hi: "hi", ar: "ar", pt: "pt", fr: "fr", de: "de", ja: "ja", ru: "ru" }

export function getLanguage(): Language {
  if (typeof localStorage === "undefined") return "en"
  const stored = localStorage.getItem(LANGUAGE_KEY) as Language | null
  if (stored && (LANGUAGES as { code: string }[]).some((l) => l.code === stored)) return stored
  // Default to English; user can switch via toggle. Do not auto-detect to avoid surprising Chinese users with English source fallback.
  return "en"
}

export function setLanguage(language: Language) {
  localStorage.setItem(LANGUAGE_KEY, language)
  document.documentElement.lang = HTML_LANG_MAP[language] ?? language
  document.documentElement.dir = language === "ar" ? "rtl" : "ltr"
  window.location.reload()
}

export function locale() {
  return LOCALE_MAP[getLanguage()] ?? "en-US"
}

export function tr(text: string, vars?: Record<string, string | number>) {
  const lang = getLanguage()
  let value = dictionaries[lang]?.[text] ?? text
  if (vars) {
    for (const [key, replacement] of Object.entries(vars)) {
      value = value.replaceAll(`{${key}}`, String(replacement))
    }
  }
  return value
}

if (typeof document !== "undefined") {
  const lang = getLanguage()
  document.documentElement.lang = HTML_LANG_MAP[lang] ?? lang
  document.documentElement.dir = lang === "ar" ? "rtl" : "ltr"
}
