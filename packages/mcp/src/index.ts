import {
  readAllPagesFast,
  resolveIssueReference,
  friendlyIssueId,
  selectedGroups,
  selectedProjects,
  canonicalStatus,
  canonicalPriority,
  isHorizonLabel,
  type ProviderReadContract,
  type ScopeSelection,
  type ProviderWriteContract,
  type ProviderComment,
  type ProviderIssue,
  type ProviderProject,
  type UpdateIssueInput,
  type IssueStatus,
  type IssuePriority,
  STATUS_VALUES,
  PRIORITY_VALUES,
  withBlockingLink,
  readIssueProperties,
} from '@horizon/domain'

export type McpErrorCode =
  'validation_error' | 'scope_error' | 'not_found' | 'conflict' | 'provider_error'
export class McpToolError extends Error {
  constructor(
    readonly code: McpErrorCode,
    message: string,
    readonly details?: unknown,
  ) {
    super(message)
    this.name = 'McpToolError'
  }
}
export type McpTool = {
  name: string
  description: string
  inputSchema: { type: 'object'; properties: Record<string, unknown>; required?: string[] }
}
type ToolSpec = readonly [
  name: string,
  description: string,
  properties: Record<string, object>,
  required: readonly string[],
]

/** Identification of the calling agent, negotiated once per connection. */
export type SessionMetadata = {
  readonly model?: string
  readonly harness?: string
  readonly session_id?: string
}
/** The transport header each session field is negotiated with. */
export const SESSION_HEADERS = {
  model: 'X-Horizon-Model',
  harness: 'X-Horizon-Harness',
  session_id: 'Mcp-Session-Id',
} as const
export type ReadContext = {
  provider: ProviderReadContract
  scope: ScopeSelection
  /** Defaults for `model`, `harness` and `session_id`; arguments override them. */
  session?: SessionMetadata
  comments?: (projectId: number, iid: number) => Promise<readonly ProviderComment[]>
}
export type WriteContext = ReadContext & {
  provider: ProviderReadContract & ProviderWriteContract
}

const referenceProperty = {
  type: 'string',
  description:
    'Issue reference: the canonical "namespace/path#iid" returned as reference.technical, the "<projectId>#<iid>" form, or a friendly id such as AL-12.',
}
const labelsProperty = {
  type: 'array',
  items: { type: 'string' },
  description:
    'Provider labels, replacing the current ones. Status and Prioridade are set through their own fields, never as horizon:: labels.',
}
const assigneeIdsProperty = {
  type: 'array',
  items: { type: 'number' },
  description: 'Numeric Provider user ids, replacing the current assignees. Use get_metadata.',
}
const createMissingLabelsProperty = {
  type: 'boolean',
  description: 'Create labels the project does not have yet instead of failing on them.',
}
const statusProperty = {
  type: 'string',
  enum: [...STATUS_VALUES],
  description: 'Horizon Status. Values are the Portuguese labels listed in the enum.',
}
const priorityProperty = {
  type: 'string',
  enum: [...PRIORITY_VALUES],
  description: 'Horizon Prioridade. The shorthand "P1" … "P4" is accepted as well.',
}
const projectProperties = {
  project_path: {
    type: 'string',
    description: 'Project full path, for example "team/alpha", as returned by read_scope.',
  },
  project_id: { type: 'number', description: 'Numeric Provider project id.' },
}
const sessionProperties = {
  model: {
    type: 'string',
    description: `Model identifier, for example claude-opus-5. Optional override for the ${SESSION_HEADERS.model} header negotiated once per connection.`,
  },
  harness: {
    type: 'string',
    description: `Client identifier, for example claude-code. Optional override for the ${SESSION_HEADERS.harness} header (or the MCP clientInfo name).`,
  },
  session_id: {
    type: 'string',
    description: `Opaque agent session identifier. Optional override for the ${SESSION_HEADERS.session_id} header.`,
  },
}

