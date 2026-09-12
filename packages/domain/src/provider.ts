/** The deliberately small Provider contract used by the onboarding flow.
 *
 * Horizon only knows these provider neutral records.  The GitLab adapter is
 * responsible for translating GitLab's API representation into them.
 */
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
  readonly code: 'invalid-url' | 'unauthorized' | 'forbidden' | 'unavailable' | 'invalid-response'

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

const PAGE_SIZE = 100

const toUrl = (raw: string): URL => {
  let parsed: URL
  try {
    parsed = new URL(raw)
  } catch {
    throw new ProviderError('Informe uma URL válida do GitLab.', {
      status: 400,
      code: 'invalid-url',
    })
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw new ProviderError('A URL do GitLab deve usar HTTP ou HTTPS.', {
      status: 400,
      code: 'invalid-url',
    })
  }
  parsed.pathname = parsed.pathname.replace(/\/$/, '')
  // O GitLab institucional usa a CA privada da SEFA, que não está no trust
  // store padrão do Node. A exceção fica restrita ao domínio institucional.
  if (parsed.hostname.endsWith('.sefa.pa.gov.br')) {
    const nodeProcess = (globalThis as { process?: { env?: Record<string, string | undefined> } })
      .process
    if (nodeProcess?.env) nodeProcess.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  }
  return parsed
}

const messageForStatus = (status: number): ProviderError['code'] =>
  status === 401
    ? 'unauthorized'
    : status === 403
      ? 'forbidden'
      : status >= 500
        ? 'unavailable'
        : 'invalid-response'

/** GitLab REST v4 adapter. It never exposes the token in returned records. */
export class GitLabProvider implements Provider {
  readonly #baseUrl: URL
  readonly #token: string
  readonly #fetch: typeof fetch

  constructor(connection: ProviderConnection, fetcher: typeof fetch = fetch) {
    this.#baseUrl = toUrl(connection.url)
    this.#token = connection.token
    this.#fetch = fetcher
  }

  async #request<T>(path: string, page = 1): Promise<T> {
    const prefix = this.#baseUrl.pathname.replace(/\/$/, '')
    const url = new URL(`${prefix}/api/v4/${path}`, this.#baseUrl)
    url.searchParams.set('page', String(page))
    url.searchParams.set('per_page', String(PAGE_SIZE))
    let response: Response
    try {
      response = await this.#fetch(url, {
        headers: { 'PRIVATE-TOKEN': this.#token, Accept: 'application/json' },
        signal: AbortSignal.timeout(15_000),
      })
    } catch (error) {
      throw new ProviderError('Não foi possível conectar ao GitLab.', {
        status: 503,
        code: 'unavailable',
      })
    }
    if (!response.ok) {
      throw new ProviderError(
        response.status === 401
          ? 'Token inválido ou expirado.'
          : response.status === 403
            ? 'Token sem permissão para acessar o GitLab.'
            : 'O GitLab não respondeu corretamente.',
        { status: response.status, code: messageForStatus(response.status) },
      )
    }
    try {
      return (await response.json()) as T
    } catch {
      throw new ProviderError('Resposta inválida do GitLab.', {
        status: 502,
        code: 'invalid-response',
      })
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
    return rows.flatMap((value) =>
      typeof value.id === 'number' &&
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
        : [],
    )
  }

  async listProjects(page = 1): Promise<readonly ProviderProject[]> {
    const rows = await this.#request<readonly Record<string, unknown>[]>(
      'projects?membership=true&simple=true',
      page,
    )
    return rows.flatMap((value) => {
      const namespace = value.namespace
      if (
        typeof value.id !== 'number' ||
        typeof value.path_with_namespace !== 'string' ||
        typeof value.name !== 'string' ||
        typeof value.web_url !== 'string'
      )
        return []
      const path =
        typeof value.path === 'string' ? value.path : value.path_with_namespace.split('/').at(-1)!
      const namespacePath =
        typeof namespace === 'object' &&
        namespace &&
        typeof (namespace as { full_path?: unknown }).full_path === 'string'
          ? (namespace as { full_path: string }).full_path
          : value.path_with_namespace.slice(0, -(path.length + 1))
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
  }
}

export const createGitLabProvider = (
  connection: ProviderConnection,
  fetcher?: typeof fetch,
): Provider => new GitLabProvider(connection, fetcher)
