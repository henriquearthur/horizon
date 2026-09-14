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

export const readIssueProperties = (issue: Pick<ProviderIssue, 'labels' | 'state'>) => {
  const status = parse(issue.labels, 'status', STATUS_VALUES)
  const priority = parse(issue.labels, 'priority', PRIORITY_VALUES)
  return {
    status:
      (status.value as IssueStatus | undefined) ??
      (issue.state === 'closed' ? 'Concluído' : 'Backlog'),
    priority: priority.value as IssuePriority | undefined,
    conflicts: { status: status.conflict, priority: priority.conflict },
    statusLabels: status.labels,
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
