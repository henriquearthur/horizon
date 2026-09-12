import { selectedProjects, type ProviderIssue, type ProviderWriteContract } from '@horizon/domain'
import type {
  CreateIssueInput,
  IssuePriority,
  IssueStatus,
  UpdateIssueInput,
} from '@horizon/domain'
import {
  invalidateIssues,
  providerCatalog,
  providerSnapshot,
  reader,
  writer,
  type ProviderSnapshot,
} from './gitlab'
import { scopeStore } from './scope-store'

/** What the shell needs to render the Inbox in one round trip. */
export type RuntimeSnapshot = ProviderSnapshot

export class RuntimeService {
  constructor(
    private readonly snapshotOf: typeof providerSnapshot = providerSnapshot,
    private readonly writeProvider: () => ProviderWriteContract = writer,
  ) {}

  snapshot(options: { force?: boolean } = {}): Promise<RuntimeSnapshot> {
    return this.snapshotOf(options.force ?? false)
  }

  readIssue(projectId: number, iid: number) {
    return this.writeProvider().readIssue(projectId, iid)
  }

  listMergeRequests(projectId: number, iid: number) {
    return this.writeProvider().listMergeRequests?.(projectId, iid) ?? Promise.resolve([])
  }

  listComments(projectId: number, iid: number) {
    return this.writeProvider().listComments(projectId, iid)
  }

  async searchDiscussions(query: string) {
    const [{ projects }, scope] = await Promise.all([providerCatalog(), scopeStore.getScope()])
    return reader().searchDiscussions(
      query,
      selectedProjects(projects, scope).map((project) => project.id),
    )
  }

  async createIssue(input: CreateIssueInput): Promise<ProviderIssue> {
    return this.written(() => this.writeProvider().createIssue(input))
  }

  async updateIssue(
    projectId: number,
    iid: number,
    input: UpdateIssueInput,
  ): Promise<ProviderIssue> {
    return this.written(() => this.writeProvider().updateIssue(projectId, iid, input))
  }

  async createComment(projectId: number, iid: number, body: string) {
    const comment = await this.writeProvider().createComment(projectId, iid, body)
    invalidateIssues()
    return comment
  }

  async setIssueState(
    projectId: number,
    iid: number,
    state: 'opened' | 'closed',
  ): Promise<ProviderIssue> {
    return this.written(() => this.writeProvider().setIssueState(projectId, iid, state))
  }

  async updateIssueProperties(
    projectId: number,
    iid: number,
    changes: { status?: IssueStatus; priority?: IssuePriority },
  ): Promise<ProviderIssue> {
    return this.written(() => this.writeProvider().updateIssueProperties(projectId, iid, changes))
  }

  /**
   * A confirmed write makes the cached Issue list stale. The browser already
   * got the confirmed record back, so the next poll just picks up the rest.
   */
  private async written(action: () => Promise<ProviderIssue>): Promise<ProviderIssue> {
    const issue = await action()
    invalidateIssues()
    return issue
  }
}

export const runtime = new RuntimeService()
