import { useId } from "react"
import { cn } from "@/lib/utils"

export function LogoMark({ className }: { className?: string }) {
  const id = useId().replace(/:/g, "")
  return (
    <svg viewBox="0 0 64 64" fill="none" className={cn("size-8", className)} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}-g`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="var(--brand)" />
          <stop offset="1" stopColor="var(--brand-two)" />
        </linearGradient>
      </defs>
      <rect width="64" height="64" rx="17" fill={`url(#${id}-g)`} />
      <path d="M14.5 43.5V21.5h6.1L32 34.8l11.4-13.3h6.1v22h-6.2V31.3L32 44.3 20.7 31.3v12.2z" fill="white" fillOpacity="0.97" />
    </svg>
  )
}

export function Logo({ className, markClassName }: { className?: string; markClassName?: string }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <LogoMark className={markClassName} />
      <span className="text-[19px] font-semibold tracking-tight">motion</span>
    </div>
  )
}
