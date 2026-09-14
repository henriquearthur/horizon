import {
  readAllPages,
  resolveIssueReference,
  selectedGroups,
  selectedProjects,
  type ProviderReadContract,
  type ScopeSelection,
  type ProviderWriteContract,
  withBlockingLink,
  readIssueProperties,
} from '@horizon/domain'

export type McpErrorCode = 'validation_error' | 'scope_error' | 'not_found' | 'conflict' | 'provider_error'
export class McpToolError extends Error {
  constructor(readonly code: McpErrorCode, message: string, readonly details?: unknown) { super(message); this.name = 'McpToolError' }
}
export type McpTool = { name: string; description: string; inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] } }
export type ReadContext = { provider: ProviderReadContract; scope: ScopeSelection }
export type WriteContext = ReadContext & { provider: ProviderReadContract & Partial<ProviderWriteContract> }

const tools: McpTool[] = [
  ['read_scope', 'Read the configured scope', {}], ['list_groups', 'List groups in the configured scope', {}],
  ['list_projects', 'List projects in the configured scope', {}], ['list_issues', 'List issues in the configured scope', {}],
  ['get_issue', 'Read one issue by technical or friendly reference', { reference: { type: 'string' } }],
  ['get_comments', 'Read comments for an issue', { reference: { type: 'string' } }],
  ['get_metadata', 'Read users and labels for an issue project', { reference: { type: 'string' } }],
  ['get_hierarchy', 'Read sub-issues and blocking links', {}], ['list_views', 'List available views', {}],
  ['create_issue', 'Create an issue', { projectId: {type:'number'}, title:{type:'string'}, description:{type:'string'}, labels:{type:'array'}, assigneeIds:{type:'array'} }],
  ['update_issue', 'Update an issue', { reference:{type:'string'} }], ['create_comment','Create a comment',{reference:{type:'string'},body:{type:'string'}}],
  ['set_issue_properties','Set status, priority, labels and assignees',{reference:{type:'string'}}], ['create_sub_issue','Create a sub-issue',{parent:{type:'string'},title:{type:'string'}}],
  ['create_blocking','Create a blocking link',{source:{type:'string'},target:{type:'string'}}],
  ['start_issue','Start implementation of an issue',{reference:{type:'string'},model:{type:'string'},harness:{type:'string'},session_id:{type:'string'},assigneeIds:{type:'array'}}],
  ['handoff_issue','Pause implementation and record handoff',{reference:{type:'string'},handoff_text:{type:'string'},model:{type:'string'},harness:{type:'string'},session_id:{type:'string'},assigneeIds:{type:'array'}}],
  ['resume_issue','Resume implementation of an issue',{reference:{type:'string'},model:{type:'string'},harness:{type:'string'},session_id:{type:'string'},assigneeIds:{type:'array'}}],
  ['complete_issue','Complete implementation and record report',{reference:{type:'string'},report:{type:'string'},model:{type:'string'},harness:{type:'string'},session_id:{type:'string'},assigneeIds:{type:'array'}}],
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

const writeProvider = (ctx: WriteContext, method: keyof ProviderWriteContract): any => {
  const fn = ctx.provider[method]
  if (typeof fn !== 'function') throw new McpToolError('provider_error', `Provider não implementa ${String(method)}`)
  return fn.bind(ctx.provider)
}
const resolved = async (ctx: WriteContext, ref: unknown) => issue(ctx, ref)
export async function callWriteTool(ctx: WriteContext, name: string, args: Record<string, unknown> = {}): Promise<unknown> {
  try {
    const requireString = (key: string) => { const v=args[key]; if(typeof v!=='string'||!v.trim()) throw new McpToolError('validation_error', `${key} is required`); return v }
    if (name === 'create_issue') {
      if (!Number.isInteger(args.projectId) || typeof args.title !== 'string' || !args.title.trim()) throw new McpToolError('validation_error','projectId and title are required')
      const d=await readScope(ctx); if(!d.projects.some(p=>p.id===args.projectId)) throw new McpToolError('scope_error','Project outside configured scope')
      return await writeProvider(ctx,'createIssue')({projectId:args.projectId,title:args.title,...(typeof args.description==='string'?{description:args.description}:{}),...(Array.isArray(args.labels)?{labels:args.labels}:{}),...(Array.isArray(args.assigneeIds)?{assigneeIds:args.assigneeIds}: {})})
    }
    if(name==='create_comment'){const i:any=await resolved(ctx,requireString('reference')); const body=requireString('body'); return await writeProvider(ctx,'createComment')(i.projectId,i.iid,body)}
    if(name==='update_issue'){const i:any=await resolved(ctx,requireString('reference')); return await writeProvider(ctx,'updateIssue')(i.projectId,i.iid,args)}
    if(name==='set_issue_properties'){const i:any=await resolved(ctx,requireString('reference')); const changes:any={}; for(const k of ['status','priority']) if(typeof args[k]==='string') changes[k]=args[k]; if(Array.isArray(args.labels)) changes.labels=args.labels; return await writeProvider(ctx,'updateIssueProperties')(i.projectId,i.iid,changes)}
    if(name==='create_blocking'){const s:any=await resolved(ctx,requireString('source')); const t:any=await resolved(ctx,requireString('target')); return await writeProvider(ctx,'updateIssue')(s.projectId,s.iid,{labels:withBlockingLink(s,t)})}
    if (['start_issue','handoff_issue','resume_issue','complete_issue'].includes(name)) {
      const i:any = await resolved(ctx, requireString('reference'))
      for (const key of ['model','harness','session_id']) requireString(key)
      const target = ({start_issue:'in_progress',handoff_issue:'paused',resume_issue:'in_progress',complete_issue:'completed'} as any)[name]
      const current = readIssueProperties(i).status
      const statusMap:any = {Backlog:'backlog','Em andamento':'in_progress','Pausada':'paused','Concluído':'completed'}
      const currentKey = statusMap[current] ?? 'backlog'
      const allowed:any = {start_issue:['backlog','in_progress'],handoff_issue:['in_progress','paused'],resume_issue:['paused','in_progress'],complete_issue:['backlog','in_progress','paused','completed']}
      if (!allowed[name].includes(currentKey)) throw new McpToolError('conflict', `Invalid lifecycle transition from ${currentKey}`, { currentStatus: currentKey, targetStatus: target })
      const body = name === 'handoff_issue' ? requireString('handoff_text') : name === 'complete_issue' ? requireString('report') : `${name === 'start_issue' ? 'Implementation started.' : 'Implementation resumed.'}`
      const citation = `> **Model:** \`${args.model}\` · **Harness:** \`${args.harness}\` · **Session:** \`${args.session_id}\``
      const text = `${citation}\n\n${body}`
      const assigneeIds = Array.isArray(args.assigneeIds) ? args.assigneeIds : undefined
      const effects:{status:'applied'|'failed'|'unknown';comment:'applied'|'failed'|'unknown';assignment:'applied'|'failed'|'unknown'} = {status:'applied',comment:'unknown',assignment:'applied'}
      try {
        if (currentKey !== target) {
          await writeProvider(ctx,'updateIssueProperties')(i.projectId, i.iid, {status: ({backlog:'Backlog',in_progress:'Em andamento',paused:'Pausada',completed:'Concluído'} as any)[target]})
          if (assigneeIds) await writeProvider(ctx,'updateIssue')(i.projectId, i.iid, {assigneeIds})
        } else if (assigneeIds) await writeProvider(ctx,'updateIssue')(i.projectId, i.iid, {assigneeIds})
      } catch (e) { effects.status = 'failed'; effects.assignment = 'failed'; throw new McpToolError('provider_error','Lifecycle status update failed',{effects,error:e instanceof Error?e.message:e}) }
      try {
        const comments = await writeProvider(ctx,'listComments')(i.projectId,i.iid)
        if (!comments.some((c:any)=>c.body===text)) await writeProvider(ctx,'createComment')(i.projectId,i.iid,text)
        effects.comment='applied'
      } catch (e) { throw new McpToolError('provider_error','Lifecycle comment update failed',{effects,error:e instanceof Error?e.message:e}) }
      return {issue:i, status:target, effects, citation}
    }
    throw new McpToolError('not_found',`Unknown tool: ${name}`)
  } catch(e){ if(e instanceof McpToolError) throw e; throw new McpToolError('provider_error',e instanceof Error?e.message:'Provider error',e) }
}
