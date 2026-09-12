import {
  PRIORITY_VALUES,
  STATUS_VALUES,
  type IssuePriority,
  type IssueStatus,
  type ProviderIssue,
  type ProviderProject,
} from '@horizon/domain'

export interface StatusPresentation {
  readonly status: IssueStatus
  /** CSS colour for the Status dot. */
  readonly color: string
  /** Tailwind class painting a surface with the Status colour. */
  readonly surface: string
}

const STATUS_PRESENTATION: Readonly<Record<IssueStatus, StatusPresentation>> = {
  Backlog: {
    status: 'Backlog',
    color: 'var(--status-backlog)',
    surface: 'bg-status-backlog/12 text-status-backlog',
  },
  'Em andamento': {
    status: 'Em andamento',
    color: 'var(--status-progress)',
    surface: 'bg-status-progress/15 text-status-progress',
  },
  Concluído: {
    status: 'Concluído',
    color: 'var(--status-done)',
    surface: 'bg-status-done/15 text-status-done',
  },
}

export const statusPresentation = (status: IssueStatus): StatusPresentation =>
  STATUS_PRESENTATION[status] ?? STATUS_PRESENTATION.Backlog

export const statusOrder = (status: IssueStatus): number => STATUS_VALUES.indexOf(status)

export interface PriorityPresentation {
  /** `P1`…`P4`, or `—` when the Issue carries no Prioridade. */
  readonly code: string
  /** Full Prioridade, used as the accessible name and the tooltip. */
  readonly title: string
  /** CSS colour for the Prioridade badge. */
  readonly color: string
  /** How loud the badge should be: P1 and P2 are filled, the rest are quiet. */
  readonly emphasis: 'solid' | 'soft' | 'quiet'
}

const PRIORITY_PRESENTATION: Readonly<Record<string, PriorityPresentation>> = {
  'P1 urgente': {
    code: 'P1',
    title: 'P1 urgente',
    color: 'var(--priority-1)',
    emphasis: 'solid',
  },
  'P2 alta': { code: 'P2', title: 'P2 alta', color: 'var(--priority-2)', emphasis: 'soft' },
  'P3 média': { code: 'P3', title: 'P3 média', color: 'var(--priority-3)', emphasis: 'soft' },
  'P4 baixa': { code: 'P4', title: 'P4 baixa', color: 'var(--priority-4)', emphasis: 'quiet' },
  'Sem prioridade': {
    code: '—',
    title: 'Sem prioridade',
    color: 'var(--priority-none)',
    emphasis: 'quiet',
  },
}

export const priorityPresentation = (priority: IssuePriority | undefined): PriorityPresentation =>
  PRIORITY_PRESENTATION[priority ?? 'Sem prioridade'] ?? PRIORITY_PRESENTATION['Sem prioridade']!

export const priorityOrder = (priority: IssuePriority | undefined): number =>
  priority ? PRIORITY_VALUES.indexOf(priority) : PRIORITY_VALUES.length

/** Short human code for an Issue, e.g. `TA-482` for `infra/terraform-aws#482`. */
export const issueCode = (issue: ProviderIssue, project: ProviderProject | undefined): string => {
  if (!project) return `#${issue.iid}`
  const parts = project.path.split(/[-_]/).filter(Boolean)
  const prefix = parts.length > 1 ? parts.map((part) => part[0]).join('') : project.path.slice(0, 2)
  return `${prefix.toUpperCase()}-${issue.iid}`
}

export const projectPath = (project: ProviderProject | undefined, projectId: number): string =>
  project ? `${project.namespace}/${project.path}` : `Projeto ${projectId}`

const UNITS: readonly [Intl.RelativeTimeFormatUnit, number][] = [
  ['year', 31_536_000_000],
  ['month', 2_592_000_000],
  ['day', 86_400_000],
  ['hour', 3_600_000],
  ['minute', 60_000],
]

const relative = new Intl.RelativeTimeFormat('pt-BR', { numeric: 'auto', style: 'short' })

/** `há 12 min`, the way the prototype writes times. */
export const relativeTime = (value: string | undefined, now = Date.now()): string | undefined => {
  if (!value) return undefined
  const time = Date.parse(value)
  if (Number.isNaN(time)) return undefined
  const elapsed = time - now
  for (const [unit, size] of UNITS)
    if (Math.abs(elapsed) >= size) return relative.format(Math.round(elapsed / size), unit)
  return 'agora'
}

export const absoluteTime = (value: string | undefined): string | undefined => {
  if (!value) return undefined
  const time = new Date(value)
  if (Number.isNaN(time.getTime())) return undefined
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(time)
}

/** The labels a human cares about: everything that is not a Label Horizon. */
export const visibleLabels = (labels: readonly string[]): readonly string[] =>
  labels.filter((label) => !label.startsWith('horizon::'))
