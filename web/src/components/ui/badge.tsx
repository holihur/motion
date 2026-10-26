import type * as React from "react"
import { cn } from "@/lib/utils"

function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-md border border-border bg-muted/60 px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground",
        className,
      )}
      {...props}
    />
  )
}

export { Badge }
