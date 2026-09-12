import {
  createGitLabProvider,
  type Provider,
  type ProviderGroup,
  type ProviderProject,
  type ProviderUser,
} from '@horizon/domain'
import { connectionStore, type ScopeSelection, type StoredConnection } from './connection-store'

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

  requireSession(session: string | undefined): void {
    this.store.requireSession(session)
  }

  async connection(session?: string): Promise<PublicConnection | undefined> {
    if (session) this.store.requireSession(session)
    return this.store.getConnection()
  }

  async connect(
    url: string,
    token: string,
  ): Promise<PublicConnection & { readonly session: string }> {
    const provider = this.providerFactory(url.trim(), token.trim())
    // Validate before writing anything. A failed attempt cannot replace a
    // working Conexão, and the token is only ever handed to the server adapter.
    const user = await provider.validateConnection()
    const connection = await this.store.saveConnection(url.trim(), token.trim(), user)
    return { ...connection, session: this.store.createSession() }
  }

  async catalog(session?: string): Promise<OnboardingCatalog> {
    if (session) this.store.requireSession(session)
    const credentials = await this.store.getCredentials()
    if (!credentials) return { groups: [], projects: [], scope: await this.store.getScope() }
    const provider = this.providerFactory(credentials.url, credentials.token)
    const [groups, projects, scope] = await Promise.all([
      readAll(provider.listGroups),
      readAll(provider.listProjects),
      this.store.getScope(),
    ])
    return { groups, projects, scope }
  }

  async saveScope(scope: ScopeSelection, session?: string): Promise<ScopeSelection> {
    if (session) this.store.requireSession(session)
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
