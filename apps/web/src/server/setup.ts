import type { ProviderGroup, ProviderProject, ProviderUser, ScopeSelection } from '@horizon/domain'
import { GITLAB_TOKEN_VAR, GITLAB_URL_VAR, gitlabDiagnostics } from './config'
import { currentUser, invalidateScopedReads, providerCatalog } from './gitlab'
import { log, logError } from './logger'
import { scopeStore } from './scope-store'

export interface SetupStatus {
  /** The deployment has a usable URL and token in the environment. */
  readonly configured: boolean
  /** The token actually reaches GitLab. */
  readonly reachable: boolean
  /** No project is in the Escopo yet, so `/setup` still has work to do. */
  readonly scopeEmpty: boolean
  readonly host?: string
  readonly user?: ProviderUser
  readonly error?: string
  readonly missing: readonly string[]
  readonly envVars: { readonly url: string; readonly token: string }
}

export interface SetupCatalog {
  readonly groups: readonly ProviderGroup[]
  readonly projects: readonly ProviderProject[]
  readonly scope: ScopeSelection
}

/** Application service for the first-run flow. Keep this module server-only. */
export class SetupService {
  constructor(
    private readonly store = scopeStore,
    private readonly catalogOf = providerCatalog,
  ) {}

  async status(): Promise<SetupStatus> {
    const diagnostics = gitlabDiagnostics()
    const envVars = { url: GITLAB_URL_VAR, token: GITLAB_TOKEN_VAR }
    const scopeEmpty = await this.store.isEmpty()
    if (!diagnostics.configured)
      return {
        configured: false,
        reachable: false,
        scopeEmpty,
        missing: diagnostics.missing,
        envVars,
        ...(diagnostics.invalidUrl ? { error: diagnostics.invalidUrl } : {}),
      }
    try {
      const user = await currentUser()
      return {
        configured: true,
        reachable: true,
        scopeEmpty,
        missing: [],
        envVars,
        user,
        ...(diagnostics.host ? { host: diagnostics.host } : {}),
      }
    } catch (error) {
      logError('setup.status.unreachable', error, { host: diagnostics.host })
      return {
        configured: true,
        reachable: false,
        scopeEmpty,
        missing: [],
        envVars,
        ...(diagnostics.host ? { host: diagnostics.host } : {}),
        error: error instanceof Error ? error.message : 'Não foi possível falar com o GitLab.',
      }
    }
  }

  catalog(force = false): Promise<SetupCatalog> {
    return this.catalogOf(force)
  }

  async saveScope(scope: ScopeSelection): Promise<ScopeSelection> {
    const saved = await this.store.saveScope(scope)
    // The Escopo decides which projects are read: everything scoped is stale now.
    invalidateScopedReads()
    log('setup.scope.saved', {
      groups: saved.groups.length,
      projects: saved.projects.length,
      followGroups: saved.followGroups.length,
    })
    return saved
  }
}

export const setup = new SetupService()
