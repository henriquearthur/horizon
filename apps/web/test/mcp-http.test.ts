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
    listViews: async () => [{ id: 'general', title: 'General', builtin: true }],
  }
  return { reader: () => p, writer: () => ({}), providerSnapshot: p.readScope }
})
vi.mock('../src/server/scope-store', () => ({
  scopeStore: { getScope: async () => ({ groups: [], projects: [], followGroups: [] }) },
}))
import { mcpHandler } from '../src/server/mcp-http'

const version = '2026-07-28'
const rpc = async (
  method: string,
  params: Record<string, unknown> = {},
  headerOverrides: Record<string, string> = {},
) => {
  const requestParams = {
    ...params,
    _meta: {
      'io.modelcontextprotocol/protocolVersion': version,
      'io.modelcontextprotocol/clientInfo': { name: 'horizon-test', version: '1.0.0' },
      'io.modelcontextprotocol/clientCapabilities': {},
    },
  }
  return mcpHandler(
    new Request('http://x/mcp', {
      method: 'POST',
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params: requestParams }),
      headers: {
        accept: 'application/json, text/event-stream',
        'content-type': 'application/json',
        'mcp-protocol-version': version,
        'mcp-method': method,
        ...(method === 'tools/call' && typeof params.name === 'string'
          ? { 'mcp-name': params.name }
          : {}),
        ...headerOverrides,
      },
    }),
  )
}

describe('MCP 2026-07-28 stateless Streamable HTTP contract', () => {
  it('discovers the server without an initialization handshake', async () => {
    const response: any = await (await rpc('server/discover')).json()
    expect(response.result).toMatchObject({
      resultType: 'complete',
      supportedVersions: [version],
      capabilities: { tools: {} },
      ttlMs: 3_600_000,
      cacheScope: 'public',
      _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'horizon', version: '0.0.0' } },
    })
  })

  it('lists and calls tools with complete, self-described results', async () => {
    const list: any = await (await rpc('tools/list')).json()
    expect(list.result.tools.length).toBeGreaterThan(5)
    expect(list.result).toMatchObject({
      resultType: 'complete',
      ttlMs: 3_600_000,
      cacheScope: 'public',
    })

    const call: any = await (await rpc('tools/call', { name: 'read_scope', arguments: {} })).json()
    expect(call.result.resultType).toBe('complete')
    expect(call.result.structuredContent).toEqual({ groups: [], projects: [] })
  })

  it('rejects missing or mismatched routing metadata', async () => {
    const missingMethod: any = await (await rpc('tools/list', {}, { 'mcp-method': '' })).json()
    expect(missingMethod.error.code).toBe(-32020)

    const wrongName: any = await (
      await rpc('tools/call', { name: 'list_views' }, { 'mcp-name': 'read_scope' })
    ).json()
    expect(wrongName.error.code).toBe(-32020)
  })

  it('reports unsupported protocol versions', async () => {
    const unsupportedRequest = new Request('http://x/mcp', {
      method: 'POST',
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': '1900-01-01',
            'io.modelcontextprotocol/clientCapabilities': {},
          },
        },
      }),
      headers: {
        'mcp-protocol-version': '1900-01-01',
        'mcp-method': 'tools/list',
      },
    })
    const unsupported = await mcpHandler(unsupportedRequest)
    const unsupportedBody: any = await unsupported.json()
    expect(unsupported.status).toBe(400)
    expect(unsupportedBody.error).toMatchObject({
      code: -32022,
      data: { supported: [version], requested: '1900-01-01' },
    })
  })

  it('guards the endpoint and rejects unknown methods', async () => {
    expect((await rpc('missing')).status).toBe(404)
    expect((await mcpHandler(new Request('http://x', { method: 'GET' }))).status).toBe(405)
    expect(
      (await mcpHandler(new Request('http://x', { headers: { origin: 'https://evil.test' } })))
        .status,
    ).toBe(403)
    expect((await mcpHandler(new Request('http://x', { method: 'POST', body: '{' }))).status).toBe(
      400,
    )
    expect(
      (await mcpHandler(new Request('http://x', { method: 'POST', body: 'null' }))).status,
    ).toBe(400)
  })
})
