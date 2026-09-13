import type { ProviderIssue, ProviderProject } from './provider-read.ts'
import type { ProviderReadContract, ProviderReadPage, ProviderLabel } from './provider-read.ts'
import type { ProviderGroup, ProviderUser } from './provider.ts'
import { readIssueProperties } from './properties.ts'
import type { IssuePriority, IssueStatus } from './properties.ts'

export type InboxSort = 'updated' | 'created' | 'title'
export type InboxGroup = 'project' | 'author' | 'assignee' | 'status' | 'priority' | 'label'
export interface InboxFilters {
  projectIds?: readonly number[]
  groupPaths?: readonly string[]
  author?: string
  assignee?: string
  labels?: readonly string[]
  status?: IssueStatus
  priority?: IssuePriority
}

export const filterIssues = (
  issues: readonly ProviderIssue[],
  filters: InboxFilters = {},
  projects: readonly ProviderProject[] = [],
): readonly ProviderIssue[] =>
  issues.filter(
    (i) =>
      (!filters.projectIds?.length || filters.projectIds.includes(i.projectId)) &&
      (!filters.groupPaths?.length ||
        filters.groupPaths.some((group) => {
          const project = projects.find((candidate) => candidate.id === i.projectId)
          const path = project?.groupPath ?? project?.namespace
          return path === group || path?.startsWith(`${group}/`)
        })) &&
      (!filters.author || i.author?.username === filters.author) &&
      (!filters.assignee || i.assignees.some((a) => a.username === filters.assignee)) &&
      (!filters.labels?.length || filters.labels.every((l) => i.labels.includes(l))) &&
      (!filters.status || readIssueProperties(i).status === filters.status) &&
      (!filters.priority || readIssueProperties(i).priority === filters.priority),
  )

export const searchIssues = (
  issues: readonly ProviderIssue[],
  query = '',
  projects: readonly ProviderProject[] = [],
): readonly ProviderIssue[] => {
  const q = query.trim().toLocaleLowerCase()
  if (!q) return issues
  const ids = new Set(
    projects
      .filter((p) => `${p.name} ${p.namespace}`.toLocaleLowerCase().includes(q))
      .map((p) => p.id),
  )
  return issues.filter(
    (i) =>
      ids.has(i.projectId) ||
      `${i.title} ${i.description ?? ''} ${i.labels.join(' ')}`.toLocaleLowerCase().includes(q),
  )
}

export const sortIssues = (
  issues: readonly ProviderIssue[],
  sort: InboxSort = 'updated',
): readonly ProviderIssue[] =>
  [...issues].sort((a, b) => {
    if (sort === 'title') return a.title.localeCompare(b.title)
    const field = sort === 'created' ? 'createdAt' : 'updatedAt'
    const left = a[field] ? Date.parse(a[field]) : a.id
    const right = b[field] ? Date.parse(b[field]) : b.id
    return right - left
  })
export const groupIssues = (
  issues: readonly ProviderIssue[],
  group: InboxGroup = 'project',
): ReadonlyMap<string, readonly ProviderIssue[]> => {
  const out = new Map<string, ProviderIssue[]>()
  for (const i of issues) {
    const properties = readIssueProperties(i)
    const commonLabels = i.labels.filter((label) => !label.startsWith('horizon::'))
    const keys =
      group === 'project'
        ? [String(i.projectId)]
        : group === 'author'
          ? [i.author?.username ?? 'Sem autor']
          : group === 'assignee'
            ? i.assignees.length
              ? i.assignees.map((a) => a.username)
              : ['Sem responsável']
            : group === 'status'
              ? [properties.conflicts.status ? 'Conflito' : properties.status]
              : group === 'priority'
                ? [
                    properties.conflicts.priority
                      ? 'Conflito'
                      : (properties.priority ?? 'Sem prioridade'),
                  ]
                : commonLabels.length
                  ? commonLabels
                  : ['Sem label']
    for (const k of keys) out.set(k, [...(out.get(k) ?? []), i])
  }
  return out
}

/** Deterministic in-memory reader useful for previews and UI tests. */
export class FakeReadProvider implements ProviderReadContract {
  constructor(
    readonly data: {
      groups?: readonly ProviderGroup[]
      projects?: readonly ProviderProject[]
      users?: readonly ProviderUser[]
      labels?: readonly ProviderLabel[]
      issues?: readonly ProviderIssue[]
    } = {},
  ) {}
  async listGroups(): Promise<ProviderReadPage<ProviderGroup>> {
    return { items: this.data.groups ?? [] }
  }
  async listProjects(): Promise<ProviderReadPage<ProviderProject>> {
    return { items: this.data.projects ?? [] }
  }
  async listUsers(): Promise<ProviderReadPage<ProviderUser>> {
    return { items: this.data.users ?? [] }
  }
  async listLabels(): Promise<ProviderReadPage<ProviderLabel>> {
    return { items: this.data.labels ?? [] }
  }
  async listIssues(): Promise<ProviderReadPage<ProviderIssue>> {
    return { items: this.data.issues ?? [] }
  }
  async searchDiscussions(): Promise<readonly []> {
    return []
  }
  async readScope(): Promise<{
    groups: readonly ProviderGroup[]
    projects: readonly ProviderProject[]
    issues: readonly ProviderIssue[]
  }> {
    return {
      groups: this.data.groups ?? [],
      projects: this.data.projects ?? [],
      issues: this.data.issues ?? [],
    }
  }
}

/** Closed issues leave every view after 24 hours, regardless of later edits. */
export const isIssueVisible = (issue: ProviderIssue, now = Date.now()): boolean => {
  if (issue.state !== 'closed') return true
  const closedAt = Date.parse(issue.closedAt ?? '')
  return Number.isFinite(closedAt) && closedAt <= now && now - closedAt < 86_400_000
}

/**
 * Applies retention without breaking a direct parent/child roll-up.
 * An open child keeps its parent visible and, once the parent is eligible, all
 * of its direct children travel with it regardless of their own close date.
 */
export const visibleIssueHierarchy = (
  issues: readonly ProviderIssue[],
  now = Date.now(),
): readonly ProviderIssue[] => {
  const openParentKeys = new Set(
    issues
      .filter((issue) => issue.state === 'opened' && issue.parentIid !== undefined)
      .map((issue) => `${issue.projectId}:${issue.parentIid}`),
  )
  const eligibleParentKeys = new Set(
    issues
      .filter(
        (issue) =>
          isIssueVisible(issue, now) || openParentKeys.has(`${issue.projectId}:${issue.iid}`),
      )
      .map((issue) => `${issue.projectId}:${issue.iid}`),
  )
  return issues.filter(
    (issue) =>
      eligibleParentKeys.has(`${issue.projectId}:${issue.iid}`) ||
      (issue.parentIid !== undefined &&
        eligibleParentKeys.has(`${issue.projectId}:${issue.parentIid}`)),
  )
}
