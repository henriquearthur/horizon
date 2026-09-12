import { createFileRoute } from '@tanstack/react-router'
import { ContentHeader } from '~/components/shell/content-header'
import { ContentToolbar } from '~/components/shell/content-toolbar'
import { EmptyState } from '~/components/shell/empty-state'
import { resolveShellSearch } from '~/lib/search'
import { activeViewHeading } from '~/lib/view-heading'

export const Route = createFileRoute('/')({
  component: IssuesPage,
})

function IssuesPage() {
  const { view, mode } = resolveShellSearch(Route.useSearch())
  const heading = activeViewHeading(view)

  return (
    <section className="flex min-w-0 flex-1 flex-col">
      <ContentHeader title={heading.title} subtitle={heading.subtitle} mode={mode} />
      <ContentToolbar />
      <div className="flex-1 overflow-y-auto">
        {/* Issues arrive with the Provider adapter (issues #4 and #5). */}
        <EmptyState>Conecte um GitLab e selecione um Escopo para ver issues.</EmptyState>
      </div>
    </section>
  )
}
