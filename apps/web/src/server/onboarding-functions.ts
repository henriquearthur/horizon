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
  return { url: value.url, token: value.token }
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
  return { groups: value.groups, projects: value.projects, followGroups: value.followGroups }
}

/** RPC functions serialize only public records; credentials stay in the server store. */
export const getConnection = createServerFn({ method: 'GET' }).handler(() =>
  onboarding.connection(),
)
export const connectGitLab = createServerFn({ method: 'POST' })
  .validator(connectionInput)
  .handler(({ data }) => onboarding.connect(data.url, data.token))
export const getOnboardingCatalog = createServerFn({ method: 'GET' }).handler(() =>
  onboarding.catalog(),
)
export const saveOnboardingScope = createServerFn({ method: 'POST' })
  .validator(scopeInput)
  .handler(({ data }) => onboarding.saveScope(data))
