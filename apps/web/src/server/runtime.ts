import {
  GitLabReadProvider,
  GitLabWriteProvider,
  selectedGroups,
  selectedProjects,
  type CreateIssueInput,
  type IssuePriority,
  type IssueStatus,
  type ProviderComment,
  type ProviderGroup,
  type ProviderIssue,
  type ProviderReadContract,
  type ProviderWriteContract,
  type UpdateIssueInput,
} from '@horizon/domain'
import { connectionStore, type ConnectionStore, type ScopeSelection } from './connection-store'

export interface RuntimeSnapshot {
  readonly connection: {
    readonly url: string
    readonly user: {
      readonly id: number
      readonly username: string
      readonly name: string
      readonly avatarUrl?: string
    }
  }
  readonly scope: ScopeSelection
  readonly groups: readonly ProviderGroup[]
  readonly projects: Awaited<ReturnType<ProviderReadContract['readScope']>>['projects']
  readonly issues: readonly ProviderIssue[]
  readonly users: Awaited<ReturnType<ProviderReadContract['listUsers']>>['items']
  readonly labels: Awaited<ReturnType<ProviderReadContract['listLabels']>>['items']
}

export class RuntimeService {
  constructor(
    private readonly store: ConnectionStore = connectionStore,
    private readonly readFactory: (credentials: {
      url: string
      token: string
    }) => ProviderReadContract = (credentials) => new GitLabReadProvider(credentials),
    private readonly writeFactory: (credentials: {
      url: string
      token: string
    }) => ProviderWriteContract = (credentials) => new GitLabWriteProvider(credentials),
  ) {}

  async snapshot(session: string | undefined): Promise<RuntimeSnapshot> {
    await this.store.requireSession(session)
    const [credentials, connection, scope] = await Promise.all([
      this.store.getCredentials(),
      this.store.getConnection(),
      this.store.getScope(),
    ])
    if (!credentials || !connection)
      throw new Error('Configure uma Conexão antes de abrir a Inbox.')
    const reader = this.readFactory(credentials)
    const [data, groups] = await Promise.all([reader.readScope(scope), readAllGroups(reader)])
    const [users, labels] = await Promise.all([
      Promise.all(
        data.projects.map((project) => readAllPages((page) => reader.listUsers(project.id, page))),
      ),
      Promise.all(
        data.projects.map((project) => readAllPages((page) => reader.listLabels(project.id, page))),
      ),
    ])
    return {
      connection,
      scope,
      groups: selectedGroups(groups, scope),
      projects: data.projects,
      issues: data.issues,
      users: [...new Map(users.flat().map((user) => [user.id, user])).values()],
      labels: [...new Map(labels.flat().map((label) => [label.name, label])).values()],
    }
  }

  async issueDetail(session: string | undefined, projectId: number, iid: number) {
    const provider = await this.writer(session)
    const [issue, comments] = await Promise.all([
      provider.readIssue(projectId, iid),
      provider.listComments(projectId, iid),
    ])
    return { issue, comments }
  }

  async searchDiscussions(session: string | undefined, query: string) {
    await this.store.requireSession(session)
    const [credentials, scope] = await Promise.all([
      this.store.getCredentials(),
      this.store.getScope(),
    ])
    if (!credentials) throw new Error('Configure uma Conexão antes de buscar discussões.')
    const reader = this.readFactory(credentials)
    const projects = await readAllPages((page) => reader.listProjects(page))
    return reader.searchDiscussions(
      query,
      selectedProjects(projects, scope).map((project) => project.id),
    )
  }

  async createIssue(session: string | undefined, input: CreateIssueInput): Promise<ProviderIssue> {
    return (await this.writer(session)).createIssue(input)
  }

  async updateIssue(
    session: string | undefined,
    projectId: number,
    iid: number,
    input: UpdateIssueInput,
  ): Promise<ProviderIssue> {
    return (await this.writer(session)).updateIssue(projectId, iid, input)
  }

  async createComment(
    session: string | undefined,
    projectId: number,
    iid: number,
    body: string,
  ): Promise<ProviderComment> {
    return (await this.writer(session)).createComment(projectId, iid, body)
  }

  async setIssueState(
    session: string | undefined,
    projectId: number,
    iid: number,
    state: 'opened' | 'closed',
  ): Promise<ProviderIssue> {
    return (await this.writer(session)).setIssueState(projectId, iid, state)
  }

  async updateIssueProperties(
    session: string | undefined,
    projectId: number,
    iid: number,
    changes: { status?: IssueStatus; priority?: IssuePriority },
  ): Promise<ProviderIssue> {
    return (await this.writer(session)).updateIssueProperties(projectId, iid, changes)
  }

  private async writer(session: string | undefined): Promise<ProviderWriteContract> {
    await this.store.requireSession(session)
    const credentials = await this.store.getCredentials()
    if (!credentials) throw new Error('Configure uma Conexão antes de alterar issues.')
    return this.writeFactory(credentials)
  }
}

async function readAllGroups(reader: ProviderReadContract): Promise<readonly ProviderGroup[]> {
  const groups: ProviderGroup[] = []
  for (let page = 1; ; page += 1) {
    const result = await reader.listGroups(page)
    groups.push(...result.items)
    if (!result.nextPage) return groups
  }
}

async function readAllPages<T>(
  read: (page: number) => Promise<{ items: readonly T[]; nextPage?: number }>,
): Promise<readonly T[]> {
  const items: T[] = []
  for (let page = 1; ; page += 1) {
    const result = await read(page)
    items.push(...result.items)
    if (!result.nextPage) return items
  }
}

export const runtime = new RuntimeService()
