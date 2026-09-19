import { useCallback, useMemo } from 'react'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { EmptyState } from '~/components/shell/empty-state'
import { IssueDetailContainer } from '~/components/issue/issue-detail-container'
import { Skeleton } from '~/components/ui/skeleton'
import { findIssueByRef, issueRefParam } from '~/lib/issue-ref'
import { DEFAULT_VIEW_PARAM, horizonIssueHref, resolveShellSearch } from '~/lib/search'
import { getSetupStatus } from '~/server/setup-functions'
import { useHorizonRuntime } from '~/runtime/runtime-provider'
import { defaultViewMode } from '@horizon/domain'

/**
 * The dedicated address of an Issue — `/issue/DC-203`. The Drawer over the
 * Inbox stays the default; this page is where the expand button leads, and
 * where a shared link opens the Issue with the whole window for it.
 */
export const Route = createFileRoute('/issue/$ref')({
  beforeLoad: async ({ cause }) => {
    if (cause === 'stay') return
    const status = await getSetupStatus()
    if (!status.reachable) throw redirect({ to: '/setup' })
  },
  component: IssuePage,
})

function IssuePage() {
  const { ref } = Route.useParams()
  const search = Route.useSearch()
  const { viewParam, mode, query } = resolveShellSearch(search)
  const runtime = useHorizonRuntime()
  const navigate = useNavigate()
  const issue = useMemo(
    () => findIssueByRef(ref, runtime.snapshot?.issues ?? [], runtime.snapshot?.projects ?? []),
    [ref, runtime.snapshot?.issues, runtime.snapshot?.projects],
  )
  /** The reading context travels in the URL, so folding back keeps the View. */
  const collapseSearch = {
    ...(viewParam === DEFAULT_VIEW_PARAM ? {} : { view: viewParam }),
    ...(mode === defaultViewMode ? {} : { mode }),
    ...(query ? { q: query } : {}),
    ...(issue && runtime.snapshot
      ? { issue: issueRefParam(issue, runtime.snapshot.projects) }
      : {}),
  }
  const goToInbox = useCallback(
    () => void navigate({ to: '/', search: collapseSearch }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigate, JSON.stringify(collapseSearch)],
  )
  const openRef = useCallback(
    (next: string) => void navigate({ to: '/issue/$ref', params: { ref: next }, search }),
    [navigate, search],
  )
  const issueHref = (iid: number) =>
    horizonIssueHref(
      { viewParam, mode, query },
      issueRefParam({ projectId: issue?.projectId ?? 0, iid }, runtime.snapshot?.projects ?? []),
    )

  if (runtime.loading && !runtime.snapshot)
    return (
      <section className="flex min-w-0 flex-1 justify-center p-6" aria-busy="true">
        <span className="sr-only">Carregando o issue…</span>
        <Skeleton className="h-full w-full max-w-4xl rounded-2xl" />
      </section>
    )

  if (!runtime.snapshot || !issue)
    return (
      <section className="flex min-w-0 flex-1 items-start justify-center">
        <EmptyState>
          {runtime.error ?? `Nenhum issue do Escopo corresponde a ${ref}.`}
        </EmptyState>
      </section>
    )

  return (
    <section className="flex min-w-0 flex-1 justify-center overflow-hidden">
      <IssueDetailContainer
        snapshot={runtime.snapshot}
        provider={runtime.provider}
        issue={issue}
        variant="page"
        onClose={goToInbox}
        onSelectRef={openRef}
        issueHref={issueHref}
      />
    </section>
  )
}
