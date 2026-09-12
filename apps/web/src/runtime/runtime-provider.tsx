import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import type { ProviderIssue, ProviderWriteContract } from '@horizon/domain'
import { issueCollection } from '~/db/collections'
import {
  createRuntimeComment,
  createRuntimeIssue,
  getIssueDetail,
  getRuntimeSnapshot,
  setRuntimeIssueState,
  updateRuntimeIssue,
  updateRuntimeIssueProperties,
} from '~/server/runtime-functions'
import type { RuntimeSnapshot } from '~/server/runtime'

interface HorizonRuntimeValue {
  readonly snapshot: RuntimeSnapshot | undefined
  readonly loading: boolean
  readonly refreshing: boolean
  readonly error: string | undefined
  readonly lastUpdated: Date | undefined
  readonly refresh: () => Promise<void>
  readonly provider: ProviderWriteContract
  readonly replaceIssue: (issue: ProviderIssue) => void
}

const HorizonRuntimeContext = createContext<HorizonRuntimeValue | undefined>(undefined)

export function HorizonRuntimeProvider({
  children,
  loadSnapshot = () => getRuntimeSnapshot(),
  pollingIntervalMs = Number(import.meta.env.VITE_HORIZON_POLL_INTERVAL_MS ?? 30_000),
}: {
  readonly children: React.ReactNode
  readonly loadSnapshot?: () => Promise<RuntimeSnapshot>
  readonly pollingIntervalMs?: number
}) {
  const [snapshot, setSnapshot] = useState<RuntimeSnapshot>()
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState<string>()
  const [lastUpdated, setLastUpdated] = useState<Date>()

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
    setLastUpdated(new Date())
  }, [])

  const refresh = useCallback(async () => {
    setRefreshing(true)
    setError(undefined)
    try {
      await cache(await loadSnapshot())
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível atualizar a Inbox.')
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }, [cache, loadSnapshot])

  useEffect(() => void refresh(), [refresh])
  useEffect(() => {
    if (!(pollingIntervalMs > 0)) return
    const timer = globalThis.setInterval(() => void refresh(), pollingIntervalMs)
    const reactivate = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', reactivate)
    globalThis.addEventListener('focus', reactivate)
    return () => {
      globalThis.clearInterval(timer)
      document.removeEventListener('visibilitychange', reactivate)
      globalThis.removeEventListener('focus', reactivate)
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
      readIssue: async (projectId, iid) =>
        (await getIssueDetail({ data: { projectId, iid } })).issue,
      listComments: async (projectId, iid) =>
        (await getIssueDetail({ data: { projectId, iid } })).comments,
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
      createComment: (projectId, iid, body) =>
        createRuntimeComment({ data: { projectId, iid, body } }),
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

  return (
    <HorizonRuntimeContext.Provider
      value={{ snapshot, loading, refreshing, error, lastUpdated, refresh, provider, replaceIssue }}
    >
      {children}
    </HorizonRuntimeContext.Provider>
  )
}

export function useHorizonRuntime(): HorizonRuntimeValue {
  const value = useContext(HorizonRuntimeContext)
  if (!value) throw new Error('useHorizonRuntime deve ser usado dentro de HorizonRuntimeProvider.')
  return value
}