const toolSpecs: readonly ToolSpec[] = [
  [
    'read_scope',
    'Read the configured scope: the group and project catalogue with issue counts. Issues themselves come from list_issues.',
    {},
    [],
  ],
  ['list_groups', 'List groups in the configured scope', {}, []],
  ['list_projects', 'List projects in the configured scope', {}, []],
  [
    'list_issues',
    'List issues of the configured scope, newest update first. Every filter is optional and they combine; results are summaries without the description unless fields="full". Pagination uses limit and the returned nextCursor.',
    {
      ...projectProperties,
      status: statusProperty,
      priority: priorityProperty,
      labels: {
        type: 'array',
        items: { type: 'string' },
        description: 'Only issues carrying every one of these labels.',
      },
      state: {
        type: 'string',
        enum: ['opened', 'closed'],
        description: 'Provider state of the issue.',
      },
      assignee: {
        type: ['string', 'number'],
        description: 'Assignee username or numeric id; "none" lists unassigned issues.',
      },
      updated_since: {
        type: 'string',
        description: 'ISO 8601 timestamp; only issues updated at or after it.',
      },
      search: {
        type: 'string',
        description: 'Case-insensitive text search in title and description.',
      },
      limit: { type: 'number', description: 'Page size, 1 to 100. Defaults to 50.' },
      cursor: { type: 'string', description: 'nextCursor value from the previous page.' },
      fields: {
        type: 'string',
        enum: ['summary', 'full'],
        description: 'summary (default) omits the description; full returns the whole issue.',
      },
    },
    [],
  ],
  ['get_issue', 'Read one issue in full', { reference: referenceProperty }, ['reference']],
  ['get_comments', 'Read comments for an issue', { reference: referenceProperty }, ['reference']],
  [
    'get_metadata',
    'Read the users and labels of a project, for assigneeIds and labels arguments',
    { ...projectProperties, reference: referenceProperty },
    [],
  ],
  ['get_hierarchy', 'Read sub-issue and blocking links of the scope, with issue summaries', {}, []],
  [
    'create_issue',
    'Create an issue in a project of the scope',
    {
      ...projectProperties,
      title: { type: 'string', description: 'Issue title.' },
      description: { type: 'string', description: 'Issue description, in Markdown.' },
      labels: labelsProperty,
      assigneeIds: assigneeIdsProperty,
      createMissingLabels: createMissingLabelsProperty,
    },
    ['title'],
  ],
  [
    'update_issue',
    'Update the editable fields of an issue. Status and Prioridade belong to set_issue_properties.',
    {
      reference: referenceProperty,
      title: { type: 'string', description: 'New title.' },
      description: { type: 'string', description: 'New description, in Markdown.' },
      labels: labelsProperty,
      assigneeIds: assigneeIdsProperty,
      state: {
        type: 'string',
        enum: ['opened', 'closed'],
        description: 'Close or reopen the issue in the Provider.',
      },
      createMissingLabels: createMissingLabelsProperty,
    },
    ['reference'],
  ],
  [
    'create_comment',
    'Create a comment, prefixed with the agent identification',
    {
      reference: referenceProperty,
      body: { type: 'string', description: 'Comment body, in Markdown.' },
      ...sessionProperties,
    },
    ['reference', 'body'],
  ],
  [
    'set_issue_properties',
    'Set Status, Prioridade, labels and assignees of an issue',
    {
      reference: referenceProperty,
      status: statusProperty,
      priority: priorityProperty,
      labels: labelsProperty,
      assigneeIds: assigneeIdsProperty,
      createMissingLabels: createMissingLabelsProperty,
    },
    ['reference'],
  ],
  [
    'create_blocking',
    'Create a blocking link: source blocks target',
    {
      source: {
        ...referenceProperty,
        description: `Blocking issue. ${referenceProperty.description}`,
      },
      target: {
        ...referenceProperty,
        description: `Blocked issue. ${referenceProperty.description}`,
      },
    },
    ['source', 'target'],
  ],
  [
    'start_issue',
    'Start implementation: moves the issue to Em andamento and records the start',
    { reference: referenceProperty, assigneeIds: assigneeIdsProperty, ...sessionProperties },
    ['reference'],
  ],
  [
    'handoff_issue',
    'Pause implementation: moves the issue to Pausada and records the handoff text',
    {
      reference: referenceProperty,
      handoff_text: { type: 'string', description: 'Handoff, preserved verbatim in the comment.' },
      assigneeIds: assigneeIdsProperty,
      ...sessionProperties,
    },
    ['reference', 'handoff_text'],
  ],
  [
    'resume_issue',
    'Resume implementation: moves a Pausada issue back to Em andamento',
    { reference: referenceProperty, assigneeIds: assigneeIdsProperty, ...sessionProperties },
    ['reference'],
  ],
  [
    'complete_issue',
    'Complete implementation: moves the issue to Concluído and records the report',
    {
      reference: referenceProperty,
      report: { type: 'string', description: 'Implementation report, preserved verbatim.' },
      assigneeIds: assigneeIdsProperty,
      ...sessionProperties,
    },
    ['reference', 'report'],
  ],
]
const tools: McpTool[] = toolSpecs.map(([name, description, properties, required]) => ({
  name,
  description,
  inputSchema: {
    type: 'object',
    properties,
    ...(required.length ? { required: [...required] } : {}),
  },
}))
const toolByName = new Map(tools.map((tool) => [tool.name, tool] as const))

