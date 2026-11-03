/** 任务模板变量：{date} {time} {datetime} {weekday} {page} {workspace} */
export const TEMPLATE_VARS = [
  { key: "{date}", desc: "今天日期 2026-10-30" },
  { key: "{time}", desc: "现在时间 09:30" },
  { key: "{datetime}", desc: "日期+时间" },
  { key: "{weekday}", desc: "周几（周五）" },
  { key: "{page}", desc: "关联页面标题" },
  { key: "{workspace}", desc: "工作区名称" },
] as const

function pad(n: number) {
  return String(n).padStart(2, "0")
}

export function expandTemplateVars(
  prompt: string,
  ctx: { pageTitle?: string; workspaceName?: string; variables?: Record<string, string> },
  now = new Date(),
): string {
  const weekdays = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"]
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`
  let expanded = prompt
    .replaceAll("{date}", date)
    .replaceAll("{time}", time)
    .replaceAll("{datetime}", `${date} ${time}`)
    .replaceAll("{weekday}", weekdays[now.getDay()] ?? "")
    .replaceAll("{page}", ctx.pageTitle ?? "")
    .replaceAll("{workspace}", ctx.workspaceName ?? "")
  const builtins = new Set(["date", "time", "datetime", "weekday", "page", "workspace"])
  for (const [key, value] of Object.entries(ctx.variables ?? {})) {
    if (!key || builtins.has(key)) continue
    expanded = expanded.replaceAll(`{${key}}`, value)
  }
  return expanded
}

export function hasTemplateVars(prompt: string, variables?: Record<string, string>) {
  if (TEMPLATE_VARS.some((v) => prompt.includes(v.key))) return true
  return Object.keys(variables ?? {}).some((key) => prompt.includes(`{${key}}`))
}
