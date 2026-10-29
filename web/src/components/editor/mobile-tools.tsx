export function MobileToolButton({
  label,
  onClick,
  children,
}: {
  label: string
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={() => { if ("vibrate" in navigator) try { navigator.vibrate(10) } catch {}; onClick() }}
      aria-label={label}
      className="flex min-w-[56px] flex-col items-center gap-1 rounded-xl px-2.5 py-2 text-[11px] font-medium text-muted-foreground transition active:scale-95 active:bg-accent touch-manipulation"
    >
      <span className="flex size-7 items-center justify-center rounded-lg bg-muted/60">{children}</span>
      <span className="text-[9px] leading-none">{label}</span>
    </button>
  )
}

export function MobileBottomBar({ children }: { children: React.ReactNode }) {
  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/92 backdrop-blur-xl supports-[backdrop-filter]:bg-background/80" style={{ paddingBottom: "max(8px, env(safe-area-inset-bottom))" }}>
      <div className="mx-auto flex max-w-[560px] items-center justify-around gap-1 px-2 py-1.5">{children}</div>
    </div>
  )
}
