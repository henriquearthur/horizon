import { createServerFn } from '@tanstack/react-start'
import { onboarding } from './onboarding'
import type { ScopeSelection } from './connection-store'

const connectionInput = (input: unknown): { url: string; token: string } => {
  if (!input || typeof input !== 'object') throw new Error('Informe a URL e o token do GitLab.')
  const value = input as { url?: unknown; token?: unknown }
  if (typeof value.url !== 'string' || !value.url.trim())
    throw new Error('Informe a URL do GitLab.')
  if (typeof value.token !== 'string' || !value.token.trim())
    throw new Error('Informe o token do GitLab.')
  return {
    url: value.url,
    token: value.token,
  }
}

const scopeInput = (input: unknown): ScopeSelection => {
  if (!input || typeof input !== 'object') throw new Error('Seleção de Escopo inválida.')
  const value = input as Partial<ScopeSelection>
  const validStrings = (item: unknown): item is readonly string[] =>
    Array.isArray(item) && item.every((entry) => typeof entry === 'string')
  const validNumbers = (item: unknown): item is readonly number[] =>
    Array.isArray(item) && item.every((entry) => Number.isInteger(entry) && entry > 0)
  if (
    !validStrings(value.groups) ||
    !validNumbers(value.projects) ||
    !validStrings(value.followGroups)
  )
    throw new Error('Seleção de Escopo inválida.')
  return {
    groups: value.groups,
    projects: value.projects,
    followGroups: value.followGroups,
  }
}

export const SESSION_COOKIE = 'horizon-session'

/** RPC functions serialize only public records; credentials stay in the server store. */
export const getConnection = createServerFn({ method: 'GET' }).handler(async () => {
  const { getCookie } = await import('@tanstack/react-start/server')
  return onboarding.connection(getCookie(SESSION_COOKIE)).catch(() => undefined)
})
export const connectGitLab = createServerFn({ method: 'POST' })
  .validator(connectionInput)
  .handler(async ({ data }) => {
    const { getRequest, setCookie } = await import('@tanstack/react-start/server')
    const connected = await onboarding.connect(data.url, data.token)
    setCookie(SESSION_COOKIE, connected.session, {
      httpOnly: true,
      sameSite: 'lax',
      secure: new URL(getRequest().url).protocol === 'https:',
      path: '/',
      maxAge: 60 * 60 * 24 * 30,
    })
    return { url: connected.url, user: connected.user }
  })
export const getOnboardingCatalog = createServerFn({ method: 'GET' }).handler(async () => {
  const { getCookie } = await import('@tanstack/react-start/server')
  return onboarding.catalog(getCookie(SESSION_COOKIE))
})
export const saveOnboardingScope = createServerFn({ method: 'POST' })
  .validator(scopeInput)
  .handler(async ({ data }) => {
    const { getCookie } = await import('@tanstack/react-start/server')
    return onboarding.saveScope(data, getCookie(SESSION_COOKIE))
  })

/** Shared server-side guard for Provider readers and future mutations. */
export const requireSession = async (): Promise<void> => {
  const { getCookie } = await import('@tanstack/react-start/server')
  return onboarding.requireSession(getCookie(SESSION_COOKIE))
}
