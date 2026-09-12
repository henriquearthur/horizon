import { Link } from '@tanstack/react-router'
import type { ViewMode } from '@horizon/domain'
import { cn } from '~/lib/utils'

const MODES: readonly { readonly mode: ViewMode; readonly label: string }[] = [
  { mode: 'list', label: 'Lista' },
  { mode: 'kanban', label: 'Kanban' },
]

export interface ContentHeaderProps {
  readonly title: string
  readonly subtitle: string
  readonly mode: ViewMode
}

/** Title, subtitle and the Lista/Kanban switch above the content area. */
export function ContentHeader({ title, subtitle, mode }: ContentHeaderProps) {
  return (
    <div className="flex flex-none items-center gap-3 px-4 pt-3">
      <div className="flex min-w-0 items-baseline gap-2.5">
        <h1 className="m-0 text-[15px] font-semibold whitespace-nowrap text-foreground">{title}</h1>
        <span className="truncate text-[11.5px] text-muted-foreground">{subtitle}</span>
      </div>
      <div className="flex-1" />
      <div
        role="group"
        aria-label="Modo de visualização"
        className="flex flex-none gap-0.5 rounded-lg bg-secondary p-0.5"
      >
        {MODES.map((option) => (
          <Link
            key={option.mode}
            to="."
            search={(previous) => ({ ...previous, mode: option.mode })}
            aria-current={option.mode === mode ? 'true' : undefined}
            className={cn(
              'flex h-[22px] items-center rounded-md px-2.5 text-[11.5px] whitespace-nowrap no-underline hover:no-underline',
              option.mode === mode
                ? 'bg-background text-foreground'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </Link>
        ))}
      </div>
    </div>
  )
}
