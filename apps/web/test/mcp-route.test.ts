import { resolve } from 'node:path'
import { createServer, type ViteDevServer } from 'vite'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

const version = '2026-07-28'

describe('MCP HTTP route', () => {
  let server: ViteDevServer
  let endpoint: string

  beforeAll(async () => {
    server = await createServer({
      configFile: resolve('vite.config.ts'),
      server: { host: '127.0.0.1', port: 0 },
    })
    await server.listen()

    const address = server.httpServer?.address()
    if (!address || typeof address === 'string') throw new Error('Vite did not expose a TCP port')
    endpoint = `http://127.0.0.1:${address.port}/mcp`
  })

  afterAll(async () => {
    await server?.close()
  })

  it('serves discovery through the built-in Nitro route', async () => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'mcp-protocol-version': version,
        'mcp-method': 'server/discover',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'server/discover',
        params: {
          _meta: {
            'io.modelcontextprotocol/protocolVersion': version,
            'io.modelcontextprotocol/clientCapabilities': {},
            'io.modelcontextprotocol/clientInfo': { name: 'horizon-test', version: '1.0.0' },
          },
        },
      }),
    })

    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toMatchObject({
      result: {
        supportedVersions: [version],
        _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'horizon' } },
      },
    })
  })
})
