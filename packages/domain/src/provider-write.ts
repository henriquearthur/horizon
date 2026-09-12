import type { ProviderConnection, ProviderUser } from './provider.ts'
import type { ProviderIssue } from './provider-read.ts'
import type { IssuePriority, IssueStatus } from './properties.ts'

export interface ProviderComment {
  readonly id: number
  readonly body: string
  readonly author?: ProviderUser
  readonly createdAt: string
  readonly system: boolean
}

export interface CreateIssueInput {
  readonly projectId: number
  readonly title: string
  readonly description?: string
  readonly assigneeIds?: readonly number[]
  readonly labels?: readonly string[]
}

export interface UpdateIssueInput {
  readonly title?: string
  readonly description?: string
  readonly assigneeIds?: readonly number[]
  readonly labels?: readonly string[]
}

export interface ProviderWriteContract {
  readIssue(projectId: number, iid: number): Promise<ProviderIssue>
  listComments(projectId: number, iid: number): Promise<readonly ProviderComment[]>
  createIssue(input: CreateIssueInput): Promise<ProviderIssue>
  updateIssue(projectId: number, iid: number, input: UpdateIssueInput): Promise<ProviderIssue>
  createComment(projectId: number, iid: number, body: string): Promise<ProviderComment>
  setIssueState(projectId: number, iid: number, state: 'opened' | 'closed'): Promise<ProviderIssue>
  updateIssueProperties(
    projectId: number,
    iid: number,
    changes: { status?: IssueStatus; priority?: IssuePriority },
  ): Promise<ProviderIssue>
}

export class ProviderWriteError extends Error {
  readonly status: number
  readonly code: 'unauthorized' | 'forbidden' | 'unavailable' | 'invalid-response'

  constructor(message: string, status: number) {
    super(message)
    this.name = 'ProviderWriteError'
    this.status = status
    this.code =
      status === 401
        ? 'unauthorized'
        : status === 403
          ? 'forbidden'
          : status >= 500
            ? 'unavailable'
            : 'invalid-response'
  }
}

const asUser = (value: any): ProviderUser | undefined =>
  typeof value?.id === 'number' && typeof value?.username === 'string'
    ? {
        id: value.id,
        username: value.username,
        name: typeof value.name === 'string' ? value.name : value.username,
        ...(typeof value.avatar_url === 'string' ? { avatarUrl: value.avatar_url } : {}),
      }
    : undefined

const asIssue = (value: any, projectId: number): ProviderIssue => {
  if (!(
    typeof value?.id === 'number' &&
    typeof value?.iid === 'number' &&
    typeof value?.title === 'string' &&
    (value?.state === 'opened' || value?.state === 'closed') &&
    typeof value?.web_url === 'string'
  ))
    throw new ProviderWriteError('Resposta inválida do GitLab.', 502)
  const author = asUser(value.author)
  return {
    id: value.id,
    iid: value.iid,
    projectId,
    title: value.title,
    ...(typeof value.description === 'string' ? { description: value.description } : {}),
    state: value.state,
    webUrl: value.web_url,
    ...(author ? { author } : {}),
    assignees: Array.isArray(value.assignees)
      ? value.assignees.flatMap((item: unknown) => {
          const mapped = asUser(item)
          return mapped ? [mapped] : []
        })
      : [],
    labels: Array.isArray(value.labels)
      ? value.labels.filter((item: unknown): item is string => typeof item === 'string')
      : [],
  }
}

const asComment = (value: any): ProviderComment => {
  if (!(
    typeof value?.id === 'number' &&
    typeof value?.body === 'string' &&
    typeof value?.created_at === 'string'
  ))
    throw new ProviderWriteError('Resposta inválida do GitLab.', 502)
  const author = asUser(value.author)
  return {
    id: value.id,
    body: value.body,
    createdAt: value.created_at,
    system: value.system === true,
    ...(author ? { author } : {}),
  }
}

/** GitLab REST v4 write adapter. Mutations return the Provider-confirmed record. */
export class GitLabWriteProvider implements ProviderWriteContract {
  readonly #baseUrl: URL
  constructor(
    private readonly connection: ProviderConnection,
    private readonly fetcher: typeof fetch = fetch,
    private readonly options: { maxRetries?: number; retryDelayMs?: number } = {},
  ) {
    this.#baseUrl = new URL(connection.url)
  }

