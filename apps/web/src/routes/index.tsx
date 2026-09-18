import { useCallback, useMemo } from 'react'
import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { ContentHeader } from '~/components/shell/content-header'
import { ContentToolbar } from '~/components/shell/content-toolbar'
import { EmptyState } from '~/components/shell/empty-state'
import { InboxContent } from '~/components/inbox/inbox-content'
import { Button } from '~/components/ui/button'
import { Skeleton } from '~/components/ui/skeleton'
import { resolveShellSearch } from '~/lib/search'
import { initiativeIdsFromLabels } from '@horizon/domain'
import { useInitiatives } from '~/db/use-initiatives'
import { activeViewHeading } from '~/lib/view-heading'
import { getSetupStatus } from '~/server/setup-functions'
import { useHorizonRuntime } from '~/runtime/runtime-provider'

export const Route = createFileRoute('/')({
  beforeLoad: async ({ cause }) => {
    if (cause === 'stay') return
    // An empty Escopo is not a reason to leave the app: the Escopo modal opens
    // over the Inbox instead of a separate first-run page.
    const status = await getSetupStatus()
    if (!status.reachable) throw redirect({ to: '/setup' })
  },
  component: IssuesPage,
})

function IssuesPage() {
  const search = Route.useSearch()
  const { mode, query, issueRef } = resolveShellSearch(search)
  const view = useMemo(() => resolveShellSearch({ view: search.view }).view, [search.view])
  const runtime = useHorizonRuntime()
  const initiatives = useInitiatives(
    (runtime.snapshot?.issues ?? []).flatMap((issue) => initiativeIdsFromLabels(issue.labels)),
  )
  const heading = activeViewHeading(
    view,
    view._tag === 'Initiative'
      ? initiatives.find((initiative) => initiative.id === view.id)?.name
      : undefined,
  )
  const navigate = useNavigate({ from: '/' })

  const selectIssue = useCallback(
    (next: string | undefined) => {
      void navigate({ search: (previous) => ({ ...previous, issue: next }), replace: true })
    },
    [navigate],
  )

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <ContentHeader title={heading.title} subtitle={heading.subtitle} mode={mode} />
      {runtime.loading ? (
        <>
          <ContentToolbar />
          <div className="flex-1 overflow-y-auto px-2 pt-2" aria-busy="true">
            <span className="sr-only">Carregando issues do Escopo…</span>
            {Array.from({ length: 7 }, (_, row) => (
              <div key={row} className="flex items-start gap-3 rounded-xl px-3.5 py-2.5">
                <Skeleton className="mt-1.5 size-[7px] rounded-full" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Skeleton
                    className="h-3.5 rounded-full"
                    style={{ width: `${52 + ((row * 13) % 34)}%` }}
                  />
                  <Skeleton className="h-2.5 w-40 rounded-full" />
                </div>
                <Skeleton className="size-[21px] rounded-full" />
              </div>
            ))}
          </div>
        </>
      ) : !runtime.snapshot ? (
        <>
          <ContentToolbar>
            <Button size="xs" variant="outline" onClick={() => void runtime.refresh()}>
              Tentar novamente
            </Button>
          </ContentToolbar>
          <div className="flex-1 overflow-y-auto">
            <EmptyState>{runtime.error ?? 'Não foi possível abrir a Inbox.'}</EmptyState>
          </div>
        </>
      ) : (
        <>
          {runtime.error ? (
            <p role="alert" className="px-5 py-2 text-xs text-destructive">
              {runtime.error}
            </p>
          ) : null}
          <InboxContent
            snapshot={runtime.snapshot}
            view={view}
            mode={mode}
            query={query}
            issueRef={issueRef}
            provider={runtime.provider}
            refresh={runtime.refresh}
            refreshing={runtime.refreshing}
            onSavedViewSelected={(selection) =>
              navigate({
                search: (previous) => ({
                  ...previous,
                  view: selection.view,
                  mode: selection.mode,
                  q: selection.query,
                }),
              })
            }
            onIssueSelected={selectIssue}
          />
        </>
      )}
    </section>
  )
}