const readNames = new Set([
  'read_scope',
  'list_groups',
  'list_projects',
  'list_issues',
  'get_issue',
  'get_comments',
  'get_metadata',
  'get_hierarchy',
])
export const readTools = (): readonly McpTool[] => tools.filter((t) => readNames.has(t.name))
export const allTools = (): readonly McpTool[] => tools

/** An argument the tool does not declare is a mistake, never a silent no-op. */
const checkArguments = (name: string, args: Record<string, unknown>) => {
  const tool = toolByName.get(name)
  if (!tool) throw new McpToolError('not_found', `Unknown tool: ${name}`)
  const accepted = Object.keys(tool.inputSchema.properties)
  const unknown = Object.keys(args).filter((key) => !key.startsWith('_') && !accepted.includes(key))
  if (unknown.length)
    throw new McpToolError(
      'validation_error',
      `Unknown parameter${unknown.length > 1 ? 's' : ''} for ${name}: ${unknown.join(', ')}`,
      { unknown, accepted },
    )
}

const readScope = async (ctx: ReadContext) => ctx.provider.readScope(ctx.scope)
const fullPath = (project: Pick<ProviderProject, 'namespace' | 'path'>) =>
  `${project.namespace}/${project.path}`
const pageResult = <T>(items: readonly T[], args: Record<string, unknown>) => {
  if (args.limit !== undefined && !Number.isInteger(args.limit))
    throw new McpToolError('validation_error', 'limit must be an integer between 1 and 100')
  const limit = Math.min(
    100,
    Math.max(1, Number.isInteger(args.limit) ? (args.limit as number) : 50),
  )
  const offset =
    typeof args.cursor === 'string' && /^\d+$/.test(args.cursor) ? Number(args.cursor) : 0
  const page = items.slice(offset, offset + limit)
  return {
    items: page,
    total: items.length,
    ...(offset + page.length < items.length ? { nextCursor: String(offset + page.length) } : {}),
  }
}
const issueReference = (project: ProviderProject, iid: number) => ({
  technical: `${fullPath(project)}#${iid}`,
  friendly: friendlyIssueId(project, iid),
  project: fullPath(project),
})
/**
 * One issue as the tools expose it. The summary is what an agent needs to
 * decide; the detail adds the Provider record, description included.
 */
