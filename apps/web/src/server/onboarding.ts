import {
  createGitLabProvider,
  type Provider,
  type ProviderGroup,
  type ProviderProject,
  type ProviderUser,
} from '@horizon/domain'
import { connectionStore, type ScopeSelection, type StoredConnection } from './connection-store'
import { log, logError } from './logger'

export interface PublicConnection {
  readonly url: string
  readonly user: ProviderUser
}

export interface OnboardingCatalog {
  readonly groups: readonly ProviderGroup[]
  readonly projects: readonly ProviderProject[]
  readonly scope: ScopeSelection
}

/** Application service for the first-run flow. Keep this module server-only. */
export class OnboardingService {
  constructor(
    private readonly store = connectionStore,
    private readonly providerFactory: (url: string, token: string) => Provider = (url, token) =>
      createGitLabProvider({ url, token }),
  ) {}

  requireSession(session: string | undefined): Promise<void> {
    return this.store.requireSession(session)
  }

  async connection(session?: string): Promise<PublicConnection | undefined> {
    const connection = await this.store.getConnection()
    if (!connection) return undefined
    await this.store.requireSession(session)
    return connection
  }

  async connect(
    url: string,
    token: string,
  ): Promise<PublicConnection & { readonly session: string }> {
    const cleanUrl = url.trim()
    const started = Date.now()
    log('gitlab.connect.start', { host: new URL(cleanUrl).host })
    const provider = this.providerFactory(cleanUrl, token.trim())
    // Validate before writing anything. A failed attempt cannot replace a
    // working Conexão, and the token is only ever handed to the server adapter.
    let user: ProviderUser
    try {
      user = await provider.validateConnection()
    } catch (error) {
      logError('gitlab.connect.failed', error, {
        host: new URL(cleanUrl).host,
        durationMs: Date.now() - started,
      })
      throw error
    }
    const connection = await this.store.saveConnection(cleanUrl, token.trim(), user)
    log('gitlab.connect.success', {
      host: new URL(cleanUrl).host,
      userId: user.id,
      durationMs: Date.now() - started,
    })
    return { ...connection, session: await this.store.createSession() }
  }

  async catalog(session?: string): Promise<OnboardingCatalog> {
    log('onboarding.catalog.start', { authenticated: Boolean(session) })
    await this.store.requireSession(session)
    const credentials = await this.store.getCredentials()
    if (!credentials) return { groups: [], projects: [], scope: await this.store.getScope() }
    const provider = this.providerFactory(credentials.url, credentials.token)
    const [groups, projects, scope] = await Promise.all([
      readAll((page) => provider.listGroups(page)),
      readAll((page) => provider.listProjects(page)),
      this.store.getScope(),
    ])
    log('onboarding.catalog.success', { groups: groups.length, projects: projects.length })
    return { groups, projects, scope }
  }

  async saveScope(scope: ScopeSelection, session?: string): Promise<ScopeSelection> {
    log('onboarding.scope.save', {
      authenticated: Boolean(session),
      groups: scope.groups.length,
      projects: scope.projects.length,
      followGroups: scope.followGroups.length,
    })
    await this.store.requireSession(session)
    return this.store.saveScope(scope)
  }
}

export const onboarding = new OnboardingService()

async function readAll<T>(
  readPage: (page?: number) => Promise<readonly T[]>,
): Promise<readonly T[]> {
  const all: T[] = []
  for (let page = 1; page <= 10_000; page += 1) {
    const items = await readPage(page)
    all.push(...items)
    // GitLab returns fewer than 100 rows on the final page. An empty page is
    // also a valid end marker for providers that do not expose totals.
    if (items.length < 100) break
  }
  return all
}
