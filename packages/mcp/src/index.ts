import {
  readAllPages,
  resolveIssueReference,
  selectedGroups,
  selectedProjects,
  type ProviderReadContract,
  type ScopeSelection,
} from '@horizon/domain'

export type McpErrorCode = 'validation_error' | 'scope_error' | 'not_found' | 'conflict' | 'provider_error'
export class McpToolError extends Error {
  constructor(readonly code: McpErrorCode, message: string, readonly details?: unknown) { super(message); this.name = 'McpToolError' }
}
export type McpTool = { name: string; description: string; inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] } }
export type ReadContext = { provider: ProviderReadContract; scope: ScopeSelection }

const tools: McpTool[] = [
  ['read_scope', 'Read the configured scope', {}], ['list_groups', 'List groups in the configured scope', {}],
  ['list_projects', 'List projects in the configured scope', {}], ['list_issues', 'List issues in the configured scope', {}],
  ['get_issue', 'Read one issue by technical or friendly reference', { reference: { type: 'string' } }],
  ['get_comments', 'Read comments for an issue', { reference: { type: 'string' } }],
  ['get_metadata', 'Read users and labels for an issue project', { reference: { type: 'string' } }],
  ['get_hierarchy', 'Read sub-issues and blocking links', {}], ['list_views', 'List available views', {}],
].map(([name, description, properties]) => ({ name: name as string, description: description as string, inputSchema: { type: 'object', properties: properties as Record<string, unknown>, ...(Object.keys(properties as object).length ? { required: Object.keys(properties as object) } : {}) } }))

export const readTools = (): readonly McpTool[] => tools
const readScope = async (ctx: ReadContext) => ctx.provider.readScope(ctx.scope)
const issue = async (ctx: ReadContext, reference: unknown) => {
  if (typeof reference !== 'string' || !reference.trim()) throw new McpToolError('validation_error', 'reference is required')
  const data = await readScope(ctx); const result = resolveIssueReference(reference, data.projects, data.issues, ctx.scope)
  if (result.kind === 'not-found') throw new McpToolError('not_found', 'Issue not found', result)
  if (result.kind === 'conflict') throw new McpToolError('conflict', 'Friendly Issue reference is ambiguous', result)
  return { ...result.issue, reference: { technical: result.technical, friendly: result.friendly, project: `${result.project.namespace}/${result.project.path}` } }
}
export async function callReadTool(ctx: ReadContext, name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  try {
    switch (name) {
      case 'read_scope': return readScope(ctx)
      case 'list_groups': { const d = await readScope(ctx); return selectedGroups(d.groups, ctx.scope) }
      case 'list_projects': { const d = await readScope(ctx); return selectedProjects(d.projects, ctx.scope) }
      case 'list_issues': { const d = await readScope(ctx); const ids = new Set(selectedProjects(d.projects, ctx.scope).map(p => p.id)); return d.issues.filter(i => ids.has(i.projectId)) }
      case 'get_issue': return issue(ctx, args.reference)
      case 'get_comments': return { issue: await issue(ctx, args.reference), comments: [] }
      case 'get_metadata': { const i: any = await issue(ctx, args.reference); return { users: await readAllPages(p => ctx.provider.listUsers(i.projectId, p)), labels: await readAllPages(p => ctx.provider.listLabels(i.projectId, p)) } }
      case 'get_hierarchy': { const d = await readScope(ctx); const h = ctx.provider.readHierarchy ? await ctx.provider.readHierarchy(d.projects.map(p => ({ id: p.id, fullPath: `${p.namespace}/${p.path}` }))) : new Map(); return { issues: d.issues, hierarchy: h } }
      case 'list_views': return [{ id: 'general', title: 'General', builtin: true }]
      default: throw new McpToolError('not_found', `Unknown tool: ${name}`)
    }
  } catch (e) { if (e instanceof McpToolError) throw e; throw new McpToolError('provider_error', e instanceof Error ? e.message : 'Provider error', e) }
}