const issueCommon = (issue: ProviderIssue, project: ProviderProject | undefined) => {
  const properties = readIssueProperties(issue)
  return {
    ...(project ? { reference: issueReference(project, issue.iid) } : {}),
    projectId: issue.projectId,
    iid: issue.iid,
    title: issue.title,
    state: issue.state,
    status: properties.status,
    priority: properties.priority ?? ('Sem prioridade' as const),
    ...(properties.conflicts.status ? { statusConflict: true } : {}),
  }
}
const issueDetail = (issue: ProviderIssue, project: ProviderProject | undefined) => ({
  ...issue,
  ...issueCommon(issue, project),
})
const issueSummary = (issue: ProviderIssue, project: ProviderProject | undefined) => ({
  ...issueCommon(issue, project),
  labels: issue.labels.filter((label) => !isHorizonLabel(label)),
  assignees: issue.assignees.map((assignee) => assignee.username),
  ...(issue.updatedAt ? { updatedAt: issue.updatedAt } : {}),
  ...(issue.parentIid ? { parentIid: issue.parentIid } : {}),
  ...(issue.hasChildren ? { hasChildren: true } : {}),
  webUrl: issue.webUrl,
})
const projectOf = (
  projects: readonly ProviderProject[],
  args: Record<string, unknown>,
  required: boolean,
): ProviderProject | undefined => {
  if (args.project_id !== undefined) {
    if (!Number.isInteger(args.project_id))
      throw new McpToolError('validation_error', 'project_id must be an integer')
    const found = projects.find((project) => project.id === args.project_id)
    if (!found)
      throw new McpToolError('scope_error', 'Project outside configured scope', {
        project_id: args.project_id,
      })
    return found
  }
  if (args.project_path !== undefined) {
    if (typeof args.project_path !== 'string')
      throw new McpToolError('validation_error', 'project_path must be a string')
    const wanted = args.project_path.trim().toLocaleLowerCase()
    const found = projects.find((project) => fullPath(project).toLocaleLowerCase() === wanted)
    if (!found)
      throw new McpToolError('scope_error', 'Project outside configured scope', {
        project_path: args.project_path,
        available: projects.map(fullPath),
      })
    return found
  }
  if (required) throw new McpToolError('validation_error', 'project_path or project_id is required')
  return undefined
}
const stringArray = (value: unknown, key: string): readonly string[] => {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string'))
    throw new McpToolError('validation_error', `${key} must be an array of strings`)
  return value as readonly string[]
}
const numberArray = (value: unknown, key: string): readonly number[] => {
  if (!Array.isArray(value) || !value.every((item) => Number.isInteger(item)))
    throw new McpToolError('validation_error', `${key} must be an array of integers`)
  return value as readonly number[]
}
const canonical = <T extends string>(
  value: unknown,
  key: string,
  valid: readonly T[],
  normalize: (input: string) => T | undefined,
): T | undefined => {
  if (value === undefined) return undefined
  const normalized = typeof value === 'string' ? normalize(value) : undefined
  if (!normalized)
    throw new McpToolError('validation_error', `${key} must be one of the canonical values`, {
      valid,
    })
  return normalized
}
const oneOf = <T extends string>(value: unknown, key: string, valid: readonly T[]): T | undefined =>
  canonical(value, key, valid, (input) => valid.find((candidate) => candidate === input))
