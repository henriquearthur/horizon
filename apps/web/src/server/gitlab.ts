import {
  createGitLabProvider,
  GitLabReadProvider,
  GitLabWriteProvider,
  readAllPages,
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

export const reader = (): ProviderReadContract => new GitLabReadProvider(credentials())
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
    readAllPages((page) => provider.listGroups(page)),
    readAllPages((page) => provider.listProjects(page)),
  ])
  log('gitlab.catalog.loaded', { groups: groups.length, projects: projects.length })
  return { groups, projects }
})

interface ProjectMetadata {
  readonly users: readonly ProviderUser[]
  readonly labels: readonly ProviderLabel[]
  readonly projectIds: readonly number[]
}

/** Members and labels of the Escopo — needed by the forms, rarely changing. */
const metadataCache = new TimedCache<ProjectMetadata>(CATALOG_TTL_MS, async () => {
  const provider = reader()
  const projects = await scopedProjects()
  const users = new Map<number, ProviderUser>()
  const labels = new Map<string, ProviderLabel>()
  for (const project of projects) {
    // Sequential on purpose: the shared HTTP gate already paces the calls, and
    // a fan-out over dozens of projects is what used to trip GitLab's limiter.
    for (const user of await readAllPages((page) => provider.listUsers(project.id, page)))
      users.set(user.id, user)
    for (const label of await readAllPages((page) => provider.listLabels(project.id, page)))
      labels.set(label.name, label)
  }
  return {
    users: [...users.values()],
    labels: [...labels.values()],
    projectIds: projects.map((project) => project.id),
  }
})

const issuesCache = new TimedCache<readonly ProviderIssue[]>(ISSUES_TTL_MS, async () => {
  const provider = reader()
  const projects = await scopedProjects()
  const issues: ProviderIssue[] = []
  for (const project of projects)
    issues.push(...(await readAllPages((page) => provider.listIssues(project.id, page))))
  log('gitlab.issues.loaded', { projects: projects.length, issues: issues.length })
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

/** One consistent read of everything the shell needs, cached per TTL. */
export const providerSnapshot = async (force = false): Promise<ProviderSnapshot> => {
  const started = Date.now()
  const connection = credentials()
  const [user, catalog, scope] = await Promise.all([
    userCache.get(),
    catalogCache.get({ force }),
    scopeStore.getScope(),
  ])
  const projects = selectedProjects(catalog.projects, scope)
  const [issues, metadata] = await Promise.all([
    issuesCache.get({ force }),
    metadataCache.get({ force }).catch((error: unknown) => {
      // Members and labels only enrich the forms: never fail the Inbox for them.
      logError('gitlab.metadata.failed', error)
      return { users: [], labels: [], projectIds: [] } satisfies ProjectMetadata
    }),
  ])
  log('gitlab.snapshot', { issues: issues.length, durationMs: Date.now() - started, force })
  return {
    connection: { url: connection.url, user },
    scope,
    groups: selectedGroups(catalog.groups, scope),
    projects,
    issues,
    users: metadata.users,
    labels: metadata.labels,
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
  issuesCache.invalidate()
  metadataCache.invalidate()
}
