import type { IssuePriority, IssueStatus, ProviderUser } from '@horizon/domain'
import {
  BookText,
  Bug,
  CircleCheck,
  CircleDashed,
  CircleDot,
  FileText,
  Layers,
  Shapes,
  Sparkles,
  SquareCheckBig,
  Ticket,
  TriangleAlert,
  UserRound,
  Wrench,
} from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { STATUS_VALUES } from '@horizon/domain'
import { initialsOf } from '~/lib/initials'
import { priorityPresentation, statusPresentation } from '~/lib/issue-presentation'
import { tintStyle } from '~/lib/tint'
import { cn } from '~/lib/utils'

/** A Provider label, painted with the hue that name always gets. */
export function LabelChip({ label, className }: { label: string; className?: string }) {
  return (
    <span
      style={tintStyle(label)}
      className={cn(
        'tint-surface inline-flex h-[18px] max-w-[11rem] shrink-0 items-center truncate rounded-full px-2 text-[10px] font-medium',
        className,
      )}
    >
      {label}
    </span>
  )
}

/** The `+3` chip that stands for the labels a row had no room for. */
export function LabelOverflow({ count }: { count: number }) {
  return (
    <span className="inline-flex h-[18px] shrink-0 items-center rounded-full bg-muted px-2 text-[10px] font-medium text-muted-foreground">
      +{count}
    </span>
  )
}

/**
 * What kind of work item this is, read from the `type:*` labels the Provider
 * carries. Tipo is not a Label, so it does not look like one: it is a single
 * glyph that leads the title, the way a file type leads a file name. The word
 * itself lives in the tooltip, so the row stays quiet.
 */
const TYPE_ICONS: Readonly<Record<string, { Icon: typeof Ticket; className: string }>> = {
  spec: { Icon: FileText, className: 'text-violet-500' },
  ticket: { Icon: Ticket, className: 'text-sky-500' },
  bug: { Icon: Bug, className: 'text-rose-500' },
  incident: { Icon: TriangleAlert, className: 'text-rose-500' },
  feature: { Icon: Sparkles, className: 'text-emerald-500' },
  epic: { Icon: Layers, className: 'text-fuchsia-500' },
  task: { Icon: SquareCheckBig, className: 'text-teal-500' },
  chore: { Icon: Wrench, className: 'text-amber-500' },
  doc: { Icon: BookText, className: 'text-blue-500' },
  docs: { Icon: BookText, className: 'text-blue-500' },
}

export function TypeMark({
  types,
  className,
  iconClassName,
}: {
  types: readonly string[]
  className?: string
  iconClassName?: string
}) {
  if (!types.length) return null
  return (
    <span className={cn('inline-flex flex-none items-center gap-0.5', className)}>
      {types.map((type) => {
        const presentation = TYPE_ICONS[type] ?? {
          Icon: Shapes,
          className: 'text-muted-foreground',
        }
        return (
          <Tooltip key={type}>
            <TooltipTrigger asChild>
              <span
                aria-label={`Tipo: ${type}`}
                className={cn('inline-flex flex-none items-center', presentation.className)}
              >
                <presentation.Icon
                  aria-hidden
                  className={cn('size-[13px]', iconClassName)}
                  strokeWidth={2.25}
                />
              </span>
            </TooltipTrigger>
            <TooltipContent>Tipo: {type}</TooltipContent>
          </Tooltip>
        )
      })}
    </span>
  )
}

export function StatusDot({
  status,
  conflict = false,
  className,
  title,
}: {
  status: IssueStatus
  /** Set when the Issue carries more than one Status Label Horizon. */
  conflict?: boolean
  className?: string
  title?: string
}) {
  if (conflict)
    return (
      <span
        title="Status conflitante"
        aria-label="Status conflitante"
        className={cn(
          'flex size-[9px] shrink-0 items-center justify-center text-destructive',
          className,
        )}
      >
        <TriangleAlert aria-hidden className="size-[9px]" strokeWidth={3} />
      </span>
    )
  const Icon =
    status === 'Concluído' ? CircleCheck : status === 'Em andamento' ? CircleDot : CircleDashed
  return (
    <span title={title ?? status} className="inline-flex shrink-0">
      <Icon
        aria-label={title ?? status}
        aria-hidden
        style={{ color: statusPresentation(status).color }}
        className={cn('size-3.5', className)}
        strokeWidth={2.25}
      />
    </span>
  )
}

