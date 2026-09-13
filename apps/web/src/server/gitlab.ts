import {
  createGitLabProvider,
  GitLabReadProvider,
  GitLabWriteProvider,
  readAllPages,
  readAllPagesFast,
  selectedGroups,
  selectedProjects,
  type ProviderGroup,
  type ProviderIssue,
  type ProviderLabel,
  type ProviderProject,
  type ProviderReadContract,
  type ProviderUser,
  type ProviderWriteContract,
  type ScopeSelection,
} from '@horizon/domain'
import { gitlabCredentials, gitlabDiagnostics, numberSetting } from './config'
import { log, logError } from './logger'
import { scopeStore } from './scope-store'
import { TimedCache } from './timed-cache'

/** How long a read of the Provider is considered fresh enough to reuse. */
const ISSUES_TTL_MS = numberSetting('HORIZON_ISSUES_TTL_MS', 60_000)
const CATALOG_TTL_MS = numberSetting('HORIZON_CATALOG_TTL_MS', 10 * 60_000)

export class ConnectionNotConfiguredError extends Error {
  constructor() {
    const diagnostics = gitlabDiagnostics()
    super(
      diagnostics.invalidUrl ??
        `Configure ${diagnostics.missing.join(' e ')} no .env.local para conectar ao GitLab.`,
    )
    this.name = 'ConnectionNotConfiguredError'
  }
}

const credentials = () => {
  const value = gitlabCredentials()
  if (!value) throw new ConnectionNotConfiguredError()
  return value
}

/**
 * Reads run against a whole Escopo — hundreds of repositories on the GitLab
 * institucional — so they get a wider gate than the default. Writes keep the
 * conservative one.
 */
const READ_HTTP = { maxConcurrency: 16, minIntervalMs: 15 }

export const reader = (): ProviderReadContract =>
  new GitLabReadProvider(credentials(), fetch, READ_HTTP)
export const writer = (): ProviderWriteContract => new GitLabWriteProvider(credentials())

/** The GitLab account behind the token. Used by the "Atribuídos a mim" View. */
const userCache = new TimedCache<ProviderUser>(CATALOG_TTL_MS, async () => {
  const user = await createGitLabProvider(credentials()).validateConnection()
  log('gitlab.user.resolved', { userId: user.id, username: user.username })
  return user
})

/** The GitLab account behind the token, from cache when it is fresh. */
export const currentUser = (): Promise<ProviderUser> => userCache.get()

export interface ProviderCatalog {
  readonly groups: readonly ProviderGroup[]
  readonly projects: readonly ProviderProject[]
}

/** Everything the token can see. Groups and projects move slowly, so it is cached. */
const catalogCache = new TimedCache<ProviderCatalog>(CATALOG_TTL_MS, async () => {
  const provider = reader()
  const [groups, projects] = await Promise.all([
    readAllPagesFast((page) => provider.listGroups(page)),
    readAllPagesFast((page) => provider.listProjects(page)),
  ])
  log('gitlab.catalog.loaded', { groups: groups.length, projects: projects.length })
  return { groups, projects }
})

export interface ProjectMetadata {
  readonly users: readonly ProviderUser[]
  readonly labels: readonly ProviderLabel[]
}

const metadataByProject = new Map<number, TimedCache<ProjectMetadata>>()

/**
 * Members and labels of one project. Only the forms need them, so they are
 * read on demand: reading them for every project of the Escopo used to cost
 * two GitLab calls per repository on every snapshot.
 */
export const projectMetadata = (projectId: number): Promise<ProjectMetadata> => {
  const existing = metadataByProject.get(projectId)
  if (existing) return existing.get()
  const cache = new TimedCache<ProjectMetadata>(CATALOG_TTL_MS, async () => {
    const provider = reader()
    const [users, labels] = await Promise.all([
      readAllPages((page) => provider.listUsers(projectId, page)),
      readAllPages((page) => provider.listLabels(projectId, page)),
    ])
    return { users, labels }
  })
  metadataByProject.set(projectId, cache)
  return cache.get()
}

