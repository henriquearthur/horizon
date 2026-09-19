import { describe, expect, it } from 'vitest'
import { callReadTool, readTools, McpToolError } from '../src/index.ts'
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
  assignees: [],
  labels: [],
  description: 'long body',
}
const provider: ProviderReadContract = {
  listGroups: async () => ({ items: [] }),
  listProjects: async () => ({ items: [project] }),
  listUsers: async () => ({ items: [] }),
  listLabels: async () => ({ items: [] }),
  listIssues: async () => ({ items: [issue] }),
  searchDiscussions: async () => [],
  readScope: async () => ({ groups: [], projects: [project], issues: [issue] }),
}
describe('read MCP tools', () => {
  it('discovers tools and resolves technical references', async () => {
    expect(readTools().some((t) => t.name === 'get_issue')).toBe(true)
    const r: any = await callReadTool(
      { provider, scope: { groups: ['team'], projects: [], followGroups: ['team'] } },
      'get_issue',
      { reference: 'team/alpha#3' },
    )
    expect(r.reference.technical).toBe('team/alpha#3')
  })

  it('keeps scope and issue reads bounded and filterable', async () => {
    const ctx = { provider, scope: { groups: ['team'], projects: [], followGroups: ['team'] } }
    const scopeResult: any = await callReadTool(ctx, 'read_scope')
    expect(scopeResult).not.toHaveProperty('issues')
    const result: any = await callReadTool(ctx, 'list_issues', { limit: 1 })
    expect(result.items).toHaveLength(1)
    expect(result.items[0]).not.toHaveProperty('description')
    const verbose: any = await callReadTool(ctx, 'list_issues', { verbose: true })
    expect(verbose.items[0].description).toBe('long body')
  })

  it('gets project metadata without resolving an issue', async () => {
    const result: any = await callReadTool(
      { provider, scope: { groups: ['team'], projects: [], followGroups: ['team'] } },
      'get_metadata',
      { projectId: 1 },
    )
    expect(result.projectId).toBe(1)
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
