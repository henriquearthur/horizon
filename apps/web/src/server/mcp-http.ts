import { callReadTool, callWriteTool, readTools, allTools, type ReadContext, type WriteContext } from '../../../../packages/mcp/src/index.ts'
import { reader, writer } from './gitlab'
import { scopeStore } from './scope-store'

type Rpc = { jsonrpc?: string; id?: string | number | null; method?: string; params?: Record<string, unknown> }

/** Streamable HTTP MCP endpoint. Kept as a Fetch handler for Nitro and tests. */
export const mcpHandler = async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } })
  let body: Rpc
  try { body = await request.json() as Rpc } catch { return rpcError(null, -32700, 'Invalid JSON') }
  const id = body.id ?? null
  try {
    if (body.jsonrpc !== '2.0' || typeof body.method !== 'string') return rpcError(id, -32600, 'Invalid Request')
    if (body.method === 'initialize') return rpcResult(id, { protocolVersion: '2025-03-26', capabilities: { tools: {} }, serverInfo: { name: 'horizon', version: '0.0.0' } })
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 })
    if (body.method === 'tools/list') return rpcResult(id, { tools: allTools() })
    if (body.method === 'tools/call') {
      const name = body.params?.name
      if (typeof name !== 'string') return rpcError(id, -32602, 'name is required')
      const args = (body.params?.arguments ?? {}) as Record<string, unknown>
      const scope = await scopeStore.getScope()
      const context: ReadContext & WriteContext = { provider: Object.assign({}, reader(), writer()), scope }
      const result = readTools().some(tool => tool.name === name)
        ? await callReadTool(context, name, args)
        : await callWriteTool(context, name, args)
      return rpcResult(id, { content: [{ type: 'text', text: JSON.stringify(result) }], structuredContent: result })
    }
    return rpcError(id, -32601, 'Method not found')
  } catch (error) {
    const e = error as { code?: string; message?: string; details?: unknown }
    return rpcResult(id, { isError: true, content: [{ type: 'text', text: e.message ?? 'Tool error' }], structuredContent: { code: e.code, details: e.details } })
  }
}
const headers = { 'content-type': 'application/json' }
const rpcResult = (id: Rpc['id'], result: unknown) => new Response(JSON.stringify({ jsonrpc: '2.0', id, result }), { headers })
const rpcError = (id: Rpc['id'], code: number, message: string) => new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), { status: 400, headers })

// Exported for Nitro route adapters; the server itself listens on 0.0.0.0 via vite config.
