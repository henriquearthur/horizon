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
    expect(call.result.structuredContent).toEqual({
      groups: [],
      projects: [],
      counts: { groups: 0, projects: 0, issues: 0, openIssues: 0, closedIssues: 0 },
    })
  })

  it('rejects missing or mismatched routing metadata', async () => {
    const missingMethod: any = await (await rpc('tools/list', {}, { 'mcp-method': '' })).json()
    expect(missingMethod.error.code).toBe(-32020)

    const wrongName: any = await (
      await rpc('tools/call', { name: 'list_issues' }, { 'mcp-name': 'read_scope' })
    ).json()
    expect(wrongName.error.code).toBe(-32020)
  })

  it('serves clients advertising another protocol revision', async () => {
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
    expect(unsupported.status).toBe(200)
    expect(unsupportedBody.result.tools.length).toBeGreaterThan(5)
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

describe('MCP standard Streamable HTTP contract', () => {
  it('negotiates a session and serves Codex-style requests', async () => {
    const initialize = await mcpHandler(
      new Request('http://x/mcp', {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          jsonrpc: '2.0',
          id: 1,
          method: 'initialize',
          params: {
            protocolVersion: '2025-03-26',
            capabilities: {},
            clientInfo: { name: 'codex', version: '1.0.0' },
          },
        }),
      }),
    )
    expect(initialize.status).toBe(200)
    const session = initialize.headers.get('mcp-session-id')
    expect(session).toBeTruthy()
    await expect(initialize.json()).resolves.toMatchObject({
      result: { protocolVersion: '2025-03-26', capabilities: { tools: {} } },
    })

    const list = await mcpHandler(
      new Request('http://x/mcp', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream',
          'mcp-protocol-version': '2025-03-26',
          'mcp-session-id': session!,
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 2, method: 'tools/list', params: {} }),
      }),
    )
    await expect(list.json()).resolves.toMatchObject({ result: { tools: expect.any(Array) } })
  })
})
