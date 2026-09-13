import { describe, expect, it, vi } from 'vitest'
import { GitLabReadProvider } from '../src/provider-read.ts'

describe('GitLabReadProvider', () => {
  it('maps paginated projects and issues and restricts issues to the Escopo', async () => {
    const fetcher = vi.fn<typeof fetch>((input) => {
      const url = new URL(input.toString())
      if (url.pathname.endsWith('/projects'))
        return Promise.resolve(
          new Response(
            JSON.stringify([
              {
                id: 1,
                path: 'app',
                name: 'App',
                path_with_namespace: 'team/app',
                web_url: 'https://g/team/app',
              },
              {
                id: 2,
                path: 'other',
                name: 'Other',
                path_with_namespace: 'other',
                web_url: 'https://g/other',
              },
            ]),
            { headers: { 'x-next-page': '' } },
          ),
        )
      return Promise.resolve(
        new Response(
          JSON.stringify([
            {
              id: 11,
              iid: 3,
              title: 'Bug',
              state: 'opened',
              web_url: 'https://g/team/app/-/issues/3',
              labels: ['bug'],
              assignees: [],
            },
          ]),
          { headers: { 'x-next-page': '' } },
        ),
      )
    })
    const result = await new GitLabReadProvider(
      { url: 'https://gitlab.example', token: 'secret' },
      fetcher,
    ).readScope({ groups: [], projects: [1], followGroups: [] })
    expect(result.projects).toHaveLength(1)
    expect(result.issues[0]).toMatchObject({ projectId: 1, title: 'Bug', labels: ['bug'] })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('exposes permission errors from the Provider', async () => {
    const provider = new GitLabReadProvider(
      { url: 'https://gitlab.example', token: 'bad' },
      vi.fn<typeof fetch>(() => Promise.resolve(new Response('{}', { status: 403 }))),
    )
    await expect(provider.listProjects()).rejects.toThrow('sem permissão')
  })

  it('includes projects reached through inherited group access', async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify([]), { headers: { 'x-next-page': '' } })),
    )
    await new GitLabReadProvider(
      { url: 'https://gitlab.example', token: 'x' },
      fetcher,
    ).listProjects()
    const url = new URL(fetcher.mock.calls[0]![0].toString())
    expect(url.searchParams.get('min_access_level')).toBe('10')
    expect(url.searchParams.get('membership')).toBeNull()
  })

  it('retries transient reads and eventually succeeds', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{}', { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([]), { headers: { 'x-next-page': '' } }))
    await expect(
      new GitLabReadProvider({ url: 'https://gitlab.example', token: 'x' }, fetcher).listProjects(),
    ).resolves.toEqual({ items: [] })
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('stops after the configured retry limit', async () => {
    const fetcher = vi.fn<typeof fetch>(() => Promise.resolve(new Response('{}', { status: 503 })))
    await expect(
      new GitLabReadProvider({ url: 'https://gitlab.example', token: 'x' }, fetcher, {
        maxRetries: 1,
      }).listProjects(),
    ).rejects.toThrow('503')
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('searches discussion notes only in the scoped project ids', async () => {
    const fetcher = vi.fn<typeof fetch>(() =>
      Promise.resolve(new Response(JSON.stringify([{ noteable_iid: 42 }]))),
    )
    const provider = new GitLabReadProvider({ url: 'https://gitlab.example', token: 'x' }, fetcher)

    await expect(provider.searchDiscussions('timeout', [7])).resolves.toEqual([
      { projectId: 7, iid: 42 },
    ])
    expect(fetcher).toHaveBeenCalledOnce()
    const url = new URL(fetcher.mock.calls[0]![0].toString())
    expect(url.pathname).toBe('/api/v4/projects/7/search')
    expect(url.searchParams.get('scope')).toBe('notes')
    expect(url.searchParams.get('search')).toBe('timeout')
  })
})
