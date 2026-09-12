export interface ContentToolbarProps {
  /** Right-aligned result summary, omitted while no Issue data is loaded. */
  readonly resultCount?: string
  readonly children?: React.ReactNode
}

/** The filter/summary strip between the content header and the content body. */
export function ContentToolbar({ resultCount, children }: ContentToolbarProps) {
  return (
    <div className="relative flex flex-none flex-wrap items-center gap-1.5 border-b px-4 py-2.5">
      {children}
      <div className="flex-1" />
      {resultCount === undefined ? null : (
        <span className="flex-none font-mono text-[10.5px] text-muted-foreground">
          {resultCount}
        </span>
      )}
    </div>
  )
}
