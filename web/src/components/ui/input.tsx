import * as React from "react"
import { cn } from "@/lib/utils"

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "flex h-9 w-full min-w-0 rounded-lg border-0 bg-muted/50 px-3 py-1 text-sm shadow-none transition-[background-color,box-shadow] outline-none placeholder:text-muted-foreground/60 focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-brand/25 disabled:cursor-not-allowed disabled:bg-muted/30 disabled:opacity-60",
        className,
      )}
      {...props}
    />
  )
}

export { Input }
