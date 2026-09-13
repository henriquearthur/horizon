import { GitLabHttp, GitLabHttpError, nextPageOf, type GitLabHttpOptions } from './http.ts'
import type { ScopeSelection } from './scope.ts'
import type { ProviderGroup, ProviderProject, ProviderUser } from './provider.ts'
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
  readonly closedAt?: string
  readonly updatedAt?: string
  readonly status?: string
  readonly priority?: string
  /** Merge requests the Provider links to this Issue. */
  readonly mergeRequestCount?: number
  /** Comments on the Issue, as counted by the Provider. */
  readonly commentCount?: number
  /** `task` is a child work item; `issue` is everything else. */
  readonly kind?: 'issue' | 'task'
  /** `iid` of the work item this one hangs under, when it has a parent. */
  readonly parentIid?: number
  /** The Provider says this Issue has child items. */
  readonly hasChildren?: boolean
}

/** Parent/child links of one project, keyed by `iid`. */
export interface ProviderHierarchy {
  readonly parentOf: ReadonlyMap<number, number>
  readonly withChildren: ReadonlySet<number>
}
export interface ProviderReadPage<T> {
  readonly items: readonly T[]
  readonly nextPage?: number
  /** How many pages the Provider says the collection has, when it says so. */
  readonly totalPages?: number
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
  /** Parent/child links of the given projects, read in as few calls as possible. */
  readHierarchy?(
    projects: readonly { readonly id: number; readonly fullPath: string }[],
  ): Promise<ReadonlyMap<number, ProviderHierarchy>>
  readScope(scope: ScopeSelection): Promise<{
    groups: readonly ProviderGroup[]
    projects: readonly ProviderProject[]
    issues: readonly ProviderIssue[]
  }>
}

const user = (v: any): ProviderUser | undefined =>
  typeof v?.id === 'number' && typeof v?.username === 'string'
    ? {
        id: v.id,
        username: v.username,
        name: typeof v.name === 'string' ? v.name : v.username,
        ...(typeof v.avatar_url === 'string' ? { avatarUrl: v.avatar_url } : {}),
      }
    : undefined
/** At most this many pages are requested up front. */
const MAX_PARALLEL_PAGES = 200

const totalPagesOf = (header: string | null | undefined): number | undefined => {
  const value = Number(header)
  return Number.isSafeInteger(value) && value > 0 && value <= MAX_PARALLEL_PAGES ? value : undefined
}

const page = <T>(
  items: readonly T[],
  header: string | null,
  total?: string | null,
): ProviderReadPage<T> => ({
  items,
  ...(header && Number(header) > 0 ? { nextPage: Number(header) } : {}),
  // A header that is not a sane page count is ignored: the caller then walks
  // `nextPage` instead of allocating whatever the Provider claimed.
  ...(totalPagesOf(total) === undefined ? {} : { totalPages: totalPagesOf(total)! }),
})

export class GitLabReadProvider implements ProviderReadContract {
  readonly #http: GitLabHttp

  constructor(
    connection: { url: string; token: string },
    fetcher: typeof fetch = fetch,
    options: GitLabHttpOptions = {},
  ) {
    this.#http = new GitLabHttp(connection, fetcher, options)
  }

  /** One REST page, translated into the `{ value, next }` shape used below. */
  private async request(
    path: string,
    pageNo = 1,
  ): Promise<{ value: any; next: string | null; total: string | null }> {
    try {
      const result = await this.#http.json<any>(this.#http.url(path, pageNo))
      const next = nextPageOf(result.response)
      return {
        value: result.value,
        next: next === undefined ? null : String(next),
        total: result.response.headers.get('x-total-pages'),
      }
    } catch (error) {
      throw error instanceof GitLabHttpError ? new Error(error.message) : error
    }
  }

