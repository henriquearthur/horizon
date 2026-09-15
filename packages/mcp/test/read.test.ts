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
