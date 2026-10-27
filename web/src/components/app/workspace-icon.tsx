import { cn } from "@/lib/utils"

export function isImageIcon(value?: string) {
  return Boolean(value && (value.startsWith("/api/files/") || /^https?:\/\//i.test(value)))
}

export function WorkspaceIcon({ value, className, alt = "" }: { value?: string; className?: string; alt?: string }) {
  if (isImageIcon(value)) {
    return <img src={value} alt={alt} className={cn("size-full rounded-[inherit] object-cover", className)} />
  }
  return <span className={cn("leading-none", className)}>{value || "🧭"}</span>
}