  async listGroups(p = 1) {
    const r = await this.request('groups?min_access_level=10', p)
    return page(
      (r.value as any[]).flatMap((v) =>
        typeof v.id === 'number' && typeof v.full_path === 'string' && typeof v.name === 'string'
          ? [{ id: v.id, fullPath: v.full_path, name: v.name }]
          : [],
      ),
      r.next,
      r.total,
    )
  }
  async listProjects(p = 1) {
    // `membership=true` misses projects reached through inherited subgroup
    // access on some self-hosted GitLab versions. `min_access_level` keeps the
    // catalog private to what the token can actually read while including
    // those inherited projects.
    const r = await this.request('projects?min_access_level=10&simple=true&archived=false', p)
    return page(
      (r.value as any[]).flatMap((v) =>
        typeof v.id === 'number' &&
        typeof v.path_with_namespace === 'string' &&
        typeof v.name === 'string' &&
        typeof v.web_url === 'string'
          ? [
              {
                id: v.id,
                path:
                  typeof v.path === 'string' ? v.path : v.path_with_namespace.split('/').at(-1)!,
                name: v.name,
                namespace: v.path_with_namespace.slice(0, -(String(v.path ?? v.name).length + 1)),
                webUrl: v.web_url,
                groupPath: v.path_with_namespace.split('/').slice(0, -1).join('/'),
              },
            ]
          : [],
      ),
      r.next,
      r.total,
    )
  }
  async listUsers(id: number, p = 1) {
    const r = await this.request(`projects/${id}/members/all`, p)
    return page(
      (r.value as any[]).flatMap((v) => {
        const u = user(v)
        return u ? [u] : []
      }),
      r.next,
      r.total,
    )
  }
  async listLabels(id: number, p = 1) {
    const r = await this.request(`projects/${id}/labels`, p)
    return page(
      (r.value as any[]).flatMap((v) =>
        typeof v.id === 'number' && typeof v.name === 'string'
          ? [{ id: v.id, name: v.name, ...(typeof v.color === 'string' ? { color: v.color } : {}) }]
          : [],
      ),
      r.next,
      r.total,
    )
  }
  async listIssues(id: number, p = 1) {
    const r = await this.request(`projects/${id}/issues?scope=all`, p)
    return page(
      (r.value as any[]).flatMap((v) => {
        if (!(
          typeof v.id === 'number' &&
          typeof v.iid === 'number' &&
          typeof v.title === 'string' &&
          typeof v.state === 'string' &&
          typeof v.web_url === 'string'
        ))
          return []
        const a = user(v.author)
        return [
          {
            id: v.id,
            iid: v.iid,
            projectId: id,
            title: v.title,
            ...(typeof v.description === 'string' ? { description: v.description } : {}),
            state: v.state,
            webUrl: v.web_url,
            ...(a ? { author: a } : {}),
            assignees: (v.assignees ?? []).flatMap((x: any) => {
              const u = user(x)
              return u ? [u] : []
            }),
            labels: Array.isArray(v.labels)
              ? v.labels.filter((x: unknown): x is string => typeof x === 'string')
              : [],
            ...(typeof v.created_at === 'string' ? { createdAt: v.created_at } : {}),
            ...(typeof v.updated_at === 'string' ? { updatedAt: v.updated_at } : {}),
            ...(typeof v.closed_at === 'string' ? { closedAt: v.closed_at } : {}),
            ...(typeof v.merge_requests_count === 'number'
              ? { mergeRequestCount: v.merge_requests_count }
              : {}),
            ...(typeof v.user_notes_count === 'number' ? { commentCount: v.user_notes_count } : {}),
            kind:
              v.type === 'TASK' || v.issue_type === 'task' ? ('task' as const) : ('issue' as const),
          },
        ]
      }),
      r.next,
      r.total,
    )
  }
  async searchDiscussions(query: string, projectIds: readonly number[]) {
    const matches: ProviderDiscussionMatch[] = []
    for (const projectId of projectIds) {
      const result = await this.request(
        `projects/${projectId}/search?scope=notes&search=${encodeURIComponent(query)}`,
      )
      matches.push(
        ...(result.value as any[]).flatMap((value) =>
          typeof value.noteable_iid === 'number' ? [{ projectId, iid: value.noteable_iid }] : [],
        ),
      )
    }
    return matches
  }
  /**
   * Parent/child links come from GraphQL: REST has no field for them. One call
   * carries several projects, which keeps a Escopo with hundreds of
   * repositories down to a handful of round trips.
   */
  async readHierarchy(
    projects: readonly { readonly id: number; readonly fullPath: string }[],
  ): Promise<ReadonlyMap<number, ProviderHierarchy>> {
    const result = new Map<number, ProviderHierarchy>()
    // GitLab caps a query at complexity 300; eight aliased projects fit under it.
    const BATCH = 8
    const batches: (readonly { readonly id: number; readonly fullPath: string }[])[] = []
    for (let start = 0; start < projects.length; start += BATCH)
      batches.push(projects.slice(start, start + BATCH))
    // The shared HTTP gate decides how many of these actually fly at once.
    await Promise.all(batches.map((batch) => this.#readHierarchyBatch(batch, result)))
    return result
  }

  async #readHierarchyBatch(
    batch: readonly { readonly id: number; readonly fullPath: string }[],
    result: Map<number, ProviderHierarchy>,
  ): Promise<void> {
    // A project with more than one page of work items keeps its cursor here, so
    // a repository with hundreds of items does not lose the links past the
    // first page — its children would come back as top level Issues.
    let pending = batch.map((project) => ({ project, after: undefined as string | undefined }))
    for (let round = 0; pending.length && round < 50; round += 1) {
      const query = `query{${pending
        .map(
          ({ project, after }, index) =>
            `p${index}: project(fullPath:${JSON.stringify(project.fullPath)})` +
            `{workItems(types:[ISSUE,TASK],first:100${after ? `,after:${JSON.stringify(after)}` : ''})` +
            `{pageInfo{hasNextPage endCursor} nodes{iid widgets{... on WorkItemWidgetHierarchy{hasChildren parent{iid}}}}}}`,
        )
        .join(' ')}}`
      let payload: any
      try {
        payload = (
          await this.#http.json<any>(this.#http.graphqlUrl(), {
            method: 'POST',
            body: JSON.stringify({ query }),
          })
        ).value
      } catch {
        // Hierarchy only enriches the Issues; never fail a read of the Escopo for it.
        return
      }
      const next: typeof pending = []
      pending.forEach(({ project }, index) => {
        const workItems = payload?.data?.[`p${index}`]?.workItems
        const nodes = workItems?.nodes
        if (!Array.isArray(nodes)) return
        const links = result.get(project.id)
        const parentOf = new Map<number, number>(links?.parentOf ?? [])
        const withChildren = new Set<number>(links?.withChildren ?? [])
        for (const node of nodes) {
          const iid = Number(node?.iid)
          if (!Number.isInteger(iid)) continue
          const hierarchy = (node.widgets ?? []).find(
            (widget: any) => widget && ('parent' in widget || 'hasChildren' in widget),
          )
          if (hierarchy?.hasChildren === true) withChildren.add(iid)
          const parent = Number(hierarchy?.parent?.iid)
          if (Number.isInteger(parent)) parentOf.set(iid, parent)
        }
        result.set(project.id, { parentOf, withChildren })
        if (workItems.pageInfo?.hasNextPage === true && workItems.pageInfo.endCursor)
          next.push({ project, after: String(workItems.pageInfo.endCursor) })
      })
      pending = next
    }
  }

  async readScope(scope: ScopeSelection) {
    const projects: ProviderProject[] = []
    for (let p = 1; ; p++) {
      const r = await this.listProjects(p)
      projects.push(
        ...r.items.filter(
          (x) =>
            scope.projects.includes(x.id) ||
            scope.groups.some((g) => x.groupPath === g || x.groupPath?.startsWith(`${g}/`)),
        ),
      )
      if (!r.nextPage) break
    }
    const issues: ProviderIssue[] = []
    for (const project of projects)
      for (let p = 1; ; p++) {
        const r = await this.listIssues(project.id, p)
        issues.push(...r.items)
        if (!r.nextPage) break
      }
    return { groups: [], projects, issues }
  }
}

/**
 * Every page of a collection, asking for the pages GitLab already announced in
 * parallel. Sequential pagination was the slowest part of reading a large
 * Escopo — thirteen round trips, one after the other, just to list projects.
 */
export async function readAllPagesFast<T>(
  read: (page: number) => Promise<ProviderReadPage<T>>,
): Promise<T[]> {
  const first = await read(1)
  if (!first.nextPage) return [...first.items]
  if (first.totalPages === undefined) {
    const rest = await readAllPages((page) => read(page), first.nextPage)
    return [...first.items, ...rest]
  }
  const pages = await Promise.all(
    Array.from({ length: first.totalPages - 1 }, (_, index) => read(index + 2)),
  )
  return [...first.items, ...pages.flatMap((batch) => [...batch.items])]
}

export async function readAllPages<T>(
  read: (page: number) => Promise<ProviderReadPage<T>>,
  from = 1,
): Promise<T[]> {
  const results: T[] = []
  let page: number | undefined = from
  while (page !== undefined) {
    const batch: ProviderReadPage<T> = await read(page)
    results.push(...batch.items)
    page = batch.nextPage
  }
  return results
}
