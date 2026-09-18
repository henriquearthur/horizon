import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ProviderIssue, ProviderWriteContract } from '@horizon/domain'
import { stateForStatus, writeIssueProperties } from '@horizon/domain'
import {
  createRuntimeComment,
  createRuntimeIssue,
  getIssue,
  getIssueComments,
  getIssueMergeRequests,
  getRuntimeSnapshot,
  setRuntimeIssueState,
  updateRuntimeIssue,
  updateRuntimeIssueProperties,
} from '~/server/runtime-functions'
import type { RuntimeSnapshot } from '~/server/runtime'

interface HorizonRuntimeValue {
  readonly snapshot: RuntimeSnapshot | undefined
  /** True only while there is nothing to show yet. */
  readonly loading: boolean
  readonly refreshing: boolean
  readonly error: string | undefined
  readonly lastUpdated: Date | undefined
  /** Reloads the snapshot; `force` also bypasses the server-side cache. */
  readonly refresh: (options?: { force?: boolean; throwOnError?: boolean }) => Promise<void>
  readonly provider: ProviderWriteContract
  readonly replaceIssue: (issue: ProviderIssue) => void
}

const HorizonRuntimeContext = createContext<HorizonRuntimeValue | undefined>(undefined)
const RUNTIME_CACHE_KEY = 'horizon-runtime-snapshot-v1'
const defaultLoadSnapshot = (options: { force: boolean }) => getRuntimeSnapshot({ data: options })

/**
 * Polling is deliberately slow: the server keeps its own short-lived cache, and
 * a self-hosted GitLab punishes chatty clients with `429`.
 */
const DEFAULT_POLL_INTERVAL_MS = 120_000

export const replaceIssueInList = (
  issues: readonly ProviderIssue[],
  issue: ProviderIssue,
  preserveUpdatedAt = false,
): readonly ProviderIssue[] => {
  if (!issues.some((item) => item.id === issue.id)) return [issue, ...issues]
  return issues.map((item) =>
    item.id === issue.id ? merged(item, issue, preserveUpdatedAt) : item,
  )
}

/**
 * A write answers with the REST issue, and REST knows nothing about the
 * parent/child links: those are read from GraphQL when the snapshot is built.
 * Replacing the cached Issue with the answer would drop `parentIid` and
 * `hasChildren` — a sub-issue would jump to the top level, and one kept on
 * screen only by its parent would disappear until the next full read. So the
 * answer is merged over what is already known.
 */
const merged = (
  cached: ProviderIssue,
  issue: ProviderIssue,
  preserveUpdatedAt: boolean,
): ProviderIssue => {
  // A reopened Issue has no close date, even though the answer never says so.
  const { closedAt, ...previous } = cached
  const { closedAt: nextClosedAt, ...next } = issue
  return {
    ...previous,
    ...(issue.state === 'closed' && closedAt ? { closedAt } : {}),
    ...next,
    ...(issue.state === 'closed' && nextClosedAt ? { closedAt: nextClosedAt } : {}),
    // Assignment is metadata, not a reason to jump to the top of the list.
    ...(preserveUpdatedAt && cached.updatedAt ? { updatedAt: cached.updatedAt } : {}),
  }
}

/** Preserve record identity across polling so unchanged cards can skip rendering. */
export const shareSnapshot = (
  previous: RuntimeSnapshot | undefined,
  next: RuntimeSnapshot,
): RuntimeSnapshot => {
  if (!previous) return next
  const same = <T,>(left: T, right: T): T =>
    JSON.stringify(left) === JSON.stringify(right) ? left : right
  const byId = new Map(previous.issues.map((issue) => [issue.id, issue]))
  const issues = next.issues.map((issue) => {
    const cached = byId.get(issue.id)
    return cached ? same(cached, issue) : issue
  })
  return {
    ...next,
    issues:
      issues.length === previous.issues.length &&
      issues.every((issue, index) => issue === previous.issues[index])
        ? previous.issues
        : issues,
    projects: same(previous.projects, next.projects),
    groups: same(previous.groups, next.groups),
    users: same(previous.users, next.users),
    labels: same(previous.labels, next.labels),
    scope: same(previous.scope, next.scope),
    connection: same(previous.connection, next.connection),
  }
}

const readRuntimeCache = (): RuntimeSnapshot | undefined => {
  if (typeof window === 'undefined') return undefined
  try {
    const value: unknown = JSON.parse(window.localStorage.getItem(RUNTIME_CACHE_KEY) ?? 'null')
    return value && typeof value === 'object' && Array.isArray((value as RuntimeSnapshot).issues)
      ? (value as RuntimeSnapshot)
      : undefined
  } catch {
    return undefined
  }
}

