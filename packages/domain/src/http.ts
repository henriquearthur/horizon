/**
 * One place where Horizon talks HTTP to GitLab.
 *
 * Every adapter goes through here so a self-hosted GitLab sees a single,
 * well-behaved client: bounded concurrency, a minimum spacing between calls and
 * a backoff that honours `Retry-After`. The gate is shared per host because the
 * adapters are cheap objects created per request.
 */

export type GitLabFailure = 'network' | 'timeout' | 'status' | 'invalid-response'

export class GitLabHttpError extends Error {
  readonly failure: GitLabFailure
  readonly status: number

  constructor(failure: GitLabFailure, status: number, message: string) {
    super(message)
    this.name = 'GitLabHttpError'
    this.failure = failure
    this.status = status
  }
}

export interface GitLabHttpOptions {
  readonly maxRetries?: number
  readonly retryDelayMs?: number
  readonly timeoutMs?: number
  /** How many requests may be in flight against one host. */
  readonly maxConcurrency?: number
  /** Minimum spacing between two requests to the same host. */
  readonly minIntervalMs?: number
}

const DEFAULTS = {
  maxRetries: 3,
  retryDelayMs: 700,
  timeoutMs: 20_000,
  maxConcurrency: 3,
  minIntervalMs: 120,
} as const

const sleep = (ms: number): Promise<void> =>
  ms > 0 ? new Promise((resolve) => setTimeout(resolve, ms)) : Promise.resolve()

/** Serializes requests to one host: at most N in flight, spaced in time. */
class HostGate {
  #active = 0
  #waiting: (() => void)[] = []
  #nextSlot = 0

  constructor(
    private readonly limit: number,
    private readonly spacing: number,
  ) {}

  async run<T>(task: () => Promise<T>): Promise<T> {
    if (this.#active >= this.limit) await new Promise<void>((resume) => this.#waiting.push(resume))
    this.#active += 1
    try {
      const now = Date.now()
      const slot = Math.max(now, this.#nextSlot)
      this.#nextSlot = slot + this.spacing
      await sleep(slot - now)
      return await task()
    } finally {
      this.#active -= 1
      this.#waiting.shift()?.()
    }
  }

  /** Hold every queued request for a while — used when GitLab answers 429. */
  holdFor(ms: number): void {
    this.#nextSlot = Math.max(this.#nextSlot, Date.now() + ms)
  }
}

const gates = new Map<string, HostGate>()
const gateFor = (host: string, limit: number, spacing: number): HostGate => {
  const existing = gates.get(host)
  if (existing) return existing
  const gate = new HostGate(limit, spacing)
  gates.set(host, gate)
  return gate
}

/** Exported for tests: forget the per-host throttling state. */
export const resetGitLabGates = (): void => gates.clear()

export const isTransientStatus = (status: number): boolean =>
  status === 408 || status === 429 || status >= 500

const retryAfterMs = (response: Response): number | undefined => {
  const header = response.headers.get('retry-after')
  if (!header) return undefined
  const seconds = Number(header)
  if (Number.isFinite(seconds)) return Math.max(0, seconds) * 1000
  const date = Date.parse(header)
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now())
}

/**
 * The GitLab institucional uses SEFA's private CA, which is not in Node's
 * default trust store. The exception stays restricted to that domain.
 */
const allowInstitutionalCertificate = (hostname: string): void => {
  if (!hostname.endsWith('.sefa.pa.gov.br')) return
  const runtime = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process
  if (runtime?.env) runtime.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
}

export class GitLabHttp {
  readonly baseUrl: URL
  readonly #prefix: string
  readonly #token: string
  readonly #fetch: typeof fetch
  readonly #options: Required<GitLabHttpOptions>
  readonly #gate: HostGate