const issue = async (ctx: ReadContext, reference: unknown) => {
  if (typeof reference !== 'string' || !reference.trim())
    throw new McpToolError('validation_error', 'reference is required')
  const data = await readScope(ctx)
  const result = resolveIssueReference(reference, data.projects, data.issues, ctx.scope)
  if (result.kind === 'not-found') throw new McpToolError('not_found', 'Issue not found', result)
  if (result.kind === 'conflict')
    throw new McpToolError('conflict', 'Friendly Issue reference is ambiguous', result)
  return issueDetail(result.issue, result.project)
}
export async function callReadTool(
  ctx: ReadContext,
  name: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  try {
    checkArguments(name, args)
    switch (name) {
      case 'read_scope': {
        const d = await readScope(ctx)
        const projects = selectedProjects(d.projects, ctx.scope)
        const ids = new Set(projects.map((project) => project.id))
        const issues = d.issues.filter((item) => ids.has(item.projectId))
        const counted = (projectId: number) => {
          const own = issues.filter((item) => item.projectId === projectId)
          return {
            total: own.length,
            open: own.filter((item) => item.state === 'opened').length,
            closed: own.filter((item) => item.state === 'closed').length,
          }
        }
        return {
          groups: selectedGroups(d.groups, ctx.scope).map((group) => ({
            id: group.id,
            fullPath: group.fullPath,
            name: group.name,
          })),
          projects: projects.map((project) => ({
            id: project.id,
            path: fullPath(project),
            name: project.name,
            webUrl: project.webUrl,
            issues: counted(project.id),
          })),
          counts: {
            groups: selectedGroups(d.groups, ctx.scope).length,
            projects: projects.length,
            issues: issues.length,
            openIssues: issues.filter((item) => item.state === 'opened').length,
            closedIssues: issues.filter((item) => item.state === 'closed').length,
          },
        }
      }
      case 'list_groups': {
        const d = await readScope(ctx)
        return selectedGroups(d.groups, ctx.scope)
      }
      case 'list_projects': {
        const d = await readScope(ctx)
        return selectedProjects(d.projects, ctx.scope).map((project) => ({
          ...project,
          path: fullPath(project),
        }))
      }
      case 'list_issues': {
        const d = await readScope(ctx)
        const projects = selectedProjects(d.projects, ctx.scope)
        const byId = new Map(projects.map((project) => [project.id, project] as const))
        const project = projectOf(projects, args, false)
        const status = canonical(args.status, 'status', STATUS_VALUES, canonicalStatus)
        const priority = canonical(args.priority, 'priority', PRIORITY_VALUES, canonicalPriority)
        const state = oneOf(args.state, 'state', ['opened', 'closed'] as const)
        const labels = args.labels === undefined ? [] : stringArray(args.labels, 'labels')
        const fields = oneOf(args.fields, 'fields', ['summary', 'full'] as const) ?? 'summary'
        const search = typeof args.search === 'string' ? args.search.toLocaleLowerCase() : undefined
        let updatedSince: number | undefined
        if (args.updated_since !== undefined) {
          updatedSince =
            typeof args.updated_since === 'string' ? Date.parse(args.updated_since) : Number.NaN
          if (Number.isNaN(updatedSince))
            throw new McpToolError(
              'validation_error',
              'updated_since must be an ISO 8601 timestamp, for example 2026-09-01T00:00:00Z',
            )
        }
        const assignee = args.assignee
        if (assignee !== undefined && typeof assignee !== 'string' && !Number.isInteger(assignee))
          throw new McpToolError(
            'validation_error',
            'assignee must be a username, a numeric id, or "none"',
          )
        const wantedAssignee =
          typeof assignee === 'string' ? assignee.replace(/^@/, '').toLocaleLowerCase() : undefined
        const matches = (item: ProviderIssue) => {
          const properties = readIssueProperties(item)
          if (project && item.projectId !== project.id) return false
          if (state && item.state !== state) return false
          if (status && properties.status !== status) return false
          if (priority && (properties.priority ?? 'Sem prioridade') !== priority) return false
          if (!labels.every((label) => item.labels.includes(label))) return false
          if (wantedAssignee === 'none' || wantedAssignee === 'unassigned') {
            if (item.assignees.length) return false
          } else if (wantedAssignee !== undefined) {
            if (!item.assignees.some((a) => a.username.toLocaleLowerCase() === wantedAssignee))
              return false
          } else if (assignee !== undefined && !item.assignees.some((a) => a.id === assignee))
            return false
          if (updatedSince !== undefined && !(Date.parse(item.updatedAt ?? '') >= updatedSince))
            return false
          if (
            search &&
            !`${item.title} ${item.description ?? ''}`.toLocaleLowerCase().includes(search)
          )
            return false
          return true
        }
        const when = (item: ProviderIssue) =>
          Date.parse(item.updatedAt ?? item.createdAt ?? '') || 0
        const filtered = d.issues
          .filter((item) => byId.has(item.projectId))
          .filter(matches)
          .sort((a, b) => when(b) - when(a) || a.projectId - b.projectId || b.iid - a.iid)
          .map((item) =>
            fields === 'full'
              ? issueDetail(item, byId.get(item.projectId))
              : issueSummary(item, byId.get(item.projectId)),
          )
        return pageResult(filtered, args)
      }
      case 'get_issue':
        return issue(ctx, args.reference)
      case 'get_comments': {
        const i = await issue(ctx, args.reference)
        if (ctx.comments) return { issue: i, comments: await ctx.comments(i.projectId, i.iid) }
        const provider = ctx.provider as ProviderReadContract &
          Pick<ProviderWriteContract, 'listComments'>
        if (typeof provider.listComments !== 'function')
          throw new McpToolError('provider_error', 'Comments dependency is not configured')
        return { issue: i, comments: await provider.listComments(i.projectId, i.iid) }
      }
      case 'get_metadata': {
        const d = await readScope(ctx)
        const projects = selectedProjects(d.projects, ctx.scope)
        const picked = projectOf(projects, args, false)
        let projectId: number
        if (picked) projectId = picked.id
        else if (typeof args.reference === 'string' && args.reference.trim())
          projectId = (await issue(ctx, args.reference)).projectId
        else
          throw new McpToolError(
            'validation_error',
            'project_path, project_id or reference is required',
          )
        if (!projects.some((project) => project.id === projectId))
          throw new McpToolError('scope_error', 'Project outside configured scope')
        const [users, labels] = await Promise.all([
          readAllPagesFast((p) => ctx.provider.listUsers(projectId, p)),
          readAllPagesFast((p) => ctx.provider.listLabels(projectId, p)),
        ])
        return { projectId, users, labels }
      }
      case 'get_hierarchy': {
        const d = await readScope(ctx)
        const projects = selectedProjects(d.projects, ctx.scope)
        const byId = new Map(projects.map((project) => [project.id, project] as const))
        const h = ctx.provider.readHierarchy
          ? await ctx.provider.readHierarchy(
              d.projects.map((p) => ({ id: p.id, fullPath: fullPath(p) })),
            )
          : new Map()
        return {
          issues: d.issues
            .filter((item) => byId.has(item.projectId))
            .map((item) => issueSummary(item, byId.get(item.projectId))),
          hierarchy: h,
        }
      }
      default:
        throw new McpToolError('not_found', `Unknown tool: ${name}`)
    }
  } catch (e) {
    if (e instanceof McpToolError) throw e
    throw new McpToolError('provider_error', e instanceof Error ? e.message : 'Provider error', e)
  }
}

