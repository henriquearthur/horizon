import { describe, expect, it, vi } from 'vitest'

vi.mock('../src/server/gitlab', () => {
  const p = {
    readScope: async () => ({ groups: [], projects: [], issues: [] }),
    listGroups: async () => ({ items: [] }),
    listProjects: async () => ({ items: [] }),
    listUsers: async () => ({ items: [] }),
    listLabels: async () => ({ items: [] }),
    listIssues: async () => ({ items: [] }),
    searchDiscussions: async () => [],
  }
  return { reader: () => p, writer: () => ({}) }
})
vi.mock('../src/server/scope-store', () => ({
  scopeStore: { getScope: async () => ({ groups: [], projects: [], followGroups: [] }) },
}))
import { mcpHandler } from '../src/server/mcp-http'

const rpc = async (method: string, params?: any) =>
  mcpHandler(
    new Request('http://x/mcp', {
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
      headers: { 'content-type': 'application/json' },
    }),
  )

describe('MCP streamable HTTP contract', () => {
  it('supports initialize, tools/list and tools/call', async () => {
    expect(((await (await rpc('initialize')).json()) as any).result.protocolVersion).toBe(
      '2025-03-26',
    )
    expect(((await (await rpc('tools/list')).json()) as any).result.tools.length).toBeGreaterThan(5)
    const result: any = await (
      await rpc('tools/call', { name: 'list_views', arguments: {} })
    ).json()
    expect(result.result.structuredContent[0].id).toBe('general')
  })
  it('returns JSON-RPC errors and method guardrails', async () => {
    expect((await rpc('missing')).status).toBe(400)
    expect((await mcpHandler(new Request('http://x', { method: 'GET' }))).status).toBe(405)
    expect((await mcpHandler(new Request('http://x', { method: 'POST', body: '{' }))).status).toBe(
      400,
    )
  })
})
