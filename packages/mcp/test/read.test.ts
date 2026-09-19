import { describe, expect, it } from 'vitest'
import { callReadTool, readTools } from '../src/index.ts'
import type { ProviderReadContract } from '@horizon/domain'
const project = {
  id: 1,
  path: 'alpha',
  namespace: 'team',
  name: 'Alpha',
  webUrl: 'https://x',
  groupPath: 'team',
}
const issue = {
  id: 2,
  iid: 3,
  projectId: 1,
  title: 'Test',
  state: 'opened' as const,
  webUrl: 'https://x/i/3',
  assignees: [{ id: 9, username: 'ana', name: 'Ana' }],
  labels: ['type:ticket', 'horizon::status::Em andamento', 'horizon::priority::P2 alta'],
  description: 'long body',
  updatedAt: '2026-09-10T12:00:00Z',
}
const other = {
  ...issue,
  id: 4,
  iid: 4,
  title: 'Other',
  state: 'closed' as const,
  assignees: [],
  labels: [],
  description: '',
  updatedAt: '2026-08-01T12:00:00Z',
}
const provider: ProviderReadContract = {
  listGroups: async () => ({ items: [] }),
  listProjects: async () => ({ items: [project] }),
  listUsers: async () => ({ items: [] }),
  listLabels: async () => ({ items: [] }),
  listIssues: async () => ({ items: [issue] }),
  searchDiscussions: async () => [],
  readScope: async () => ({ groups: [], projects: [project], issues: [issue, other] }),
}
const ctx = { provider, scope: { groups: ['team'], projects: [], followGroups: ['team'] } }

describe('read MCP tools', () => {
  it('discovers tools and resolves technical, numeric and friendly references', async () => {
    expect(readTools().some((t) => t.name === 'get_issue')).toBe(true)
    const r: any = await callReadTool(ctx, 'get_issue', { reference: 'team/alpha#3' })
    expect(r.reference.technical).toBe('team/alpha#3')
    expect(r.description).toBe('long body')
    const numeric: any = await callReadTool(ctx, 'get_issue', { reference: '1#3' })
    expect(numeric.reference.technical).toBe('team/alpha#3')
  })

  it('answers read_scope with catalogue and counts instead of issues', async () => {
    const result: any = await callReadTool(ctx, 'read_scope')
    expect(result).not.toHaveProperty('issues')
    expect(result.counts).toEqual({
      groups: 0,
      projects: 1,
      issues: 2,
      openIssues: 1,
      closedIssues: 1,
    })
    expect(result.projects[0]).toMatchObject({ path: 'team/alpha', issues: { total: 2, open: 1 } })
  })

  it('filters, projects and paginates list_issues', async () => {
    const summary: any = await callReadTool(ctx, 'list_issues', { limit: 1 })
    expect(summary.total).toBe(2)
    expect(summary.nextCursor).toBe('1')
    expect(summary.items[0]).not.toHaveProperty('description')
    // The reference is emitted in the shape the other tools accept.
    expect(summary.items[0].reference.technical).toBe('team/alpha#3')
    expect(summary.items[0].labels).toEqual(['type:ticket'])
    expect(summary.items[0].status).toBe('Em andamento')

    const full: any = await callReadTool(ctx, 'list_issues', { fields: 'full' })
    expect(full.items[0].description).toBe('long body')

    const byStatus: any = await callReadTool(ctx, 'list_issues', {
      status: 'Em andamento',
      priority: 'P2',
      project_path: 'team/alpha',
      assignee: 'ana',
      state: 'opened',
      labels: ['type:ticket'],
      updated_since: '2026-09-01T00:00:00Z',
      search: 'test',
    })
    expect(byStatus.items).toHaveLength(1)
    expect(byStatus.items[0].iid).toBe(3)

    const unassigned: any = await callReadTool(ctx, 'list_issues', { assignee: 'none' })
    expect(unassigned.items.map((i: any) => i.iid)).toEqual([4])
    const closed: any = await callReadTool(ctx, 'list_issues', { state: 'closed' })
    expect(closed.total).toBe(1)
  })

  it('rejects unknown parameters and invalid filter values', async () => {
    await expect(callReadTool(ctx, 'list_issues', { assigned_to: 'ana' })).rejects.toMatchObject({
      code: 'validation_error',
      details: { unknown: ['assigned_to'] },
    })
    await expect(callReadTool(ctx, 'list_issues', { status: 'Doing' })).rejects.toMatchObject({
      code: 'validation_error',
    })
    await expect(
      callReadTool(ctx, 'list_issues', { updated_since: 'yesterday' }),
    ).rejects.toMatchObject({ code: 'validation_error' })
    await expect(
      callReadTool(ctx, 'list_issues', { project_path: 'team/ghost' }),
    ).rejects.toMatchObject({ code: 'scope_error' })
  })

  it('gets project metadata by path, by id and by reference', async () => {
    expect(((await callReadTool(ctx, 'get_metadata', { project_id: 1 })) as any).projectId).toBe(1)
    expect(
      ((await callReadTool(ctx, 'get_metadata', { project_path: 'team/alpha' })) as any).projectId,
    ).toBe(1)
    await expect(callReadTool(ctx, 'get_metadata', {})).rejects.toMatchObject({
      code: 'validation_error',
    })
  })

  it('returns structured ambiguity errors', async () => {
    const p: any = { ...project, id: 2, path: 'alpha_beta' }
    const base: any = { ...project, path: 'alpha-beta' }
    const pr: any = {
      ...provider,
      readScope: async () => ({
        groups: [],
        projects: [base, p],
        issues: [
          { ...issue, projectId: 1 },
          { ...issue, projectId: 2 },
        ],
      }),
    }
    await expect(
      callReadTool(
        { provider: pr, scope: { groups: ['team'], projects: [], followGroups: ['team'] } },
        'get_issue',
        { reference: 'AB-3' },
      ),
    ).rejects.toMatchObject({ code: 'conflict' })
  })
})
