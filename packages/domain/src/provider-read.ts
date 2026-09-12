import { GitLabHttp, GitLabHttpError, nextPageOf, type GitLabHttpOptions } from './http.ts'
import { isProjectSelected, type ScopeSelection } from './scope.ts'
import { toGroups, toProjects, type ProviderGroup, type ProviderProject } from './provider.ts'
import type { ProviderUser } from './provider.ts'
export type { ProviderGroup, ProviderProject, ProviderUser } from './provider.ts'

export interface ProviderLabel {
  readonly id: number
  readonly name: string
  readonly color?: string
}
export interface ProviderIssue {
  readonly id: number
  readonly iid: number
  readonly projectId: number
  readonly title: string
  readonly description?: string
  readonly state: 'opened' | 'closed'
  readonly webUrl: string
  readonly author?: ProviderUser
  readonly assignees: readonly ProviderUser[]
  readonly labels: readonly string[]
  readonly createdAt?: string
  readonly updatedAt?: string
  readonly status?: string
  readonly priority?: string
}
export interface ProviderReadPage<T> {
  readonly items: readonly T[]
  readonly nextPage?: number
}
export interface ProviderDiscussionMatch {
  readonly projectId: number
  readonly iid: number
}
export interface ProviderReadContract {
  listGroups(page?: number): Promise<ProviderReadPage<ProviderGroup>>
  listProjects(page?: number): Promise<ProviderReadPage<ProviderProject>>
  listUsers(projectId: number, page?: number): Promise<ProviderReadPage<ProviderUser>>
  listLabels(projectId: number, page?: number): Promise<ProviderReadPage<ProviderLabel>>
  listIssues(projectId: number, page?: number): Promise<ProviderReadPage<ProviderIssue>>
  searchDiscussions(
    query: string,
    projectIds: readonly number[],
  ): Promise<readonly ProviderDiscussionMatch[]>
  readScope(scope: ScopeSelection): Promise<{
    groups: readonly ProviderGroup[]
    projects: readonly ProviderProject[]
    issues: readonly ProviderIssue[]
  }>
}

const asUser = (value: unknown): ProviderUser | undefined => {
  const row = value as Record<string, unknown> | undefined
  return typeof row?.id === 'number' && typeof row.username === 'string'
    ? {
        id: row.id,
        username: row.username,
        name: typeof row.name === 'string' ? row.name : row.username,
        ...(typeof row.avatar_url === 'string' ? { avatarUrl: row.avatar_url } : {}),
      }
    : undefined
}

const asIssue = (value: unknown, projectId: number): ProviderIssue | undefined => {
  const row = value as Record<string, unknown> | undefined
  if (
    typeof row?.id !== 'number' ||
    typeof row.iid !== 'number' ||
    typeof row.title !== 'string' ||
    (row.state !== 'opened' && row.state !== 'closed') ||
    typeof row.web_url !== 'string'
  )
    return undefined
  const author = asUser(row.author)
  return {
    id: row.id,
    iid: row.iid,
    projectId: typeof row.project_id === 'number' ? row.project_id : projectId,
    title: row.title,
    ...(typeof row.description === 'string' ? { description: row.description } : {}),
    state: row.state,
    webUrl: row.web_url,
    ...(author ? { author } : {}),
    assignees: Array.isArray(row.assignees)
      ? row.assignees.flatMap((item) => {
          const user = asUser(item)
          return user ? [user] : []
        })
      : [],
    labels: Array.isArray(row.labels)
      ? row.labels.filter((item): item is string => typeof item === 'string')
      : [],
    ...(typeof row.created_at === 'string' ? { createdAt: row.created_at } : {}),
    ...(typeof row.updated_at === 'string' ? { updatedAt: row.updated_at } : {}),
  }
}

/** Reads every page of a paginated Provider call. */
export const readAllPages = async <T>(
  read: (page: number) => Promise<ProviderReadPage<T>>,
): Promise<readonly T[]> => {
  const items: T[] = []
  let page: number | undefined = 1
  // GitLab's `x-next-page` is authoritative; the bound is a loop guard only.
  for (let guard = 0; page !== undefined && guard < 1000; guard += 1) {
    const result: ProviderReadPage<T> = await read(page)
    items.push(...result.items)
    page = result.nextPage
  }
  return items
}

export class GitLabReadProvider implements ProviderReadContract {
  readonly #http: GitLabHttp

  constructor(
    connection: { url: string; token: string },
    fetcher: typeof fetch = fetch,
    options: GitLabHttpOptions = {},
  ) {
    this.#http = new GitLabHttp(connection, fetcher, options)
  }

  async #page<T>(
    path: string,
    pageNo: number,
    map: (rows: readonly unknown[]) => readonly T[],
  ): Promise<ProviderReadPage<T>> {
    try {
      const { value, response } = await this.#http.json<unknown>(this.#http.url(path, pageNo))
      const rows = Array.isArray(value) ? value : []
      const nextPage = nextPageOf(response)
      return { items: map(rows), ...(nextPage ? { nextPage } : {}) }
    } catch (error) {
      throw asReadError(error)
    }
  }

  listGroups(page = 1) {
    return this.#page('groups?min_access_level=10', page, toGroups)
  }

  listProjects(page = 1) {
    return this.#page('projects?membership=true&simple=true', page, toProjects)
  }

  listUsers(projectId: number, page = 1) {
    return this.#page(`projects/${projectId}/members/all`, page, (rows) =>
      rows.flatMap((row) => {
        const user = asUser(row)
        return user ? [user] : []
      }),
    )
  }

  listLabels(projectId: number, page = 1) {
    return this.#page(`projects/${projectId}/labels`, page, (rows) =>
      rows.flatMap((item) => {
        const row = item as Record<string, unknown>
        return typeof row?.id === 'number' && typeof row.name === 'string'
          ? [
              {
                id: row.id,
                name: row.name,
                ...(typeof row.color === 'string' ? { color: row.color } : {}),
              },
            ]
          : []
      }),
    )
  }

  listIssues(projectId: number, page = 1) {
    return this.#page(`projects/${projectId}/issues?scope=all`, page, (rows) =>
      rows.flatMap((row) => {
        const issue = asIssue(row, projectId)
        return issue ? [issue] : []
      }),
    )
  }

  async searchDiscussions(query: string, projectIds: readonly number[]) {
    const matches: ProviderDiscussionMatch[] = []
    // The search endpoint is one of the most rate-limited on GitLab, so the
    // fan-out is capped: a discussion search is a hint, not an exhaustive scan.
    for (const projectId of projectIds.slice(0, 20)) {
      try {
        const { value } = await this.#http.json<unknown>(
          this.#http.url(
            `projects/${projectId}/search?scope=notes&search=${encodeURIComponent(query)}`,
            1,
            20,
          ),
        )
        for (const item of Array.isArray(value) ? value : []) {
          const iid = (item as { noteable_iid?: unknown }).noteable_iid
          if (typeof iid === 'number') matches.push({ projectId, iid })
        }
      } catch {
        // A project the token cannot search must not fail the whole search.
      }
    }
    return matches
  }

  async readScope(scope: ScopeSelection) {
    const allProjects = await readAllPages((page) => this.listProjects(page))
    const projects = allProjects.filter((project) => isProjectSelected(project, scope))
    const issues: ProviderIssue[] = []
    for (const project of projects)
      issues.push(...(await readAllPages((page) => this.listIssues(project.id, page))))
    return { groups: [], projects, issues }
  }
}

const asReadError = (error: unknown): Error =>
  error instanceof GitLabHttpError ? new Error(error.message) : (error as Error)
