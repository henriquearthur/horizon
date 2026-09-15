import { describe, expect, it, vi } from 'vitest'
import { callReadTool, callWriteTool, McpToolError } from '../src/index.ts'

const project = {
  id: 1,
  path: 'alpha',
  namespace: 'team',
  name: 'Alpha',
  webUrl: '',
  groupPath: 'team',
}
const baseIssue = {
  id: 10,
  iid: 3,
  projectId: 1,
  title: 'Issue',
  state: 'opened' as const,
  webUrl: '',
  assignees: [],
  labels: [],
}
const scope = { groups: ['team'], projects: [], followGroups: ['team'] }

function fakeProvider() {
  const issue = { ...baseIssue }
  const comments: any[] = []
  return {
    listGroups: vi.fn(async () => ({ items: [{ id: 7, fullPath: 'team', name: 'Team' }] })),
    listProjects: vi.fn(async () => ({ items: [project] })),
    listUsers: vi.fn(async () => ({ items: [] })),
    listLabels: vi.fn(async () => ({ items: [{ id: 1, name: 'bug', color: '#f00' }] })),
    listIssues: vi.fn(async () => ({ items: [issue] })),
    searchDiscussions: vi.fn(async () => []),
    readScope: vi.fn(async () => ({
      groups: [{ id: 7, fullPath: 'team', name: 'Team' }],
      projects: [project],
      issues: [issue],
    })),
    readHierarchy: vi.fn(async () => new Map()),
    listComments: vi.fn(async () => comments),
    listViews: vi.fn(async () => [{ id: 'general', title: 'General', builtin: true }]),
    createComment: vi.fn(async (_p: number, _i: number, body: string) => {
      comments.push({ body })
      return comments.at(-1)
    }),
    createIssue: vi.fn(async (input: any) => ({ ...issue, ...input })),
    updateIssue: vi.fn(async () => issue),
    updateIssueProperties: vi.fn(async () => issue),
  } as any
}

describe('MCP contract with fake provider', () => {
  it('covers scope, collections, metadata, hierarchy and views', async () => {
    const provider = fakeProvider()
    const ctx = { provider, scope }
    expect(((await callReadTool(ctx, 'read_scope')) as any).projects).toHaveLength(1)
    expect(await callReadTool(ctx, 'list_groups')).toHaveLength(1)
    expect(await callReadTool(ctx, 'list_projects')).toHaveLength(1)
    expect(await callReadTool(ctx, 'list_issues')).toHaveLength(1)
    expect(
      ((await callReadTool(ctx, 'get_metadata', { reference: 'team/alpha#3' })) as any).labels,
    ).toHaveLength(1)
    expect(((await callReadTool(ctx, 'get_hierarchy')) as any).hierarchy).toBeInstanceOf(Map)
    expect(await callReadTool(ctx, 'list_views')).toEqual([
      { id: 'general', title: 'General', builtin: true },
    ])
  })

  it('covers mutations, lifecycle, references and validation errors', async () => {
    const provider = fakeProvider()
    const ctx = { provider, scope }
    await callWriteTool(ctx, 'create_issue', { projectId: 1, title: 'New' })
    await callWriteTool(ctx, 'create_comment', {
      reference: 'team/alpha#3',
      body: 'hello',
      model: 'm',
      harness: 'h',
      session_id: 's',
    })
    await callWriteTool(ctx, 'update_issue', { reference: 'team/alpha#3', title: 'Updated' })
    await callWriteTool(ctx, 'set_issue_properties', {
      reference: 'team/alpha#3',
      status: 'Em andamento',
      labels: ['bug'],
    })
    await callWriteTool(ctx, 'start_issue', {
      reference: 'team/alpha#3',
      model: 'm',
      harness: 'h',
      session_id: 's',
    })
    await expect(
      callWriteTool(ctx, 'create_issue', { projectId: 99, title: 'x' }),
    ).rejects.toMatchObject({ code: 'scope_error' })
    await expect(callReadTool(ctx, 'get_issue', { reference: '' })).rejects.toBeInstanceOf(
      McpToolError,
    )
    await expect(callReadTool(ctx, 'unknown')).rejects.toMatchObject({ code: 'not_found' })
  })
})
