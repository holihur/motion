import * as React from "react"
import { cn } from "@/lib/utils"

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "flex min-h-16 w-full rounded-lg border-0 bg-muted/50 px-3 py-2 text-sm shadow-none transition-[background-color,box-shadow] outline-none placeholder:text-muted-foreground/60 focus-visible:bg-background focus-visible:ring-2 focus-visible:ring-brand/25 disabled:cursor-not-allowed disabled:bg-muted/30 disabled:opacity-60",
        className,
      )}
      {...props}
    />
  )
}

export { Textarea }
