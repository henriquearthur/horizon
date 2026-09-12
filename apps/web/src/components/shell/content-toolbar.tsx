export interface ContentToolbarProps {
  /** Right-aligned result summary, omitted while no Issue data is loaded. */
  readonly resultCount?: string
  /** Actions pinned to the right, before the result summary. */
  readonly actions?: React.ReactNode
  readonly children?: React.ReactNode
}

/** The filter/summary strip between the content header and the content body. */
export function ContentToolbar({ resultCount, actions, children }: ContentToolbarProps) {
  return (
    <div className="relative flex min-h-12 flex-none flex-wrap items-center gap-1.5 border-b px-5 py-2.5">
      {children}
      <div className="flex-1" />
      {actions}
      {resultCount === undefined ? null : (
        <span className="flex-none font-mono text-[10.5px] tabular-nums text-muted-foreground">
          {resultCount}
        </span>
      )}
    </div>
  )
}
