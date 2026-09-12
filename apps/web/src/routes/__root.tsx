import { builtinViews } from '@horizon/domain'
import { createRootRoute, HeadContent, Outlet, Scripts, useNavigate } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { AppHeader } from '~/components/shell/app-header'
import { AppSidebar, type SidebarGroupItem, type SidebarItem } from '~/components/shell/app-sidebar'
import { EmptyState } from '~/components/shell/empty-state'
import { useSavedViews } from '~/db/use-saved-views'
import { ThemeProvider, themeBootstrapScript } from '~/lib/theme'
import { resolveShellSearch, validateShellSearch } from '~/lib/search'
import appCss from '~/styles/app.css?url'

export const Route = createRootRoute({
  validateSearch: validateShellSearch,
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Horizon' },
    ],
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      {
        rel: 'stylesheet',
        href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;450;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap',
      },
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
    ],
  }),
  component: RootComponent,
  notFoundComponent: () => (
    <section className="flex min-w-0 flex-1 items-start justify-center">
      <EmptyState>Esta página não existe.</EmptyState>
    </section>
  ),
})

function RootComponent() {
  return (
    <RootDocument>
      <ThemeProvider>
        <AppShell>
          <Outlet />
        </AppShell>
      </ThemeProvider>
    </RootDocument>
  )
}

const builtinSidebarItems: readonly SidebarItem[] = builtinViews.map((view) => ({
  viewParam: view.id,
  label: view.title,
  icon: view.icon,
}))

/**
 * Groups and projects come from the Escopo of the configured Conexão
 * (issue #3); until then the sidebar shows its empty state.
 */
const escopoGroups: readonly SidebarGroupItem[] = []

function AppShell({ children }: { children: ReactNode }) {
  const { view, q } = resolveShellSearch(Route.useSearch())
  const navigate = useNavigate({ from: Route.fullPath })
  const savedViews = useSavedViews()

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <AppHeader
        connectionLabel={null}
        userName={null}
        query={q}
        onQueryChange={(next) =>
          navigate({
            search: (previous) => ({
              ...previous,
              ...(next === '' ? { q: undefined } : { q: next }),
            }),
            replace: true,
          })
        }
      />
      <div className="relative flex min-h-0 flex-1">
        <AppSidebar
          activeView={view}
          views={builtinSidebarItems}
          savedViews={savedViews.map((savedView) => ({
            viewParam: `saved:${savedView.id}`,
            label: savedView.name,
            icon: '◆',
          }))}
          groups={escopoGroups}
        />
        {children}
      </div>
    </div>
  )
}

function RootDocument({ children }: Readonly<{ children: ReactNode }>) {
  return (
    <html lang="pt-BR" data-theme="dark" suppressHydrationWarning>
      <head>
        <HeadContent />
        <script dangerouslySetInnerHTML={{ __html: themeBootstrapScript }} />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  )
}