const issuesCache = new TimedCache<readonly ProviderIssue[]>(ISSUES_TTL_MS, async () => {
  const provider = reader()
  const projects = await scopedProjects()
  const started = Date.now()
  // The shared HTTP gate paces the calls, so asking for every project at once
  // is what actually keeps a large Escopo readable in seconds.
  const perProject = await Promise.all(
    projects.map(async (project) => ({
      project,
      issues: await readAllPagesFast((page) => provider.listIssues(project.id, page)),
    })),
  )
  const withIssues = perProject.filter((entry) => entry.issues.length)
  const hierarchy = await provider
    .readHierarchy?.(
      withIssues.map((entry) => ({
        id: entry.project.id,
        fullPath: `${entry.project.namespace}/${entry.project.path}`,
      })),
    )
    .catch((error: unknown) => {
      logError('gitlab.hierarchy.failed', error)
      return undefined
    })
  const issues = withIssues.flatMap((entry) => {
    const links = hierarchy?.get(entry.project.id)
    if (!links) return entry.issues
    return entry.issues.map((issue) => ({
      ...issue,
      ...(links.parentOf.has(issue.iid) ? { parentIid: links.parentOf.get(issue.iid)! } : {}),
      ...(links.withChildren.has(issue.iid) ? { hasChildren: true } : {}),
    }))
  })
  log('gitlab.issues.loaded', {
    projects: projects.length,
    issues: issues.length,
    durationMs: Date.now() - started,
  })
  return issues
})

const scopedProjects = async (): Promise<readonly ProviderProject[]> => {
  const [catalog, scope] = await Promise.all([catalogCache.get(), scopeStore.getScope()])
  return selectedProjects(catalog.projects, scope)
}

export interface ProviderSnapshot {
  readonly connection: { readonly url: string; readonly user: ProviderUser }
  readonly scope: ScopeSelection
  readonly groups: readonly ProviderGroup[]
  readonly projects: readonly ProviderProject[]
  readonly issues: readonly ProviderIssue[]
  readonly users: readonly ProviderUser[]
  readonly labels: readonly ProviderLabel[]
}

let scopeGeneration = 0

/** Everyone the Escopo mentions, so the filters can name people without extra reads. */
const peopleOf = (issues: readonly ProviderIssue[]): readonly ProviderUser[] => {
  const users = new Map<number, ProviderUser>()
  for (const issue of issues) {
    if (issue.author) users.set(issue.author.id, issue.author)
    for (const assignee of issue.assignees) users.set(assignee.id, assignee)
  }
  return [...users.values()]
}

const labelsOf = (issues: readonly ProviderIssue[]): readonly ProviderLabel[] =>
  [...new Set(issues.flatMap((issue) => issue.labels))].map((name, index) => ({
    id: index + 1,
    name,
  }))

/** One consistent read of everything the shell needs, cached per TTL. */
export const providerSnapshot = async (force = false): Promise<ProviderSnapshot> => {
  const generation = scopeGeneration
  const started = Date.now()
  const connection = credentials()
  const [user, catalog, scope] = await Promise.all([
    userCache.get(),
    catalogCache.get({ force }),
    scopeStore.getScope(),
  ])
  const projects = selectedProjects(catalog.projects, scope)
  const issues = await issuesCache.get({ force })
  if (generation !== scopeGeneration) return providerSnapshot()
  log('gitlab.snapshot', { issues: issues.length, durationMs: Date.now() - started, force })
  return {
    connection: { url: connection.url, user },
    scope,
    groups: selectedGroups(catalog.groups, scope),
    projects,
    issues,
    users: peopleOf(issues),
    labels: labelsOf(issues),
  }
}

/** The catalog for `/setup`: everything the token can see, plus the Escopo. */
export const providerCatalog = async (force = false) => {
  const [catalog, scope] = await Promise.all([catalogCache.get({ force }), scopeStore.getScope()])
  return { ...catalog, scope }
}

/** After a confirmed write the cached Issue list is stale. */
export const invalidateIssues = (): void => issuesCache.invalidate()

/** Drop every read that depends on which projects are in the Escopo. */
export const invalidateScopedReads = (): void => {
  scopeGeneration += 1
  issuesCache.invalidate()
}
