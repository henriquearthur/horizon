import { afterEach, describe, expect, it, vi } from 'vitest'
import { GitLabHttp, GitLabHttpError, nextPageOf, resetGitLabGates } from '../src/http.ts'

const json = (value: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(value), {
    headers: { 'content-type': 'application/json' },
    ...init,
  })

const http = (fetcher: typeof fetch, options = {}) =>
  new GitLabHttp({ url: 'https://gitlab.example', token: 'secret' }, fetcher, {
    retryDelayMs: 1,
    minIntervalMs: 0,
    ...options,
  })

describe('GitLabHttp', () => {
  afterEach(() => resetGitLabGates())

  it('keeps a subpath install as the API prefix', () => {
    const client = http(vi.fn<typeof fetch>())
    expect(client.url('user', 1).pathname).toBe('/api/v4/user')

    const nested = new GitLabHttp(
      { url: 'https://host/gitlab/', token: 'x' },
      vi.fn<typeof fetch>(),
    )
    expect(nested.url('user').pathname).toBe('/gitlab/api/v4/user')
  })

  it('retries a 429 and gives up with a typed error', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValue(json({}, { status: 429, headers: { 'retry-after': '0' } }))

    await expect(
      http(fetcher, { maxRetries: 2 }).json(http(fetcher).url('projects')),
    ).rejects.toMatchObject({ name: 'GitLabHttpError', status: 429 })
    expect(fetcher).toHaveBeenCalledTimes(3)
  })

  it('does not retry a client error', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({}, { status: 401 }))

    await expect(http(fetcher).json(http(fetcher).url('user'))).rejects.toMatchObject({
      status: 401,
      message: 'Token inválido ou expirado.',
    })
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('never retries when the caller opts out', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(json({}, { status: 503 }))
    const client = http(fetcher)

    await expect(
      client.json(client.url('issues'), { method: 'POST', retry: false }),
    ).rejects.toBeInstanceOf(GitLabHttpError)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('spaces requests to the same host', async () => {
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(json([])))
    const client = http(fetcher, { minIntervalMs: 30, maxConcurrency: 1 })
    const started = Date.now()

    await Promise.all([
      client.json(client.url('a')),
      client.json(client.url('b')),
      client.json(client.url('c')),
    ])

    expect(Date.now() - started).toBeGreaterThanOrEqual(55)
  })

  it('reads the next page only when GitLab announces one', () => {
    expect(nextPageOf(json([], { headers: { 'x-next-page': '2' } }))).toBe(2)
    expect(nextPageOf(json([], { headers: { 'x-next-page': '' } }))).toBeUndefined()
    expect(nextPageOf(json([]))).toBeUndefined()
  })
})
