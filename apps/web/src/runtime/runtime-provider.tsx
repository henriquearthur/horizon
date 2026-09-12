import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import type { ProviderIssue, ProviderWriteContract } from '@horizon/domain'
import { issueCollection } from '~/db/collections'
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
  readonly refresh: (options?: { force?: boolean }) => Promise<void>
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
  const running = useRef(false)

  const cache = useCallback(async (next: RuntimeSnapshot) => {
    await issueCollection.preload()
    const nextIds = new Set(next.issues.map((issue) => issue.id))
    const stale = [...issueCollection.keys()].filter((id) => !nextIds.has(id))
    if (stale.length) issueCollection.delete(stale)
    for (const issue of next.issues) {
      if (issueCollection.has(issue.id))
        issueCollection.update(issue.id, (draft) => Object.assign(draft, issue))
      else issueCollection.insert(issue)
    }
    setSnapshot(next)
    writeRuntimeCache(next)
    loadedAt.current = Date.now()
    setLastUpdated(new Date())
  }, [])

  const refresh = useCallback(
    async ({ force = false }: { force?: boolean } = {}) => {
      // One read at a time: a focus event landing on top of the poll used to
      // double the load on GitLab for no new data.
      if (running.current) return
      running.current = true
      setRefreshing(true)
      try {
        await cache(await loadSnapshot({ force }))
        setError(undefined)
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a Inbox.')
      } finally {
        running.current = false
        setLoading(false)
        setRefreshing(false)
      }
    },
    [cache, loadSnapshot],
  )

  useEffect(() => {
    void refresh()
  }, [refresh])

  useEffect(() => {
    if (!(pollingIntervalMs > 0)) return
    const timer = globalThis.setInterval(() => void refresh(), pollingIntervalMs)
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

  const replaceIssue = useCallback((issue: ProviderIssue) => {
    setSnapshot((current) =>
      current
        ? {
            ...current,
            issues: current.issues.some((item) => item.id === issue.id)
              ? current.issues.map((item) => (item.id === issue.id ? issue : item))
              : [issue, ...current.issues],
          }
        : current,
    )
    if (issueCollection.has(issue.id))
      issueCollection.update(issue.id, (draft) => Object.assign(draft, issue))
    else issueCollection.insert(issue)
  }, [])

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
      updateIssue: async (projectId, iid, changes) => {
        const issue = await updateRuntimeIssue({ data: { projectId, iid, changes } })
        replaceIssue(issue)
        return issue
      },
      createComment: async (projectId, iid, body) => {
        const comment = await createRuntimeComment({ data: { projectId, iid, body } })
        setSnapshot((current) => current ? {
          ...current,
          issues: current.issues.map((issue) => issue.projectId === projectId && issue.iid === iid
            ? { ...issue, commentCount: (issue.commentCount ?? 0) + 1 } : issue),
        } : current)
        for (const issue of issueCollection.values()) {
          if (issue.projectId === projectId && issue.iid === iid) {
            issueCollection.update(issue.id, (draft) => { draft.commentCount = (draft.commentCount ?? 0) + 1 })
          }
        }
        return comment
      },
      setIssueState: async (projectId, iid, state) => {
        const issue = await setRuntimeIssueState({ data: { projectId, iid, state } })
        replaceIssue(issue)
        return issue
      },
      updateIssueProperties: async (projectId, iid, changes) => {
        const issue = await updateRuntimeIssueProperties({ data: { projectId, iid, changes } })
        replaceIssue(issue)
        return issue
      },
    }),
    [replaceIssue],
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
