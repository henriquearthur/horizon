import { Link } from '@tanstack/react-router'
import { Columns3, Rows3 } from 'lucide-react'
import type { ViewMode } from '@horizon/domain'
import { cn } from '~/lib/utils'

const MODES: readonly {
  readonly mode: ViewMode
  readonly label: string
  readonly Icon: typeof Rows3
}[] = [
  { mode: 'list', label: 'Lista', Icon: Rows3 },
  { mode: 'kanban', label: 'Kanban', Icon: Columns3 },
]

export interface ContentHeaderProps {
  readonly title: string
  readonly subtitle: string
  readonly mode: ViewMode
  /** Actions pinned to the right of the mode switch. */
  readonly children?: React.ReactNode
}

/** Title, subtitle and the Lista/Kanban switch above the content area. */
export function ContentHeader({ title, subtitle, mode, children }: ContentHeaderProps) {
  return (
    <div className="flex flex-none items-center gap-3 px-5 pt-4 pb-1">
      <div className="flex min-w-0 items-baseline gap-2.5">
        <h1 className="m-0 text-[17px] leading-tight font-semibold tracking-tight whitespace-nowrap text-foreground">
          {title}
        </h1>
        <span className="truncate text-[11.5px] text-muted-foreground">{subtitle}</span>
      </div>
      <div className="flex-1" />
      {children}
      <div
        role="group"
        aria-label="Modo de visualização"
        className="flex flex-none gap-0.5 rounded-full bg-secondary p-0.5"
      >
        {MODES.map((option) => (
          <Link
            key={option.mode}
            to="."
            search={(previous) => ({ ...previous, mode: option.mode })}
            aria-current={option.mode === mode ? 'true' : undefined}
            className={cn(
              'flex h-6 items-center gap-1.5 rounded-full px-2.5 text-[11.5px] font-medium whitespace-nowrap no-underline transition-all duration-200 hover:no-underline',
              option.mode === mode
                ? 'bg-background text-foreground shadow-xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <option.Icon aria-hidden className="size-3" />
            {option.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
