import { createFileRoute, redirect, useNavigate } from '@tanstack/react-router'
import { ContentHeader } from '~/components/shell/content-header'
import { ContentToolbar } from '~/components/shell/content-toolbar'
import { EmptyState } from '~/components/shell/empty-state'
import { InboxContent } from '~/components/inbox/inbox-content'
import { Button } from '~/components/ui/button'
import { Skeleton } from '~/components/ui/skeleton'
import { resolveShellSearch } from '~/lib/search'
import { activeViewHeading } from '~/lib/view-heading'
import { getSetupStatus } from '~/server/setup-functions'
import { useHorizonRuntime } from '~/runtime/runtime-provider'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    const status = await getSetupStatus()
    if (!status.reachable || status.scopeEmpty) throw redirect({ to: '/setup' })
  },
  component: IssuesPage,
})

function IssuesPage() {
  const { view, mode, query } = resolveShellSearch(Route.useSearch())
  const heading = activeViewHeading(view)
  const runtime = useHorizonRuntime()
  const navigate = useNavigate({ from: '/' })

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
      ) : runtime.error || !runtime.snapshot ? (
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
        <InboxContent
          snapshot={runtime.snapshot}
          view={view}
          mode={mode}
          query={query}
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
        />
      )}
    </section>
  )
}