  constructor(
    connection: { readonly url: string; readonly token: string },
    fetcher: typeof fetch = fetch,
    options: GitLabHttpOptions = {},
    onInvalidUrl?: (raw: string) => never,
  ) {
    let parsed: URL
    try {
      parsed = new URL(connection.url)
    } catch {
      if (onInvalidUrl) onInvalidUrl(connection.url)
      throw new GitLabHttpError('status', 400, 'Informe uma URL válida do GitLab.')
    }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      if (onInvalidUrl) onInvalidUrl(connection.url)
      throw new GitLabHttpError('status', 400, 'A URL do GitLab deve usar HTTP ou HTTPS.')
    }
    allowInstitutionalCertificate(parsed.hostname)
    this.baseUrl = parsed
    // A GitLab served under a subpath keeps it as the API prefix. Assigning to
    // `URL.pathname` cannot produce an empty path, so the prefix is kept apart.
    this.#prefix = parsed.pathname.replace(/\/+$/, '')
    this.#token = connection.token
    this.#fetch = fetcher
    this.#options = { ...DEFAULTS, ...stripUndefined(options) }
    this.#gate = gateFor(
      parsed.host,
      this.#options.maxConcurrency,
      Math.max(0, this.#options.minIntervalMs),
    )
  }

  /** Absolute URL of an API path, with pagination applied when asked for. */
  url(path: string, page?: number, perPage = 100): URL {
    const url = new URL(`${this.#prefix}/api/v4/${path}`, this.baseUrl)
    if (page !== undefined) {
      url.searchParams.set('page', String(page))
      url.searchParams.set('per_page', String(perPage))
    }
    return url
  }

  /**
   * Runs one request, retrying only what is safe to retry. Returns the parsed
   * JSON body together with the response, so callers can read pagination.
   */
  async json<T>(
    url: URL,
    init: RequestInit & { readonly retry?: boolean } = {},
  ): Promise<{ readonly value: T; readonly response: Response }> {
    const { retry = true, ...request } = init
    const attempts = retry ? Math.max(0, this.#options.maxRetries) : 0
    let lastError: GitLabHttpError | undefined

    for (let attempt = 0; ; attempt += 1) {
      const response = await this.#gate.run(async () => {
        try {
          return await this.#fetch(url, {
            ...request,
            headers: {
              'PRIVATE-TOKEN': this.#token,
              Accept: 'application/json',
              ...(request.body ? { 'Content-Type': 'application/json' } : {}),
              ...(request.headers as Record<string, string> | undefined),
            },
            signal: request.signal ?? AbortSignal.timeout(this.#options.timeoutMs),
          })
        } catch (cause) {
          const timedOut = cause instanceof Error && cause.name === 'TimeoutError'
          return new GitLabHttpError(
            timedOut ? 'timeout' : 'network',
            timedOut ? 504 : 503,
            'Não foi possível conectar ao GitLab.',
          )
        }
      })

      if (response instanceof GitLabHttpError) {
        lastError = response
      } else if (response.ok) {
        try {
          return { value: (await response.json()) as T, response }
        } catch {
          throw new GitLabHttpError('invalid-response', 502, 'Resposta inválida do GitLab.')
        }
      } else {
        if (response.status === 429)
          this.#gate.holdFor(retryAfterMs(response) ?? this.#options.retryDelayMs * 4)
        lastError = new GitLabHttpError('status', response.status, statusMessage(response.status))
        if (!isTransientStatus(response.status)) throw lastError
      }

      if (attempt >= attempts) throw lastError
      await sleep(this.#options.retryDelayMs * 2 ** attempt)
    }
  }
}

const statusMessage = (status: number): string =>
  status === 401
    ? 'Token inválido ou expirado.'
    : status === 403
      ? 'Token sem permissão para acessar o GitLab.'
      : status === 429
        ? 'O GitLab recusou novas requisições por excesso de chamadas.'
        : status === 404
          ? 'O GitLab não encontrou o recurso solicitado.'
          : `GitLab respondeu ${status}.`

const stripUndefined = <T extends object>(value: T): Partial<T> =>
  Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as Partial<T>

/** `x-next-page` as a number, when GitLab says another page exists. */
export const nextPageOf = (response: Response): number | undefined => {
  const header = response.headers.get('x-next-page')
  const value = header ? Number(header) : 0
  return Number.isFinite(value) && value > 0 ? value : undefined
}