const writeRuntimeCache = (snapshot: RuntimeSnapshot): void => {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(RUNTIME_CACHE_KEY, JSON.stringify(snapshot))
  } catch {
    // A full quota only costs the warm start; it must never break the session.
    try {
      window.localStorage.removeItem(RUNTIME_CACHE_KEY)
    } catch {
      /* storage unavailable */
    }
  }
}

export function HorizonRuntimeProvider({
  children,
  loadSnapshot = defaultLoadSnapshot,
  pollingIntervalMs = Number(
    import.meta.env.VITE_HORIZON_POLL_INTERVAL_MS ?? DEFAULT_POLL_INTERVAL_MS,
  ),
}: {
  readonly children: React.ReactNode
  readonly loadSnapshot?: (options: { force: boolean }) => Promise<RuntimeSnapshot>
  readonly pollingIntervalMs?: number
}) {
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot | undefined>(() =>
    loadSnapshot === defaultLoadSnapshot ? readRuntimeCache() : undefined,
  )
  const [loading, setLoading] = useState(snapshot === undefined)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string>()
  const [lastUpdated, setLastUpdated] = useState<Date>()
  const loadedAt = useRef(0)
  const running = useRef<Promise<void> | undefined>(undefined)

  const currentSnapshot = useRef(snapshot)
  const revision = useRef(0)
  const changedAt = useRef(new Map<number, number>())
  type Pending = {
    base: ProviderIssue
    patches: ((issue: ProviderIssue) => ProviderIssue)[]
    tail: Promise<unknown>
  }
  const pending = useRef(new Map<number, Pending>())

  const publish = useCallback((next: RuntimeSnapshot) => {
    currentSnapshot.current = next
    setSnapshot(next)
  }, [])

  // Storage is synchronous. Keep serialization out of the interaction that
  // moved a card, and coalesce consecutive writes into one persistence pass.
  useEffect(() => {
    if (!snapshot) return
    const timer = setTimeout(
      () =>
        writeRuntimeCache({
          ...snapshot,
          issues: snapshot.issues.map((issue) => pending.current.get(issue.id)?.base ?? issue),
        }),
      250,
    )
    return () => clearTimeout(timer)
  }, [snapshot])

  const cache = useCallback(
    async (next: RuntimeSnapshot, startedAt: number) => {
      const current = currentSnapshot.current
      if (current && JSON.stringify(current.scope) === JSON.stringify(next.scope)) {
        const protectedIssues = current.issues.filter(
          (issue) =>
            pending.current.has(issue.id) || (changedAt.current.get(issue.id) ?? 0) > startedAt,
        )
        const byId = new Map(protectedIssues.map((issue) => [issue.id, issue]))
        const nextIds = new Set(next.issues.map((issue) => issue.id))
        next = {
          ...next,
          issues: [
            ...next.issues.map((issue) => byId.get(issue.id) ?? issue),
            ...protectedIssues.filter((issue) => !nextIds.has(issue.id)),
          ],
        }
      }
      publish(shareSnapshot(current, next))
      loadedAt.current = Date.now()
      setLastUpdated(new Date())
    },
    [publish],
  )

  const refresh = useCallback(
    async ({
      force = false,
      throwOnError = false,
    }: { force?: boolean; throwOnError?: boolean } = {}) => {
      if (force && running.current) await running.current.catch(() => {})
      if (!running.current) {
        setRefreshing(true)
        const startedAt = revision.current
        const task = loadSnapshot({ force })
          .then(async (next) => {
            await cache(next, startedAt)
            setError(undefined)
          })
          .catch((cause: unknown) => {
            setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a Inbox.')
            throw cause
          })
          .finally(() => {
            if (running.current === task) running.current = undefined
            setLoading(false)
            setRefreshing(false)
          })
        running.current = task
      }
      try {
        await running.current
      } catch (cause) {
        if (throwOnError) throw cause
      }
    },
    [cache, loadSnapshot],
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!(pollingIntervalMs > 0)) return
    const timer = globalThis.setInterval(() => {
      if (document.visibilityState === 'visible') void refresh()
    }, pollingIntervalMs)
    // Coming back to the tab is worth one read, but only if the data aged out.
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      if (Date.now() - loadedAt.current >= pollingIntervalMs) void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      globalThis.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [pollingIntervalMs, refresh])

  const replaceIssue = useCallback(
    (issue: ProviderIssue, preserveUpdatedAt = false) => {
      const current = currentSnapshot.current
      if (!current) return
      changedAt.current.set(issue.id, ++revision.current)
      publish({ ...current, issues: replaceIssueInList(current.issues, issue, preserveUpdatedAt) })
    },
    [publish],
  )

  // Each issue has an ordered write queue. Later optimistic edits survive
  // earlier failures, and polling cannot replace edits with an older snapshot.
  const mutate = useCallback(
    (
      projectId: number,
      iid: number,
      patch: (issue: ProviderIssue) => ProviderIssue,
      action: () => Promise<ProviderIssue>,
      preserveUpdatedAt = false,
    ): Promise<ProviderIssue> => {
      const issue = currentSnapshot.current?.issues.find(
        (item) => item.projectId === projectId && item.iid === iid,
      )
      if (!issue)
        return action().then((result) => {
          replaceIssue(result)
          return result
        })
      let queue = pending.current.get(issue.id)
      if (!queue) {
        queue = { base: issue, patches: [], tail: Promise.resolve() }
        pending.current.set(issue.id, queue)
      }
      const entry = queue
      entry.patches.push(patch)
      replaceIssue(patch(issue), preserveUpdatedAt)
      const scope = JSON.stringify(currentSnapshot.current?.scope)
      const request = entry.tail.then(action)
      const settled = request
        .then((result) => {
          entry.base = merged(entry.base, result, preserveUpdatedAt)
          return result
        })
        .finally(() => {
          entry.patches.shift()
          const visible = entry.patches.reduce((value, apply) => apply(value), entry.base)
          if (!entry.patches.length) pending.current.delete(issue.id)
          if (scope === JSON.stringify(currentSnapshot.current?.scope))
            replaceIssue(visible, preserveUpdatedAt)
        })
      entry.tail = settled.catch(() => {})
      return settled
    },
    [replaceIssue],
  )

  const provider = useMemo<ProviderWriteContract>(
    () => ({
      readIssue: (projectId, iid) => getIssue({ data: { projectId, iid } }),
      listMergeRequests: (projectId, iid) => getIssueMergeRequests({ data: { projectId, iid } }),
      listComments: (projectId, iid) => getIssueComments({ data: { projectId, iid } }),
      createIssue: async (input) => {
        const issue = await createRuntimeIssue({ data: input })
        replaceIssue(issue)
        return issue
      },
      updateIssue: (projectId, iid, changes) =>
        mutate(
          projectId,
          iid,
          (issue) => ({
            ...issue,
            ...('title' in changes ? { title: changes.title! } : {}),
            ...('description' in changes ? { description: changes.description ?? '' } : {}),
            ...('labels' in changes ? { labels: changes.labels ?? [] } : {}),
            ...('assigneeIds' in changes
              ? {
                  assignees: (changes.assigneeIds ?? []).flatMap((id) => {
                    const user =
                      currentSnapshot.current?.users.find((item) => item.id === id) ??
                      issue.assignees.find((item) => item.id === id) ??
                      (currentSnapshot.current?.connection.user.id === id
                        ? currentSnapshot.current.connection.user
                        : undefined)
                    return user ? [user] : []
                  }),
                }
              : {}),
          }),
          () => updateRuntimeIssue({ data: { projectId, iid, changes } }),
          Object.keys(changes).every((key) => key === 'assigneeIds'),
        ),
      createComment: async (projectId, iid, body) => {
        const comment = await createRuntimeComment({ data: { projectId, iid, body } })
        const issue = currentSnapshot.current?.issues.find(
          (item) => item.projectId === projectId && item.iid === iid,
        )
        if (issue) {
          const queue = pending.current.get(issue.id)
          if (queue)
            queue.base = { ...queue.base, commentCount: (queue.base.commentCount ?? 0) + 1 }
          replaceIssue({ ...issue, commentCount: (issue.commentCount ?? 0) + 1 })
        }
        return comment
      },
      setIssueState: (projectId, iid, state) =>
        mutate(
          projectId,
          iid,
          (issue) => ({
            ...issue,
            state,
            ...(state === 'closed' ? { closedAt: new Date().toISOString() } : {}),
          }),
          () => setRuntimeIssueState({ data: { projectId, iid, state } }),
        ),
      updateIssueProperties: (projectId, iid, changes) =>
        mutate(
          projectId,
          iid,
          (issue) => ({
            ...issue,
            labels: writeIssueProperties(issue.labels, changes),
            ...(changes.status
              ? {
                  state: stateForStatus(changes.status),
                  ...(changes.status === 'Concluído' ? { closedAt: new Date().toISOString() } : {}),
                }
              : {}),
          }),
          () => updateRuntimeIssueProperties({ data: { projectId, iid, changes } }),
        ),
    }),
    [mutate, replaceIssue],
  )

  const value = useMemo<HorizonRuntimeValue>(
    () => ({ snapshot, loading, refreshing, error, lastUpdated, refresh, provider, replaceIssue }),
    [snapshot, loading, refreshing, error, lastUpdated, refresh, provider, replaceIssue],
  )

  return <HorizonRuntimeContext.Provider value={value}>{children}</HorizonRuntimeContext.Provider>
}

export function useHorizonRuntime(): HorizonRuntimeValue {
  const value = useContext(HorizonRuntimeContext)
  if (!value) throw new Error('useHorizonRuntime deve ser usado dentro de HorizonRuntimeProvider.')
  return value
}
