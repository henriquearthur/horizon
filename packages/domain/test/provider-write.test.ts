import { describe, expect, it, vi } from 'vitest'
import { GitLabWriteProvider, ProviderWriteError } from '../src/provider-write.ts'

const issue = (overrides = {}) => ({ id: 10, iid: 3, title: 'Falha', description: 'Detalhes', state: 'opened', web_url: 'https://gitlab/team/app/-/issues/3', labels: ['bug'], assignees: [], ...overrides })

describe('GitLabWriteProvider', () => {
  it('creates and edits issues using GitLab fields', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify(issue()))).mockResolvedValueOnce(new Response(JSON.stringify(issue({ title: 'Corrigida' }))))
    const provider = new GitLabWriteProvider({ url: 'https://gitlab.example', token: 'secret' }, fetcher)
    await provider.createIssue({ projectId: 7, title: 'Falha', description: 'Detalhes', assigneeIds: [2], labels: ['bug', 'api'] })
    await provider.updateIssue(7, 3, { title: 'Corrigida', assigneeIds: [] })
    expect(fetcher.mock.calls[0]?.[0].toString()).toContain('/api/v4/projects/7/issues')
    expect(fetcher.mock.calls[0]?.[1]).toMatchObject({ method: 'POST', body: JSON.stringify({ title: 'Falha', description: 'Detalhes', assignee_ids: [2], labels: 'bug,api' }) })
    expect(fetcher.mock.calls[1]?.[1]).toMatchObject({ method: 'PUT', body: JSON.stringify({ title: 'Corrigida', assignee_ids: [] }) })
  })

  it('retries safe PUT mutations but never retries POST', async () => {
    const issue = { id: 10, iid: 3, title: 'x', description: '', state: 'opened', web_url: 'https://g/i', labels: [], assignees: [] }
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response('{}', { status: 503 })).mockResolvedValueOnce(new Response(JSON.stringify(issue)))
    await expect(new GitLabWriteProvider({ url: 'https://gitlab.example', token: 'x' }, fetcher).updateIssue(1, 3, { title: 'x' })).resolves.toMatchObject({ title: 'x' })
    expect(fetcher).toHaveBeenCalledTimes(2)
    const post = vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 503 }))
    await expect(new GitLabWriteProvider({ url: 'https://gitlab.example', token: 'x' }, post).createComment(1, 3, 'x')).rejects.toThrow()
    expect(post).toHaveBeenCalledTimes(1)
  })

  it('reads and publishes comments and sends close/reopen events', async () => {
    const note = { id: 8, body: 'Concordo', created_at: '2026-09-12T10:00:00Z', system: false, author: { id: 2, username: 'ana', name: 'Ana' } }
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(new Response(JSON.stringify([note]))).mockResolvedValueOnce(new Response(JSON.stringify(note))).mockResolvedValueOnce(new Response(JSON.stringify(issue({ state: 'closed' })))).mockResolvedValueOnce(new Response(JSON.stringify(issue())) )
    const provider = new GitLabWriteProvider({ url: 'https://gitlab.example', token: 'secret' }, fetcher)
    expect(await provider.listComments(7, 3)).toHaveLength(1)
    expect((await provider.createComment(7, 3, 'Concordo')).author?.name).toBe('Ana')
    await provider.setIssueState(7, 3, 'closed'); await provider.setIssueState(7, 3, 'opened')
    expect(fetcher.mock.calls[2]?.[1]?.body).toBe(JSON.stringify({ state_event: 'close' }))
    expect(fetcher.mock.calls[3]?.[1]?.body).toBe(JSON.stringify({ state_event: 'reopen' }))
  })

  it('exposes a specific permission error without hiding the action', async () => {
    const provider = new GitLabWriteProvider({ url: 'https://gitlab.example', token: 'secret' }, vi.fn<typeof fetch>().mockResolvedValue(new Response('{}', { status: 403 })))
    await expect(provider.createComment(7, 3, 'Oi')).rejects.toEqual(expect.objectContaining<Partial<ProviderWriteError>>({ code: 'forbidden', status: 403, message: expect.stringContaining('permissão') }))
  })
})
