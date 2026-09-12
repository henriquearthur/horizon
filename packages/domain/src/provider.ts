/** The deliberately small Provider contract used by the setup flow.
 *
 * Horizon only knows these provider neutral records.  The GitLab adapter is
 * responsible for translating GitLab's API representation into them.
 */
import { GitLabHttp, GitLabHttpError, type GitLabHttpOptions } from './http.ts'

export interface ProviderConnection {
  readonly url: string
  readonly token: string
}

export interface ProviderUser {
  readonly id: number
  readonly username: string
  readonly name: string
  readonly avatarUrl?: string
}

export interface ProviderGroup {
  readonly id: number
  readonly fullPath: string
  readonly name: string
  readonly description?: string
  readonly avatarUrl?: string
}

export interface ProviderProject {
  readonly id: number
  readonly path: string
  readonly name: string
  readonly namespace: string
  readonly webUrl: string
  readonly groupPath?: string
}

export interface Provider {
  readonly validateConnection: () => Promise<ProviderUser>
  readonly listGroups: (page?: number) => Promise<readonly ProviderGroup[]>
  readonly listProjects: (page?: number) => Promise<readonly ProviderProject[]>
}

export class ProviderError extends Error {
  readonly status: number
  readonly code:
    | 'invalid-url'
    | 'unauthorized'
    | 'forbidden'
    | 'rate-limited'
    | 'unavailable'
    | 'invalid-response'

  constructor(
    message: string,
    options: { readonly status: number; readonly code: ProviderError['code'] },
  ) {
    super(message)
    this.name = 'ProviderError'
    this.status = options.status
    this.code = options.code
  }
}

const codeForStatus = (status: number): ProviderError['code'] =>
  status === 401
    ? 'unauthorized'
    : status === 403
      ? 'forbidden'
      : status === 429
        ? 'rate-limited'
        : status >= 500
          ? 'unavailable'
          : 'invalid-response'

/** Translates the shared HTTP failure into the Provider vocabulary. */
export const asProviderError = (error: unknown): ProviderError => {
  if (error instanceof ProviderError) return error
  if (error instanceof GitLabHttpError)
    return new ProviderError(
      error.failure === 'status' && error.status === 401
        ? 'Token inválido ou expirado.'
        : error.failure === 'status' && error.status === 403
          ? 'Token sem permissão para acessar o GitLab.'
          : error.message,
      {
        status: error.status,
        code:
          error.failure === 'status'
            ? codeForStatus(error.status)
            : error.failure === 'invalid-response'
              ? 'invalid-response'
              : 'unavailable',
      },
    )
  return new ProviderError('Não foi possível conectar ao GitLab.', {
    status: 503,
    code: 'unavailable',
  })
}

const invalidUrl = (): never => {
  throw new ProviderError('Informe uma URL válida do GitLab.', {
    status: 400,
    code: 'invalid-url',
  })
}

/** GitLab REST v4 adapter. It never exposes the token in returned records. */
export class GitLabProvider implements Provider {
  readonly #http: GitLabHttp

  constructor(
    connection: ProviderConnection,
    fetcher: typeof fetch = fetch,
    options: GitLabHttpOptions = {},
  ) {
    this.#http = new GitLabHttp(connection, fetcher, options, invalidUrl)
  }

  async #request<T>(path: string, page = 1): Promise<T> {
    try {
      return (await this.#http.json<T>(this.#http.url(path, page))).value
    } catch (error) {
      throw asProviderError(error)
    }
  }

  async validateConnection(): Promise<ProviderUser> {
    const value = await this.#request<Record<string, unknown>>('user')
    if (typeof value.id !== 'number' || typeof value.username !== 'string') {
      throw new ProviderError('Resposta inválida do GitLab.', {
        status: 502,
        code: 'invalid-response',
      })
    }
    return {
      id: value.id,
      username: value.username,
      name: typeof value.name === 'string' ? value.name : value.username,
      ...(typeof value.avatar_url === 'string' ? { avatarUrl: value.avatar_url } : {}),
    }
  }

  async listGroups(page = 1): Promise<readonly ProviderGroup[]> {
    const rows = await this.#request<readonly Record<string, unknown>[]>(
      'groups?min_access_level=10',
      page,
    )
    return toGroups(rows)
  }

  async listProjects(page = 1): Promise<readonly ProviderProject[]> {
    const rows = await this.#request<readonly Record<string, unknown>[]>(
      'projects?membership=true&simple=true',
      page,
    )
    return toProjects(rows)
  }
}

/** Shared GitLab → Horizon mapping, so every adapter agrees on the shape. */
export const toGroups = (rows: readonly unknown[]): readonly ProviderGroup[] =>
  (Array.isArray(rows) ? rows : []).flatMap((row) => {
    const value = row as Record<string, unknown>
    return typeof value?.id === 'number' &&
      typeof value.full_path === 'string' &&
      typeof value.name === 'string'
      ? [
          {
            id: value.id,
            fullPath: value.full_path,
            name: value.name,
            ...(typeof value.description === 'string' ? { description: value.description } : {}),
            ...(typeof value.avatar_url === 'string' ? { avatarUrl: value.avatar_url } : {}),
          },
        ]
      : []
  })

export const toProjects = (rows: readonly unknown[]): readonly ProviderProject[] =>
  (Array.isArray(rows) ? rows : []).flatMap((row) => {
    const value = row as Record<string, unknown>
    if (
      typeof value?.id !== 'number' ||
      typeof value.path_with_namespace !== 'string' ||
      typeof value.name !== 'string' ||
      typeof value.web_url !== 'string'
    )
      return []
    const path =
      typeof value.path === 'string' && value.path
        ? value.path
        : (value.path_with_namespace.split('/').at(-1) ?? value.path_with_namespace)
    const namespace = value.namespace as { full_path?: unknown } | undefined
    // The namespace of `team/sub/app` is `team/sub`; falling back to the path
    // split keeps subgroups correct when GitLab returns the simple record.
    const namespacePath =
      typeof namespace?.full_path === 'string'
        ? namespace.full_path
        : value.path_with_namespace.split('/').slice(0, -1).join('/')
    return [
      {
        id: value.id,
        path,
        name: value.name,
        namespace: namespacePath,
        groupPath: namespacePath,
        webUrl: value.web_url,
      },
    ]
  })

export const createGitLabProvider = (
  connection: ProviderConnection,
  fetcher?: typeof fetch,
): Provider => new GitLabProvider(connection, fetcher)
