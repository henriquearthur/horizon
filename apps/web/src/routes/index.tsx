import { createFileRoute, Link, redirect, useNavigate } from '@tanstack/react-router'
import { ContentHeader } from '~/components/shell/content-header'
import { ContentToolbar } from '~/components/shell/content-toolbar'
import { EmptyState } from '~/components/shell/empty-state'
import { InboxContent } from '~/components/inbox/inbox-content'
import { Button } from '~/components/ui/button'
import { resolveShellSearch } from '~/lib/search'
import { activeViewHeading } from '~/lib/view-heading'
import { getSetupStatus } from '~/server/setup-functions'
import { useHorizonRuntime } from '~/runtime/runtime-provider'

export const Route = createFileRoute('/')({
  /**
   * Only a deployment that cannot work at all sends the user to `/setup`: a
   * GitLab that is momentarily unreachable is reported inside the Inbox, so the
   * shell never bounces between the two screens.
   */
  loader: async () => {
    const status = await getSetupStatus()
    if (!status.configured || status.scopeEmpty) throw redirect({ to: '/setup' })
    return status
  },
  // The Escopo changes from `/setup`, which invalidates the router itself.
  staleTime: 5 * 60_000,
  component: IssuesPage,
})

function IssuesPage() {
  const { view, mode, query } = resolveShellSearch(Route.useSearch())
  const heading = activeViewHeading(view)
  const runtime = useHorizonRuntime()
  const navigate = useNavigate({ from: '/' })

  if (runtime.loading)
    return (
      <section className="flex min-w-0 flex-1 flex-col">
        <ContentHeader title={heading.title} subtitle={heading.subtitle} mode={mode} />
        <ContentToolbar />
        <div className="flex-1 overflow-y-auto" aria-busy="true">
          <EmptyState>Carregando issues do Escopo…</EmptyState>
        </div>
      </section>
    )

  if (!runtime.snapshot)
    return (
      <section className="flex min-w-0 flex-1 flex-col">
        <ContentHeader title={heading.title} subtitle={heading.subtitle} mode={mode} />
        <ContentToolbar>
          <Button size="xs" variant="outline" onClick={() => void runtime.refresh({ force: true })}>
            Tentar novamente
          </Button>
        </ContentToolbar>
        <div className="flex-1 overflow-y-auto">
          <EmptyState>
            {runtime.error ?? 'Não foi possível abrir a Inbox.'}
            <Link to="/setup" className="ml-2 underline">
              Rever configuração
            </Link>
          </EmptyState>
        </div>
      </section>
    )

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <ContentHeader title={heading.title} subtitle={heading.subtitle} mode={mode} />
      {/* A failed refresh keeps the last good Inbox on screen. */}
      {runtime.error ? (
        <p
          role="alert"
          className="flex items-center gap-3 border-b border-destructive/40 bg-destructive/10 px-4 py-2 text-xs text-destructive"
        >
          {runtime.error}
          <Button size="xs" variant="outline" onClick={() => void runtime.refresh({ force: true })}>
            Tentar novamente
          </Button>
        </p>
      ) : null}
      <InboxContent
        snapshot={runtime.snapshot}
        view={view}
        mode={mode}
        query={query}
        provider={runtime.provider}
        refresh={() => runtime.refresh({ force: true })}
        refreshing={runtime.refreshing}
        onSavedViewSelected={(selection) =>
          navigate({
            search: (previous) => ({
              ...previous,
              view: selection.view,
              mode: selection.mode,
              q: selection.query,
            }),
            replace: true,
          })
        }
      />
    </section>
  )
}
