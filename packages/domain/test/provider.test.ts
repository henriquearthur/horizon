import { describe, expect, it, vi } from 'vitest'
import { GitLabProvider, ProviderError } from '../src/provider.ts'

const response = (value: unknown, init: ResponseInit = {}) =>
  new Response(JSON.stringify(value), {
    status: 200,
    headers: { 'content-type': 'application/json' },
    ...init,
  })

describe('GitLabProvider', () => {
  it('validates a connection and maps groups and projects', async () => {
    const fetcher = vi.fn<typeof fetch>((input) => {
      const path = new URL(input.toString()).pathname
      if (path.endsWith('/user'))
        return Promise.resolve(response({ id: 7, username: 'paulo', name: 'Paulo' }))
      if (path.endsWith('/groups'))
        return Promise.resolve(response([{ id: 1, full_path: 'platform', name: 'Platform' }]))
      return Promise.resolve(
        response([
          {
            id: 10,
            path: 'horizon',
            name: 'Horizon',
            path_with_namespace: 'platform/horizon',
            web_url: 'https://gitlab/platform/horizon',
            namespace: { full_path: 'platform' },
          },
        ]),
      )
    })
    const provider = new GitLabProvider(
      { url: 'https://gitlab.example/', token: 'secret' },
      fetcher,
    )
    await expect(provider.validateConnection()).resolves.toEqual({
      id: 7,
      username: 'paulo',
      name: 'Paulo',
    })
    await expect(provider.listGroups()).resolves.toEqual([
      { id: 1, fullPath: 'platform', name: 'Platform' },
    ])
    await expect(provider.listProjects()).resolves.toEqual([
      {
        id: 10,
        path: 'horizon',
        name: 'Horizon',
        namespace: 'platform',
        groupPath: 'platform',
        webUrl: 'https://gitlab/platform/horizon',
      },
    ])
    expect(fetcher.mock.calls[0]?.[1]).toEqual(
      expect.objectContaining({ headers: expect.objectContaining({ 'PRIVATE-TOKEN': 'secret' }) }),
    )
  })

  it('turns HTTP failures into clear, typed errors', async () => {
    const provider = new GitLabProvider(
      { url: 'https://gitlab.example', token: 'bad' },
      vi.fn<typeof fetch>(() => Promise.resolve(response({}, { status: 401 }))),
    )
    await expect(provider.validateConnection()).rejects.toMatchObject<Partial<ProviderError>>({
      code: 'unauthorized',
      status: 401,
      message: 'Token inválido ou expirado.',
    })
  })

  it('rejects malformed connection URLs', () => {
    expect(() => new GitLabProvider({ url: 'gitlab.example', token: 'secret' })).toThrow(
      'Informe uma URL válida',
    )
  })
})
