import { createFileRoute, redirect } from '@tanstack/react-router'
import { ContentHeader } from '~/components/shell/content-header'
import { ContentToolbar } from '~/components/shell/content-toolbar'
import { EmptyState } from '~/components/shell/empty-state'
import { InboxContent } from '~/components/inbox/inbox-content'
import { Button } from '~/components/ui/button'
import { resolveShellSearch } from '~/lib/search'
import { activeViewHeading } from '~/lib/view-heading'
import { getConnection } from '~/server/onboarding-functions'
import { useHorizonRuntime } from '~/runtime/runtime-provider'

export const Route = createFileRoute('/')({
  beforeLoad: async () => {
    if (!(await getConnection())) throw redirect({ to: '/setup' })
  },
  component: IssuesPage,
})

function IssuesPage() {
  const { view, mode, query } = resolveShellSearch(Route.useSearch())
  const heading = activeViewHeading(view)
  const runtime = useHorizonRuntime()

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <ContentHeader title={heading.title} subtitle={heading.subtitle} mode={mode} />
      {runtime.loading ? (
        <>
          <ContentToolbar />
          <div className="flex-1 overflow-y-auto" aria-busy="true">
            <EmptyState>Carregando issues do Escopo…</EmptyState>
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
        />
      )}
    </section>
  )
}
