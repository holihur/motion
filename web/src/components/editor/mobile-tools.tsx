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
      onClick={onClick}
      aria-label={label}
      className="flex min-w-14 flex-col items-center gap-0.5 rounded-lg px-2 py-1 text-muted-foreground transition active:bg-accent"
    >
      {children}
      <span className="text-[9px] font-medium">{label}</span>
    </button>
  )
}
