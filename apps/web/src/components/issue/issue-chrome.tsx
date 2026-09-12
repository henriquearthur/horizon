import type { IssuePriority, IssueStatus, ProviderUser } from '@horizon/domain'
import { CircleCheck, CircleDashed, CircleDot, TriangleAlert, UserRound } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
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