export function IssueStatusMenu({
  status,
  conflict = false,
  disabled = false,
  onChange,
  className,
}: {
  status: IssueStatus
  conflict?: boolean
  disabled?: boolean
  onChange: (status: IssueStatus) => void
  className?: string
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          disabled={disabled}
          aria-label={`Alterar status: ${status}`}
          onClick={(event) => event.stopPropagation()}
          className={cn(
            'inline-flex size-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50',
            className,
          )}
        >
          <StatusDot status={status} conflict={conflict} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="min-w-[10rem]"
        onClick={(event) => event.stopPropagation()}
      >
        {STATUS_VALUES.map((option) => (
          <DropdownMenuItem
            key={option}
            disabled={option === status && !conflict}
            onSelect={() => onChange(option)}
          >
            <StatusDot status={option} />
            {option}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/**
 * Prioridade, the loudest signal on a row. P1 is filled so it reads across the
 * whole list; lower priorities step down in weight instead of disappearing.
 */
export function PriorityBadge({
  priority,
  conflict = false,
  className,
}: {
  priority: IssuePriority | undefined
  conflict?: boolean
  className?: string
}) {
  if (conflict)
    return (
      <span
        title="Labels Horizon de prioridade conflitantes"
        className={cn(
          'inline-flex h-[18px] items-center gap-1 rounded-full bg-destructive/15 px-2 font-mono text-[10px] font-semibold text-destructive',
          className,
        )}
      >
        ⚠ conflito
      </span>
    )

  if (!priority) return null
  const presentation = priorityPresentation(priority)
  return (
    <span
      title={presentation.title}
      aria-label={presentation.title}
      style={
        presentation.emphasis === 'solid'
          ? { background: presentation.color }
          : {
              color: presentation.color,
              background: `color-mix(in oklab, ${presentation.color} 14%, transparent)`,
            }
      }
      className={cn(
        'inline-flex h-[18px] min-w-[26px] items-center justify-center rounded-full px-1.5 font-mono text-[10px] font-semibold tabular-nums',
        presentation.emphasis === 'solid' && 'text-white',
        presentation.emphasis === 'quiet' && 'bg-transparent!',
        className,
      )}
    >
      {presentation.code}
    </span>
  )
}

const AVATAR_SIZES = {
  xs: 'size-[18px] text-[8.5px]',
  sm: 'size-[21px] text-[9.5px]',
  md: 'size-6 text-[10px]',
  lg: 'size-[26px] text-[10.5px]',
} as const

/**
 * A person. The Provider avatar is used when it loads and the tinted monogram
 * takes over when it does not, so a face never silently becomes a blank disc.
 */
export function UserAvatar({
  user,
  size = 'sm',
  className,
}: {
  user: ProviderUser | undefined
  size?: keyof typeof AVATAR_SIZES
  className?: string
}) {
  const name = user?.name ?? user?.username
  const label = name ?? 'Não atribuído'
  return (
    <Avatar
      title={label}
      aria-label={label}
      className={cn('flex-none ring-1 ring-border/60', AVATAR_SIZES[size], className)}
    >
      {user?.avatarUrl ? <AvatarImage src={user.avatarUrl} alt="" /> : null}
      <AvatarFallback
        style={name ? tintStyle(name) : undefined}
        className={cn(
          'text-[length:inherit] font-semibold',
          name ? 'tint-surface' : 'bg-muted text-muted-foreground',
        )}
      >
        {name ? initialsOf(name) : <UserRound aria-hidden className="size-[0.72em]" />}
      </AvatarFallback>
    </Avatar>
  )
}

/** Up to three assignees, stacked; the rest become a counter. */
export function AssigneeStack({
  users,
  size = 'sm',
}: {
  users: readonly ProviderUser[]
  size?: keyof typeof AVATAR_SIZES
}) {
  if (users.length === 0) return <UserAvatar user={undefined} size={size} />
  return (
    <div className="flex -space-x-1.5">
      {users.slice(0, 3).map((user) => (
        <UserAvatar key={user.id} user={user} size={size} className="ring-2 ring-background" />
      ))}
      {users.length > 3 ? (
        <span
          className={cn(
            'inline-flex items-center justify-center rounded-full bg-muted font-semibold text-muted-foreground ring-2 ring-background',
            AVATAR_SIZES[size],
          )}
        >
          +{users.length - 3}
        </span>
      ) : null}
    </div>
  )
}

/** A small mono counter with an icon, e.g. `⑂ 2` for merge requests. */
export function MetaCount({
  icon,
  value,
  label,
  className,
}: {
  icon: React.ReactNode
  value: number
  label: string
  className?: string
}) {
  if (!value) return null
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <span
          className={cn(
            'inline-flex shrink-0 items-center gap-1 font-mono text-[10.5px] tabular-nums',
            className,
          )}
        >
          {icon}
          {value}
        </span>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  )
}
