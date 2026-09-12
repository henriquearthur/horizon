import type { ProviderIssue, ProviderProject } from './provider-read.ts'
import type { ProviderReadContract, ProviderReadPage, ProviderLabel } from './provider-read.ts'
import type { ProviderGroup, ProviderUser } from './provider.ts'

export type InboxSort = 'updated' | 'created' | 'title'
export type InboxGroup = 'project' | 'author' | 'assignee' | 'state' | 'label'
export interface InboxFilters {
  projectIds?: readonly number[]
  author?: string
  assignee?: string
  labels?: readonly string[]
  state?: ProviderIssue['state']
  priority?: string
}

export const filterIssues = (
  issues: readonly ProviderIssue[],
  filters: InboxFilters = {},
): readonly ProviderIssue[] =>
  issues.filter(
    (i) =>
      (!filters.projectIds?.length || filters.projectIds.includes(i.projectId)) &&
      (!filters.author || i.author?.username === filters.author) &&
      (!filters.assignee || i.assignees.some((a) => a.username === filters.assignee)) &&
      (!filters.labels?.length || filters.labels.every((l) => i.labels.includes(l))) &&
      (!filters.state || i.state === filters.state) &&
      (!filters.priority ||
        (i as ProviderIssue & { priority?: string }).priority === filters.priority),
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
  [...issues].sort((a, b) =>
    sort === 'title'
      ? a.title.localeCompare(b.title)
      : sort === 'created'
        ? b.id - a.id
        : b.id - a.id,
  )
export const groupIssues = (
  issues: readonly ProviderIssue[],
  group: InboxGroup = 'project',
): ReadonlyMap<string, readonly ProviderIssue[]> => {
  const out = new Map<string, ProviderIssue[]>()
  for (const i of issues) {
    const keys =
      group === 'project'
        ? [String(i.projectId)]
        : group === 'author'
          ? [i.author?.username ?? 'Sem autor']
          : group === 'assignee'
            ? i.assignees.length
              ? i.assignees.map((a) => a.username)
              : ['Sem responsável']
            : group === 'state'
              ? [i.state]
              : i.labels.length
                ? i.labels
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
