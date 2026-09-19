import { useEffect, useMemo, useRef, useState } from 'react'
import {
  initiativeIdsFromLabels,
  isHorizonLabel,
  type ProviderComment,
  type ProviderIssue,
  type ProviderWriteContract,
} from '@horizon/domain'
import { IssueDetailPanel } from '~/components/issue/issue-detail-panel'
import { useInitiatives } from '~/db/use-initiatives'
import { byAge } from '~/lib/issue-presentation'
import { issueRefParam } from '~/lib/issue-ref'
import type { RuntimeSnapshot } from '~/server/runtime'

/**
 * Discussions already read stay around, so reopening an Issue shows its
 * comments at once instead of an empty list.
 */
const discussionCache = new Map<string, readonly ProviderComment[]>()

/**
 * Everything the Detail needs around one Issue — discussion, sub-issues,
 * parent, initiatives — read once from the snapshot. The Drawer and the
 * dedicated page render the same Detail, so they share this wiring.
 */
export function IssueDetailContainer({
  snapshot,
  provider,
  issue,
  variant = 'drawer',
  onClose,
  onSelectRef,
  issueHref,
  expandHref,
  onExpand,
  error,
}: {
  readonly snapshot: RuntimeSnapshot
  readonly provider: ProviderWriteContract
  readonly issue: ProviderIssue
  readonly variant?: 'drawer' | 'page'
  readonly onClose: () => void
  /** Opens another Issue of the Escopo, by its URL reference. */
  readonly onSelectRef: (ref: string) => void
  readonly issueHref: (iid: number) => string
  readonly expandHref?: string | undefined
  readonly onExpand?: (() => void) | undefined
  readonly error?: string | undefined
}) {
  const cacheKey = `${issue.projectId}:${issue.iid}`
  const [comments, setComments] = useState<readonly ProviderComment[]>(
    () => discussionCache.get(cacheKey) ?? [],
  )
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string>()
  const request = useRef(0)

  useEffect(() => {
    setComments(discussionCache.get(cacheKey) ?? [])
    setLoadError(undefined)
    setLoading(true)
    const id = ++request.current
    let active = true
    void provider
      .listComments(issue.projectId, issue.iid)
      .then((loaded) => {
        discussionCache.set(cacheKey, loaded)
        if (discussionCache.size > 50)
          discussionCache.delete(discussionCache.keys().next().value!)
        if (active) setComments(loaded)
      })
      .catch((cause: unknown) => {
        if (active)
          setLoadError(
            cause instanceof Error ? cause.message : 'Não foi possível carregar a discussão.',
          )
      })
      .finally(() => {
        if (active && request.current === id) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [cacheKey, issue.projectId, issue.iid, provider])

  const subIssues = useMemo(
    () =>
      snapshot.issues
        .filter((item) => item.projectId === issue.projectId && item.parentIid === issue.iid)
        .sort(byAge),
    [snapshot.issues, issue.projectId, issue.iid],
  )
  const parent = useMemo(
    () =>
      issue.parentIid === undefined
        ? undefined
        : snapshot.issues.find(
            (item) => item.projectId === issue.projectId && item.iid === issue.parentIid,
          ),
    [snapshot.issues, issue.projectId, issue.parentIid],
  )
  const initiativeIds = useMemo(
    () => snapshot.issues.flatMap((item) => initiativeIdsFromLabels(item.labels)),
    [snapshot.issues],
  )
  const initiatives = useInitiatives(initiativeIds)
  const availableLabels = useMemo(
    () =>
      [...new Set(snapshot.issues.flatMap((item) => item.labels))].filter(
        (label) => !isHorizonLabel(label),
      ),
    [snapshot.issues],
  )
  const shown = error ?? loadError

  return (
    <>
      <IssueDetailPanel
        key={issue.id}
        issue={issue}
        comments={comments}
        provider={provider}
        onClose={onClose}
        subIssues={subIssues}
        parent={parent}
        onOpenIssue={(next) => onSelectRef(issueRefParam(next, snapshot.projects))}
        allIssues={snapshot.issues}
        projects={snapshot.projects}
        initiatives={initiatives}
        onCommentCreated={(comment) =>
          setComments((current) => {
            const next = [...current, comment]
            discussionCache.set(cacheKey, next)
            return next
          })
        }
        users={snapshot.users}
        currentUser={snapshot.connection.user}
        loading={loading}
        availableLabels={availableLabels}
        issueHref={issueHref}
        onIssueSelect={(iid) =>
          onSelectRef(issueRefParam({ projectId: issue.projectId, iid }, snapshot.projects))
        }
        variant={variant}
        {...(expandHref ? { expandHref } : {})}
        {...(onExpand ? { onExpand } : {})}
      />
      {shown ? (
        <p
          role="alert"
          className="fixed right-5 bottom-5 z-50 rounded-lg bg-destructive px-3 py-2 text-xs text-destructive-foreground"
        >
          {shown}
        </p>
      ) : null}
    </>
  )
}
