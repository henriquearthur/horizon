import { builtinViews, savedViewRef, viewRefToParam } from '@horizon/domain'
import {
  createRootRoute,
  HeadContent,
  Outlet,
  Scripts,
  useNavigate,
  useRouterState,
} from '@tanstack/react-router'
import type { ReactNode } from 'react'
import { AppHeader } from '~/components/shell/app-header'
import { AppSidebar, type SidebarItem } from '~/components/shell/app-sidebar'
import { EmptyState } from '~/components/shell/empty-state'
import { useSavedViews } from '~/db/use-saved-views'
import { ThemeProvider, themeBootstrapScript } from '~/lib/theme'
import { buildScopeTree } from '~/lib/scope-tree'
import { HorizonRuntimeProvider, useHorizonRuntime } from '~/runtime/runtime-provider'
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
        href: 'https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Geist+Mono:wght@400;500;600&display=swap',
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
        <HorizonRuntimeProvider>
          <RoutedApplication />
        </HorizonRuntimeProvider>
      </ThemeProvider>
    </RootDocument>
  )
}

function RoutedApplication() {
  const setup = useRouterState({ select: (state) => state.location.pathname === '/setup' })
  return setup ? (
    <Outlet />
  ) : (
    <AppShell>
      <Outlet />
    </AppShell>
  )
}

const builtinSidebarItems: readonly SidebarItem[] = builtinViews.map((view) => ({
  viewParam: view.id,
  label: view.title,
  icon: view.icon,
}))

function AppShell({ children }: { children: ReactNode }) {
  const { viewParam, query } = resolveShellSearch(Route.useSearch())
  const navigate = useNavigate({ from: Route.fullPath })
  const runtime = useHorizonRuntime()
  const scopeKey = runtime.snapshot ? JSON.stringify(runtime.snapshot.scope) : undefined
  const savedViews = useSavedViews(scopeKey)
  const scopeTree = buildScopeTree(
    runtime.snapshot?.groups ?? [],
    runtime.snapshot?.projects ?? [],
    runtime.snapshot?.issues ?? [],
  )

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <AppHeader
        connectionLabel={runtime.snapshot ? new URL(runtime.snapshot.connection.url).host : null}
        userName={runtime.snapshot?.connection.user.name ?? null}
        userAvatarUrl={runtime.snapshot?.connection.user.avatarUrl}
        query={query}
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
          activeView={viewParam}
          views={builtinSidebarItems.map((item) => ({
            ...item,
            ...(runtime.snapshot
              ? {
                  count: String(
                    item.viewParam === 'by-project'
                      ? runtime.snapshot.projects.length
                      : runtime.snapshot.issues.filter((issue) =>
                          item.viewParam === 'inbox'
                            ? issue.state === 'opened'
                            : item.viewParam === 'assigned-to-me'
                              ? issue.assignees.some(
                                  (user) =>
                                    user.username === runtime.snapshot?.connection.user.username,
                                )
                              : true,
                        ).length,
                  ),
                }
              : {}),
          }))}
          savedViews={savedViews.map((savedView) => ({
            viewParam: viewRefToParam(savedViewRef(savedView.id)),
            label: savedView.name,
            icon: '◆',
          }))}
          groups={scopeTree.groups}
          standaloneProjects={scopeTree.standaloneProjects}
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