  async #request(path: string, init?: RequestInit): Promise<any> {
    const prefix = this.#baseUrl.pathname.replace(/\/$/, '')
    const url = new URL(`${prefix}/api/v4/${path}`, this.#baseUrl)
    let response: Response | undefined
    const safe = !init?.method || init.method === 'GET' || init.method === 'PUT'
    const retries = safe ? Math.max(0, this.options.maxRetries ?? 2) : 0
    for (let attempt = 0; ; attempt++) {
      try {
        response = await this.fetcher(url, {
          ...init,
          headers: {
            'PRIVATE-TOKEN': this.connection.token,
            Accept: 'application/json',
            ...(init?.body ? { 'Content-Type': 'application/json' } : {}),
          },
        })
      } catch {
        if (attempt >= retries)
          throw new ProviderWriteError('Não foi possível conectar ao GitLab.', 503)
        await this.#pause(attempt)
        continue
      }
      if (response.ok || !this.#transient(response.status) || attempt >= retries) break
      await this.#pause(attempt)
    }
    if (!response) throw new ProviderWriteError('Não foi possível conectar ao GitLab.', 503)
    if (!response.ok) {
      const message =
        response.status === 401
          ? 'Token inválido ou expirado.'
          : response.status === 403
            ? 'Você não tem permissão para realizar esta ação no GitLab.'
            : 'O GitLab não confirmou a alteração.'
      throw new ProviderWriteError(message, response.status)
    }
    try {
      return await response.json()
    } catch {
      throw new ProviderWriteError('Resposta inválida do GitLab.', 502)
    }
  }
  #transient(status: number) {
    return status === 408 || status === 429 || status >= 500
  }
  #pause(attempt: number) {
    const delay = this.options.retryDelayMs ?? 0
    return delay > 0
      ? new Promise<void>((resolve) => setTimeout(resolve, delay * 2 ** attempt))
      : Promise.resolve()
  }

  readIssue(projectId: number, iid: number) {
    return this.#request(`projects/${projectId}/issues/${iid}`).then((value) =>
      asIssue(value, projectId),
    )
  }
  listComments(projectId: number, iid: number) {
    return this.#request(
      `projects/${projectId}/issues/${iid}/notes?sort=asc&order_by=created_at`,
    ).then((value: unknown) =>
      Array.isArray(value)
        ? value.map(asComment)
        : (() => {
            throw new ProviderWriteError('Resposta inválida do GitLab.', 502)
          })(),
    )
  }
  createIssue(input: CreateIssueInput) {
    const { projectId, ...fields } = input
    return this.#request(`projects/${projectId}/issues`, {
      method: 'POST',
      body: JSON.stringify(this.#fields(fields)),
    }).then((value) => asIssue(value, projectId))
  }
  updateIssue(projectId: number, iid: number, input: UpdateIssueInput) {
    return this.#request(`projects/${projectId}/issues/${iid}`, {
      method: 'PUT',
      body: JSON.stringify(this.#fields(input)),
    }).then((value) => asIssue(value, projectId))
  }
  createComment(projectId: number, iid: number, body: string) {
    return this.#request(`projects/${projectId}/issues/${iid}/notes`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }).then(asComment)
  }
  setIssueState(projectId: number, iid: number, state: 'opened' | 'closed') {
    return this.#request(`projects/${projectId}/issues/${iid}`, {
      method: 'PUT',
      body: JSON.stringify({ state_event: state === 'closed' ? 'close' : 'reopen' }),
    }).then((value) => asIssue(value, projectId))
  }
  async updateIssueProperties(
    projectId: number,
    iid: number,
    changes: { status?: IssueStatus; priority?: IssuePriority },
  ) {
    const { writeIssueProperties, stateForStatus } = await import('./properties.ts')
    const issue = await this.readIssue(projectId, iid)
    const labels = writeIssueProperties(issue.labels, changes)
    const updated = await this.updateIssue(projectId, iid, { labels })
    return changes.status
      ? this.setIssueState(projectId, iid, stateForStatus(changes.status))
      : updated
  }

  #fields(input: Omit<CreateIssueInput, 'projectId'> | UpdateIssueInput): Record<string, unknown> {
    return {
      ...('title' in input ? { title: input.title } : {}),
      ...('description' in input ? { description: input.description ?? '' } : {}),
      ...('assigneeIds' in input ? { assignee_ids: input.assigneeIds ?? [] } : {}),
      ...('labels' in input ? { labels: (input.labels ?? []).join(',') } : {}),
    }
  }
}

export const createGitLabWriteProvider = (
  connection: ProviderConnection,
  fetcher?: typeof fetch,
): ProviderWriteContract => new GitLabWriteProvider(connection, fetcher)
