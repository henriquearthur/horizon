import {
  selectedProjects,
  type ProviderIssue,
  type ProviderComment,
  type ProviderMergeRequest,
  type ProviderWriteContract,
} from '@horizon/domain'
import type {
  CreateIssueInput,
  IssuePriority,
  IssueStatus,
  UpdateIssueInput,
} from '@horizon/domain'
import {
  cacheWrittenIssue,
  cacheCreatedComment,
  projectMetadata,
  providerCatalog,
  providerSnapshot,
  reader,
  writer,
  type ProviderSnapshot,
} from './gitlab'
import { scopeStore } from './scope-store'
import { TimedCache } from './timed-cache'

const cachedRead = <T>(
  caches: Map<string, TimedCache<T>>,
  key: string,
  load: () => Promise<T>,
): Promise<T> => {
  let cache = caches.get(key)
  if (!cache) {
    cache = new TimedCache(15_000, load)
    if (caches.size >= 100) caches.delete(caches.keys().next().value!)
    caches.set(key, cache)
  }
  return cache.get()
}

/** What the shell needs to render the Inbox in one round trip. */
export type RuntimeSnapshot = ProviderSnapshot

export class RuntimeService {
  readonly #comments = new Map<string, TimedCache<readonly ProviderComment[]>>()
  readonly #mergeRequests = new Map<string, TimedCache<readonly ProviderMergeRequest[]>>()
  constructor(
    private readonly snapshotOf: typeof providerSnapshot = providerSnapshot,
    private readonly writeProvider: () => ProviderWriteContract = writer,
  ) {}

  snapshot(options: { force?: boolean } = {}): Promise<RuntimeSnapshot> {
    return this.snapshotOf(options.force ?? false)
  }

  /** Members and labels of one project, for the forms that need them. */
  projectMetadata(projectId: number) {
    return projectMetadata(projectId)
  }

  readIssue(projectId: number, iid: number) {
    return this.writeProvider().readIssue(projectId, iid)
  }

  listMergeRequests(projectId: number, iid: number) {
    return cachedRead(
      this.#mergeRequests,
      `${projectId}:${iid}`,
      () => this.writeProvider().listMergeRequests?.(projectId, iid) ?? Promise.resolve([]),
    )
  }

  listComments(projectId: number, iid: number) {
    return cachedRead(this.#comments, `${projectId}:${iid}`, () =>
      this.writeProvider().listComments(projectId, iid),
    )
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
    this.#comments.get(`${projectId}:${iid}`)?.invalidate()
    cacheCreatedComment(projectId, iid)
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
   * Patch only the confirmed Issue; keep the rest of the snapshot warm.
   */
  private async written(action: () => Promise<ProviderIssue>): Promise<ProviderIssue> {
    const issue = await action()
    this.#comments.get(`${issue.projectId}:${issue.iid}`)?.invalidate()
    cacheWrittenIssue(issue)
    return issue
  }
}

export const runtime = new RuntimeService()
