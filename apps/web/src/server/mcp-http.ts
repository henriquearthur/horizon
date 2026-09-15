import {
  callReadTool,
  callWriteTool,
  readTools,
  allTools,
  type ReadContext,
  type WriteContext,
} from '../../../../packages/mcp/src/index.ts'
import type { ProviderReadContract, ProviderWriteContract } from '@horizon/domain'
import { reader, writer } from './gitlab'
import { scopeStore } from './scope-store'

type Rpc = {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: Record<string, unknown>
}

/** Streamable HTTP MCP endpoint. Kept as a Fetch handler for Nitro and tests. */
export const mcpHandler = async (request: Request): Promise<Response> => {
  if (request.method !== 'POST')
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } })
  let body: Rpc
  try {
    body = (await request.json()) as Rpc
  } catch {
    return rpcError(null, -32700, 'Invalid JSON')
  }
  const id = body.id ?? null
  try {
    if (body.jsonrpc !== '2.0' || typeof body.method !== 'string')
      return rpcError(id, -32600, 'Invalid Request')
    if (body.method === 'initialize')
      return rpcResult(id, {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'horizon', version: '0.0.0' },
      })
    if (body.method === 'notifications/initialized') return new Response(null, { status: 202 })
    if (body.method === 'tools/list') return rpcResult(id, { tools: allTools() })
    if (body.method === 'tools/call') {
      const name = body.params?.name
      if (typeof name !== 'string') return rpcError(id, -32602, 'name is required')
      const args = (body.params?.arguments ?? {}) as Record<string, unknown>
      const scope = await scopeStore.getScope()
      const readProvider = reader()
      const writeProvider = writer()
      // Keep provider instances intact: GitLab providers hold private state and
      // rely on prototype methods, so spreading/assigning them would silently
      // drop methods and lose the correct `this` binding.
      const provider = new Proxy(
        readProvider as ProviderReadContract & Partial<ProviderWriteContract>,
        {
          get(target, property, receiver) {
            if (property in writeProvider) {
              const value = Reflect.get(writeProvider, property, writeProvider)
              return typeof value === 'function' ? value.bind(writeProvider) : value
            }
            return Reflect.get(target, property, receiver)
          },
        },
      )
      const context: ReadContext & WriteContext = {
        provider,
        scope,
      }
      const result = readTools().some((tool) => tool.name === name)
        ? await callReadTool(context, name, args)
        : await callWriteTool(context, name, args)
      return rpcResult(id, {
        content: [{ type: 'text', text: JSON.stringify(result) }],
        structuredContent: result,
      })
    }
    return rpcError(id, -32601, 'Method not found')
  } catch (error) {
    const e = error as { code?: string; message?: string; details?: unknown }
    return rpcResult(id, {
      isError: true,
      content: [{ type: 'text', text: e.message ?? 'Tool error' }],
      structuredContent: { code: e.code, details: e.details },
    })
  }
}
const headers = { 'content-type': 'application/json' }
const jsonSafe = (value: unknown): unknown => {
  if (value instanceof Map)
    return Object.fromEntries(
      [...value.entries()].map(([key, entry]) => [String(key), jsonSafe(entry)]),
    )
  if (Array.isArray(value)) return value.map(jsonSafe)
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, jsonSafe(entry)]))
  return value
}
const rpcResult = (id: Rpc['id'], result: unknown) =>
  new Response(JSON.stringify({ jsonrpc: '2.0', id, result: jsonSafe(result) }), { headers })
const rpcError = (id: Rpc['id'], code: number, message: string) =>
  new Response(JSON.stringify({ jsonrpc: '2.0', id, error: { code, message } }), {
    status: 400,
    headers,
  })

// Exported for Nitro route adapters; the server itself listens on 0.0.0.0 via vite config.
