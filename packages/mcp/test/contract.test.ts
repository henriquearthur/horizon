import { describe, expect, it, vi } from 'vitest'
import { allTools, callReadTool, callWriteTool, McpToolError } from '../src/index.ts'

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
  it('covers scope, collections, metadata and hierarchy', async () => {
    const provider = fakeProvider()
    const ctx = { provider, scope }
    expect(((await callReadTool(ctx, 'read_scope')) as any).projects).toHaveLength(1)
    expect(await callReadTool(ctx, 'list_groups')).toHaveLength(1)
    expect(await callReadTool(ctx, 'list_projects')).toHaveLength(1)
    expect(((await callReadTool(ctx, 'list_issues')) as any).items).toHaveLength(1)
    expect(
      ((await callReadTool(ctx, 'get_metadata', { reference: 'team/alpha#3' })) as any).labels,
    ).toHaveLength(1)
    expect(((await callReadTool(ctx, 'get_hierarchy')) as any).issues[0]).not.toHaveProperty(
      'description',
    )
    expect(((await callReadTool(ctx, 'get_hierarchy')) as any).hierarchy).toBeInstanceOf(Map)
  })

  it('covers mutations, lifecycle, references and validation errors', async () => {
    const provider = fakeProvider()
    const ctx = { provider, scope }
    await callWriteTool(ctx, 'create_issue', { project_path: 'team/alpha', title: 'New' })
    await callWriteTool(ctx, 'create_comment', {
      reference: 'team/alpha#3',
      body: 'hello',
      model: 'm',
      harness: 'h',
      session_id: 's',
    })
    await callWriteTool(ctx, 'update_issue', { reference: 'team/alpha#3', title: 'Updated' })
    // `reference` is a routing argument and never reaches the Provider.
    expect(provider.updateIssue).toHaveBeenCalledWith(1, 3, { title: 'Updated' })
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
      callWriteTool(ctx, 'create_issue', { project_id: 99, title: 'x' }),
    ).rejects.toMatchObject({ code: 'scope_error' })
    await expect(callReadTool(ctx, 'get_issue', { reference: '' })).rejects.toBeInstanceOf(
      McpToolError,
    )
    await expect(callReadTool(ctx, 'unknown')).rejects.toMatchObject({ code: 'not_found' })
  })

  it('preserves applied status when assignment fails after the transition', async () => {
    const provider = fakeProvider()
    provider.updateIssue.mockRejectedValueOnce(new Error('assignment unavailable'))
    const ctx = { provider, scope }

    await expect(
      callWriteTool(ctx, 'start_issue', {
        reference: 'team/alpha#3',
        model: 'm',
        harness: 'h',
        session_id: 's',
        assigneeIds: [42],
      }),
    ).rejects.toMatchObject({
      code: 'provider_error',
      details: {
        effects: { status: 'applied', assignment: 'failed' },
      },
    })
    expect(provider.updateIssueProperties).toHaveBeenCalledOnce()
  })

  it('rejects labels that are not in project metadata unless explicitly opted in', async () => {
    const provider = fakeProvider()
    const ctx = { provider, scope }
    await expect(
      callWriteTool(ctx, 'create_issue', { project_id: 1, title: 'x', labels: ['type:chore'] }),
    ).rejects.toMatchObject({ code: 'validation_error' })
    await callWriteTool(ctx, 'create_issue', {
      project_id: 1,
      title: 'x',
      labels: ['type:chore'],
      createMissingLabels: true,
    })
    expect(provider.createIssue).toHaveBeenCalledWith(
      expect.objectContaining({ labels: ['type:chore'] }),
    )
  })
})

describe('MCP tool catalogue and session metadata', () => {
  it('only advertises tools that are implemented', () => {
    const names = allTools().map((tool) => tool.name)
    expect(names).not.toContain('create_sub_issue')
    expect(names).not.toContain('list_views')
  })

  it('declares the schema of every write field', () => {
    const declared = (name: string) =>
      Object.keys(allTools().find((tool) => tool.name === name)!.inputSchema.properties)
    expect(declared('update_issue')).toEqual(
      expect.arrayContaining([
        'reference',
        'title',
        'description',
        'labels',
        'assigneeIds',
        'state',
      ]),
    )
    const properties = allTools().find((tool) => tool.name === 'set_issue_properties')!.inputSchema
      .properties as any
    expect(properties.status.enum).toContain('Em andamento')
    expect(properties.priority.enum).toContain('P1 urgente')
    expect(properties.assigneeIds.items).toEqual({ type: 'number' })
  })

  it('takes agent identification from the connection and rejects unknown arguments', async () => {
    const provider = fakeProvider()
    const ctx = { provider, scope, session: { model: 'm', harness: 'h', session_id: 's' } }
    await callWriteTool(ctx, 'create_comment', { reference: 'team/alpha#3', body: 'hi' })
    expect(provider.createComment).toHaveBeenCalledWith(
      1,
      3,
      expect.stringContaining('**Model:** `m`'),
    )
    await callWriteTool(ctx, 'create_comment', {
      reference: 'team/alpha#3',
      body: 'hi',
      model: 'override',
    })
    expect(provider.createComment).toHaveBeenLastCalledWith(
      1,
      3,
      expect.stringContaining('**Model:** `override`'),
    )
    await expect(
      callWriteTool({ provider, scope }, 'create_comment', {
        reference: 'team/alpha#3',
        body: 'hi',
      }),
    ).rejects.toMatchObject({ code: 'validation_error' })
    await expect(
      callWriteTool(ctx, 'update_issue', { reference: 'team/alpha#3', status: 'Concluído' }),
    ).rejects.toMatchObject({ code: 'validation_error', details: { unknown: ['status'] } })
  })

  it('accepts the P1 shorthand and refuses unknown property values', async () => {
    const provider = fakeProvider()
    const ctx = { provider, scope }
    await callWriteTool(ctx, 'set_issue_properties', {
      reference: 'team/alpha#3',
      priority: 'P1',
      status: 'em andamento',
    })
    expect(provider.updateIssueProperties).toHaveBeenCalledWith(1, 3, {
      status: 'Em andamento',
      priority: 'P1 urgente',
    })
    await expect(
      callWriteTool(ctx, 'set_issue_properties', { reference: 'team/alpha#3', status: 'Doing' }),
    ).rejects.toMatchObject({ code: 'validation_error' })
  })

  it('treats an unreadable Status as a conflict instead of Backlog', async () => {
    const provider = fakeProvider()
    provider.readScope = vi.fn(async () => ({
      groups: [],
      projects: [project],
      issues: [{ ...baseIssue, labels: ['horizon::status::doing'] }],
    }))
    await expect(
      callWriteTool(
        { provider, scope, session: { model: 'm', harness: 'h', session_id: 's' } },
        'start_issue',
        { reference: 'team/alpha#3' },
      ),
    ).rejects.toMatchObject({ code: 'conflict' })
    expect(provider.updateIssueProperties).not.toHaveBeenCalled()
  })

  it('reads a lowercase legacy Status as its canonical value', async () => {
    const provider = fakeProvider()
    provider.readScope = vi.fn(async () => ({
      groups: [],
      projects: [project],
      issues: [{ ...baseIssue, labels: ['horizon::status::backlog'] }],
    }))
    const result: any = await callReadTool({ provider, scope }, 'list_issues', {})
    expect(result.items[0].status).toBe('Backlog')
    expect(result.items[0]).not.toHaveProperty('statusConflict')
  })
})