const writeProvider = <K extends keyof ProviderWriteContract>(
  ctx: WriteContext,
  method: K,
): ProviderWriteContract[K] => {
  const fn = ctx.provider[method]
  if (typeof fn !== 'function')
    throw new McpToolError('provider_error', `Provider não implementa ${String(method)}`)
  return fn.bind(ctx.provider) as ProviderWriteContract[K]
}
const validateLabels = async (
  ctx: WriteContext,
  projectId: number,
  labels: unknown,
  allowMissing: boolean,
) => {
  const values = stringArray(labels, 'labels')
  const reserved = [
    ...STATUS_VALUES.map((value) => `horizon::status::${value}`),
    ...PRIORITY_VALUES.map((value) => `horizon::priority::${value}`),
  ]
  const invalidReserved = values.filter(
    (label) =>
      (label.startsWith('horizon::status::') || label.startsWith('horizon::priority::')) &&
      !reserved.includes(label),
  )
  if (invalidReserved.length)
    throw new McpToolError('validation_error', 'Unknown Horizon property labels', {
      invalid: invalidReserved,
      valid: reserved,
    })
  if (allowMissing) return values
  const known = await readAllPagesFast((p) => ctx.provider.listLabels(projectId, p))
  const missing = values.filter((label) => !known.some((candidate) => candidate.name === label))
  if (missing.length)
    throw new McpToolError(
      'validation_error',
      'Unknown labels. Use createMissingLabels=true to create them explicitly.',
      {
        missing,
        validLabels: known.map((label) => label.name),
      },
    )
  return values
}
const resolved = async (ctx: WriteContext, ref: unknown) => issue(ctx, ref)
export async function callWriteTool(
  ctx: WriteContext,
  name: string,
  args: Record<string, unknown> = {},
): Promise<unknown> {
  try {
    checkArguments(name, args)
    const requireString = (key: string) => {
      const v = args[key]
      if (typeof v !== 'string' || !v.trim())
        throw new McpToolError('validation_error', `${key} is required`)
      return v
    }
    /** Session identification: the argument wins, the connection provides the default. */
    const sessionValue = (key: keyof SessionMetadata) => {
      const value = args[key] ?? ctx.session?.[key]
      if (typeof value !== 'string' || !value.trim())
        throw new McpToolError(
          'validation_error',
          `${key} is required: send it as an argument or negotiate it once per connection with the ${SESSION_HEADERS[key]} header`,
          { header: SESSION_HEADERS[key] },
        )
      return value.trim()
    }
    const citation = () =>
      `> **Model:** \`${sessionValue('model')}\` · **Harness:** \`${sessionValue('harness')}\` · **Session:** \`${sessionValue('session_id')}\``
    if (name === 'create_issue') {
      const d = await readScope(ctx)
      const project = projectOf(selectedProjects(d.projects, ctx.scope), args, true)!
      const title = requireString('title')
      const labels =
        args.labels === undefined
          ? undefined
          : await validateLabels(ctx, project.id, args.labels, args.createMissingLabels === true)
      return await writeProvider(
        ctx,
        'createIssue',
      )({
        projectId: project.id,
        title,
        ...(typeof args.description === 'string' ? { description: args.description } : {}),
        ...(labels ? { labels } : {}),
        ...(args.assigneeIds === undefined
          ? {}
          : { assigneeIds: numberArray(args.assigneeIds, 'assigneeIds') }),
      })
    }
    if (name === 'create_comment') {
      const i = await resolved(ctx, requireString('reference'))
      const body = requireString('body')
      return await writeProvider(ctx, 'createComment')(
        i.projectId,
        i.iid,
        `${citation()}\n\n${body}`,
      )
    }
    if (name === 'update_issue') {
      const i = await resolved(ctx, requireString('reference'))
      // Only the declared fields reach the Provider; `reference` never does.
      const input: Record<string, unknown> = {}
      if (args.title !== undefined) input.title = requireString('title')
      if (args.description !== undefined) {
        if (typeof args.description !== 'string')
          throw new McpToolError('validation_error', 'description must be a string')
        input.description = args.description
      }
      if (args.labels !== undefined)
        input.labels = await validateLabels(
          ctx,
          i.projectId,
          args.labels,
          args.createMissingLabels === true,
        )
      if (args.assigneeIds !== undefined)
        input.assigneeIds = numberArray(args.assigneeIds, 'assigneeIds')
      const state = oneOf(args.state, 'state', ['opened', 'closed'] as const)
      if (state) input.stateEvent = state === 'closed' ? 'close' : 'reopen'
      if (!Object.keys(input).length)
        throw new McpToolError('validation_error', 'Nothing to update', {
          accepted: ['title', 'description', 'labels', 'assigneeIds', 'state'],
        })
      return await writeProvider(ctx, 'updateIssue')(i.projectId, i.iid, input as UpdateIssueInput)
    }
    if (name === 'set_issue_properties') {
      const i = await resolved(ctx, requireString('reference'))
      const changes: { status?: IssueStatus; priority?: IssuePriority } = {}
      const status = canonical(args.status, 'status', STATUS_VALUES, canonicalStatus)
      if (status) changes.status = status
      const priority = canonical(args.priority, 'priority', PRIORITY_VALUES, canonicalPriority)
      if (priority) changes.priority = priority
      let updated = await writeProvider(ctx, 'updateIssueProperties')(i.projectId, i.iid, changes)
      const labels =
        args.labels === undefined
          ? undefined
          : await validateLabels(ctx, i.projectId, args.labels, args.createMissingLabels === true)
      if (labels || args.assigneeIds !== undefined) {
        updated = await writeProvider(ctx, 'updateIssue')(i.projectId, i.iid, {
          ...(labels ? { labels } : {}),
          ...(args.assigneeIds === undefined
            ? {}
            : { assigneeIds: numberArray(args.assigneeIds, 'assigneeIds') }),
        })
      }
      return updated
    }
    if (name === 'create_blocking') {
      const s = await resolved(ctx, requireString('source'))
      const t = await resolved(ctx, requireString('target'))
      return await writeProvider(ctx, 'updateIssue')(s.projectId, s.iid, {
        labels: withBlockingLink(s, t),
      })
    }
    if (['start_issue', 'handoff_issue', 'resume_issue', 'complete_issue'].includes(name)) {
      const i = await resolved(ctx, requireString('reference'))
      const lifecycleTargets: Record<
        'start_issue' | 'handoff_issue' | 'resume_issue' | 'complete_issue',
        'in_progress' | 'paused' | 'completed'
      > = {
        start_issue: 'in_progress',
        handoff_issue: 'paused',
        resume_issue: 'in_progress',
        complete_issue: 'completed',
      }
      const lifecycleName = name as keyof typeof lifecycleTargets
      const target = lifecycleTargets[lifecycleName]
      const properties = readIssueProperties(i)
      // A Status Horizon cannot read is a conflict to resolve, not a Backlog.
      if (properties.conflicts.status)
        throw new McpToolError('conflict', 'Issue carries conflicting or unknown Status labels', {
          statusLabels: i.labels.filter((label) => label.startsWith('horizon::status::')),
          valid: STATUS_VALUES,
        })
      const statusKeys: Record<IssueStatus, 'backlog' | 'in_progress' | 'paused' | 'completed'> = {
        Backlog: 'backlog',
        'Em andamento': 'in_progress',
        Pausada: 'paused',
        Concluído: 'completed',
      }
      const currentKey = statusKeys[properties.status]
      const allowed: Record<typeof lifecycleName, readonly string[]> = {
        start_issue: ['backlog', 'in_progress'],
        handoff_issue: ['in_progress', 'paused'],
        resume_issue: ['paused', 'in_progress'],
        complete_issue: ['backlog', 'in_progress', 'paused', 'completed'],
      }
      if (!allowed[lifecycleName].includes(currentKey))
        throw new McpToolError('conflict', `Invalid lifecycle transition from ${currentKey}`, {
          currentStatus: currentKey,
          targetStatus: target,
        })
      const body =
        name === 'handoff_issue'
          ? requireString('handoff_text')
          : name === 'complete_issue'
            ? requireString('report')
            : `${name === 'start_issue' ? 'Implementation started.' : 'Implementation resumed.'}`
      const stamp = citation()
      const text = `${stamp}\n\n${body}`
      const assigneeIds =
        args.assigneeIds === undefined
          ? undefined
          : [...numberArray(args.assigneeIds, 'assigneeIds')]
      const effects: {
        status: 'applied' | 'failed' | 'unknown'
        comment: 'applied' | 'failed' | 'unknown'
        assignment: 'applied' | 'skipped' | 'failed' | 'unknown'
      } = { status: 'unknown', comment: 'unknown', assignment: assigneeIds ? 'unknown' : 'skipped' }
      const statusLabels: Record<typeof target, IssueStatus> = {
        in_progress: 'Em andamento',
        paused: 'Pausada',
        completed: 'Concluído',
      }
      let updatedIssue: ProviderIssue = i
      try {
        if (currentKey !== target) {
          updatedIssue = await writeProvider(ctx, 'updateIssueProperties')(i.projectId, i.iid, {
            status: statusLabels[target],
          })
          effects.status = 'applied'
          if (assigneeIds) {
            try {
              updatedIssue = await writeProvider(ctx, 'updateIssue')(i.projectId, i.iid, {
                assigneeIds,
              })
              effects.assignment = 'applied'
            } catch (e) {
              effects.assignment = 'failed'
              throw new McpToolError('provider_error', 'Lifecycle assignment update failed', {
                effects,
                error: e instanceof Error ? e.message : e,
              })
            }
          }
        } else if (assigneeIds) {
          updatedIssue = await writeProvider(ctx, 'updateIssue')(i.projectId, i.iid, {
            assigneeIds,
          })
          effects.assignment = 'applied'
        }
      } catch (e) {
        if (effects.status !== 'applied') effects.status = 'failed'
        if (effects.assignment === 'unknown') effects.assignment = 'failed'
        throw new McpToolError('provider_error', 'Lifecycle status update failed', {
          effects,
          error: e instanceof Error ? e.message : e,
        })
      }
      try {
        const comments = await writeProvider(ctx, 'listComments')(i.projectId, i.iid)
        if (!comments.some((c: ProviderComment) => c.body === text))
          await writeProvider(ctx, 'createComment')(i.projectId, i.iid, text)
        effects.comment = 'applied'
      } catch (e) {
        throw new McpToolError('provider_error', 'Lifecycle comment update failed', {
          effects,
          error: e instanceof Error ? e.message : e,
        })
      }
      if (typeof ctx.provider.readIssue === 'function') {
        try {
          updatedIssue = await writeProvider(ctx, 'readIssue')(i.projectId, i.iid)
        } catch {
          // The transition already succeeded; the mutation response is the best available snapshot.
        }
      }
      return { issue: updatedIssue, status: target, effects, citation: stamp }
    }
    throw new McpToolError('not_found', `Unknown tool: ${name}`)
  } catch (e) {
    if (e instanceof McpToolError) throw e
    throw new McpToolError('provider_error', e instanceof Error ? e.message : 'Provider error', e)
  }
}
