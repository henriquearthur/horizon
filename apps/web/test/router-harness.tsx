import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from '@tanstack/react-router'
import { render, type RenderResult } from '@testing-library/react'
import type { ReactNode } from 'react'
import { validateShellSearch } from '~/lib/search'

/**
 * Renders a shell component inside a memory router that validates search
 * params exactly like the real root route, so `Link`s behave as they do in
 * the app. No Provider (GitLab) is involved.
 */
export async function renderWithRouter(
  ui: ReactNode,
  { url = '/' }: { url?: string } = {},
): Promise<RenderResult> {
  const rootRoute = createRootRoute({ validateSearch: validateShellSearch })
  const indexRoute = createRoute({
    getParentRoute: () => rootRoute,
    path: '/',
    component: () => <>{ui}</>,
  })
  const router = createRouter({
    routeTree: rootRoute.addChildren([indexRoute]),
    history: createMemoryHistory({ initialEntries: [url] }),
  })

  await router.load()

  return render(<RouterProvider router={router} />)
}
