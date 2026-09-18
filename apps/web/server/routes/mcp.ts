import { defineHandler } from 'nitro'
import { mcpHandler } from '../../src/server/mcp-http'

/** Nitro/Srvx adapter for `/mcp`; no MCP authentication is required. */
export default defineHandler((event) => mcpHandler(event.req))
