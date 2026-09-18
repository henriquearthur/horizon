import {
  callReadTool,
  callWriteTool,
  readTools,
  allTools,
  type ReadContext,
  type WriteContext,
} from '../../../../packages/mcp/src/index.ts'
import type { ProviderReadContract, ProviderWriteContract } from '@horizon/domain'
import { reader, providerSnapshot } from './gitlab'
import { runtime } from './runtime'
import { scopeStore } from './scope-store'

const protocolVersion = '2026-07-28'
const serverInfo = { name: 'horizon', version: '0.0.0' }
const resultMeta = { 'io.modelcontextprotocol/serverInfo': serverInfo }

type Rpc = {
  jsonrpc?: string
  id?: string | number | null
  method?: string
  params?: Record<string, unknown>
}

type RequestMeta = {
  'io.modelcontextprotocol/protocolVersion'?: unknown
  'io.modelcontextprotocol/clientCapabilities'?: unknown
  'io.modelcontextprotocol/clientInfo'?: unknown
}

/** Stateless Streamable HTTP MCP endpoint for protocol revision 2026-07-28. */
export const mcpHandler = async (request: Request): Promise<Response> => {
  if (!hasValidOrigin(request)) return rpcError(null, -32600, 'Invalid Origin', 403)
  if (request.method !== 'POST')
    return new Response('Method Not Allowed', { status: 405, headers: { Allow: 'POST' } })

  let parsed: unknown
  try {
    parsed = await request.json()
  } catch {
    return rpcError(null, -32700, 'Invalid JSON')
  }

  if (!isRecord(parsed)) return rpcError(null, -32600, 'Invalid Request')
  const body = parsed as Rpc
  const id = body.id ?? null
  if (body.jsonrpc !== '2.0' || typeof body.method !== 'string')
    return rpcError(id, -32600, 'Invalid Request')

  const headerError = validateRequestHeaders(request.headers, body)
  if (headerError) return rpcError(id, -32020, headerError)

  const meta = body.params?._meta as RequestMeta | undefined
  const requestedVersion = meta?.['io.modelcontextprotocol/protocolVersion']
  if (requestedVersion !== protocolVersion)
    return rpcError(id, -32022, 'Unsupported protocol version', 400, {
      supported: [protocolVersion],
      requested: requestedVersion,
    })
  if (!isRecord(meta?.['io.modelcontextprotocol/clientCapabilities']))
    return rpcError(id, -32602, 'Client capabilities are required')
  const clientInfo = meta?.['io.modelcontextprotocol/clientInfo']
  if (
    clientInfo !== undefined &&
    (!isRecord(clientInfo) ||
      typeof clientInfo.name !== 'string' ||
      typeof clientInfo.version !== 'string')
  )
    return rpcError(id, -32602, 'Client info must include a name and version')

  try {
    if (body.method === 'server/discover')
      return rpcResult(
        id,
        completeResult({
          supportedVersions: [protocolVersion],
          capabilities: { tools: {} },
          ttlMs: 3_600_000,
          cacheScope: 'public',
        }),
      )
    if (body.method === 'tools/list')
      return rpcResult(
        id,
        completeResult({
          tools: allTools(),
          ttlMs: 3_600_000,
          cacheScope: 'public',
        }),
      )
    if (body.method === 'tools/call') {
      const name = body.params?.name
      if (typeof name !== 'string') return rpcError(id, -32602, 'name is required')
      const args = (body.params?.arguments ?? {}) as Record<string, unknown>
      const scope = await scopeStore.getScope()
      const readProvider = reader()
      const writeProvider = runtime
      // GitLab providers hold private state and depend on their original `this` binding.
      const provider = new Proxy(
        readProvider as ProviderReadContract & Partial<ProviderWriteContract>,
        {
          get(target, property) {
            if (property === 'readScope')
              return async () => {
                const { groups, projects, issues } = await providerSnapshot()
                return { groups, projects, issues }
              }
            if (property in writeProvider) {
              const value = Reflect.get(writeProvider, property, writeProvider)
              return typeof value === 'function' ? value.bind(writeProvider) : value
            }
            const value = Reflect.get(target, property, target)
            return typeof value === 'function' ? value.bind(target) : value
          },
        },
      ) as ProviderReadContract & ProviderWriteContract
      const context: ReadContext & WriteContext = { provider, scope }
      const result = readTools().some((tool) => tool.name === name)
        ? await callReadTool(context, name, args)
        : await callWriteTool(context, name, args)
      return rpcResult(
        id,
        completeResult({
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result,
        }),
      )
    }
    const message =
      body.method === 'initialize'
        ? `Method not found; supported protocol versions: ${protocolVersion}`
        : 'Method not found'
    return rpcError(id, -32601, message, 404)
  } catch (error) {
    const e = error as { code?: string; message?: string; details?: unknown }
    return rpcResult(
      id,
      completeResult({
        isError: true,
        content: [{ type: 'text', text: e.message ?? 'Tool error' }],
        structuredContent: { code: e.code, details: e.details },
      }),
    )
  }
}

const headers = { 'content-type': 'application/json' }
const completeResult = (result: Record<string, unknown>) => ({
  resultType: 'complete',
  ...result,
  _meta: resultMeta,
})
const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
const hasValidOrigin = (request: Request): boolean => {
  const origin = request.headers.get('origin')
  if (!origin) return true
  try {
    return new URL(origin).origin === new URL(request.url).origin
  } catch {
    return false
  }
}
const decodeHeader = (value: string | null): string | null => {
  if (!value?.startsWith('=?base64?') || !value.endsWith('?=')) return value
  try {
    const binary = atob(value.slice(9, -2))
    return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)))
  } catch {
    return null
  }
}
const validateRequestHeaders = (requestHeaders: Headers, body: Rpc): string | undefined => {
  const meta = body.params?._meta as RequestMeta | undefined
  const bodyVersion = meta?.['io.modelcontextprotocol/protocolVersion']
  const headerVersion = requestHeaders.get('mcp-protocol-version')
  if (!headerVersion || headerVersion !== bodyVersion)
    return 'MCP-Protocol-Version header is missing or does not match request metadata'

  const headerMethod = requestHeaders.get('mcp-method')
  if (!headerMethod || headerMethod !== body.method)
    return 'Mcp-Method header is missing or does not match the request method'

  if (body.method === 'tools/call') {
    const name = body.params?.name
    const headerName = decodeHeader(requestHeaders.get('mcp-name'))
    if (typeof name !== 'string' || headerName !== name)
      return 'Mcp-Name header is missing, malformed, or does not match the tool name'
  }
}
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
const rpcError = (id: Rpc['id'], code: number, message: string, status = 400, data?: unknown) =>
  new Response(
    JSON.stringify({
      jsonrpc: '2.0',
      id,
      error: { code, message, ...(data === undefined ? {} : { data }) },
    }),
    { status, headers },
  )

// Exported for Nitro route adapters; the server itself listens on 0.0.0.0 via vite config.
