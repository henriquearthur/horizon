import type { ProviderIssue } from './provider-read.ts'

export const STATUS_VALUES = ['Backlog', 'Em andamento', 'Pausada', 'Concluído'] as const
export const PRIORITY_VALUES = [
  'P1 urgente',
  'P2 alta',
  'P3 média',
  'P4 baixa',
  'Sem prioridade',
] as const
export type IssueStatus = (typeof STATUS_VALUES)[number]
export type IssuePriority = (typeof PRIORITY_VALUES)[number]
export type PropertyField = 'status' | 'priority'
export const horizonLabel = (field: PropertyField, value: string) => `horizon::${field}::${value}`

const LEGACY_STATUS_VALUES: Readonly<Record<string, IssueStatus>> = {
  backlog: 'Backlog',
  'in-progress': 'Em andamento',
  'em andamento': 'Em andamento',
  pausada: 'Pausada',
  concluído: 'Concluído',
}

/**
 * Every label Horizon owns: the scoped `horizon::…` properties and the
 * unscoped `horizon-…` links. None of them belong in the label UI.
 */
export const isHorizonLabel = (label: string): boolean =>
  label.startsWith('horizon::') || label.startsWith('horizon-')

const parse = (labels: readonly string[], field: PropertyField, values: readonly string[]) => {
  const matches = labels
    .filter((label) => label.startsWith(`horizon::${field}::`))
    .map((label) => label.slice(`horizon::${field}::`.length))
    .filter((value) => values.includes(value))
  return {
    value: matches.length === 1 ? matches[0] : undefined,
    conflict: matches.length > 1,
    labels: matches,
  }
}

/**
 * The canonical Status a label value stands for, ignoring case and accepting
 * the values older data was written with. `undefined` means the Provider
 * carries a Status Horizon does not know.
 */
export const canonicalStatus = (value: string): IssueStatus | undefined => {
  const key = value.trim().toLocaleLowerCase()
  return (
    STATUS_VALUES.find((status) => status.toLocaleLowerCase() === key) ?? LEGACY_STATUS_VALUES[key]
  )
}

/** The canonical Prioridade a value stands for, accepting `P1`-style shorthand. */
export const canonicalPriority = (value: string): IssuePriority | undefined => {
  const key = value.trim().toLocaleLowerCase()
  return PRIORITY_VALUES.find(
    (priority) =>
      priority.toLocaleLowerCase() === key || priority.toLocaleLowerCase().split(' ')[0] === key,
  )
}

const readStatus = (labels: readonly string[]) => {
  const written = labels
    .filter((label) => label.startsWith('horizon::status::'))
    .map((label) => label.slice('horizon::status::'.length))
  const unknown = written.filter((value) => canonicalStatus(value) === undefined)
  const values = [
    ...new Set(written.map(canonicalStatus).filter((value): value is IssueStatus => !!value)),
  ]
  return {
    // An unrecognised Status label is a conflict, never a silent Backlog.
    value: values.length === 1 && unknown.length === 0 ? values[0] : undefined,
    conflict: values.length > 1 || unknown.length > 0,
    labels: values,
    unknown,
  }
}

export const readIssueProperties = (issue: Pick<ProviderIssue, 'labels' | 'state'>) => {
  const status = readStatus(issue.labels)
  const priority = parse(issue.labels, 'priority', PRIORITY_VALUES)
  return {
    status:
      (status.value as IssueStatus | undefined) ??
      (issue.state === 'closed' ? 'Concluído' : 'Backlog'),
    priority: priority.value as IssuePriority | undefined,
    conflicts: { status: status.conflict, priority: priority.conflict },
    statusLabels: status.labels,
    unknownStatusLabels: status.unknown,
    priorityLabels: priority.labels,
  }
}

export const writeIssueProperties = (
  labels: readonly string[],
  changes: { status?: IssueStatus; priority?: IssuePriority },
): readonly string[] => {
  const kept = labels.filter(
    (label) => !label.startsWith('horizon::status::') && !label.startsWith('horizon::priority::'),
  )
  const current = readIssueProperties({ labels, state: 'opened' })
  const status = changes.status ?? current.status
  const priority = changes.priority ?? current.priority
  return [
    ...kept,
    horizonLabel('status', status),
    ...(priority ? [horizonLabel('priority', priority)] : []),
  ]
}

export const stateForStatus = (status: IssueStatus): 'opened' | 'closed' =>
  status === 'Concluído' ? 'closed' : 'opened'
