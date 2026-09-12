import { createServerFn } from '@tanstack/react-start'
import type { ScopeSelection } from '@horizon/domain'
import { setup } from './setup'

const scopeInput = (input: unknown): ScopeSelection => {
  if (!input || typeof input !== 'object') throw new Error('Seleção de Escopo inválida.')
  const value = input as Partial<ScopeSelection>
  const strings = (item: unknown): item is readonly string[] =>
    Array.isArray(item) && item.every((entry) => typeof entry === 'string')
  const numbers = (item: unknown): item is readonly number[] =>
    Array.isArray(item) && item.every((entry) => Number.isInteger(entry) && entry > 0)
  if (!strings(value.groups) || !numbers(value.projects) || !strings(value.followGroups))
    throw new Error('Seleção de Escopo inválida.')
  return { groups: value.groups, projects: value.projects, followGroups: value.followGroups }
}

/** Whether the deployment is configured and the Escopo is picked. */
export const getSetupStatus = createServerFn({ method: 'GET' }).handler(() => setup.status())

export const getSetupCatalog = createServerFn({ method: 'GET' })
  .validator((input): { force: boolean } => ({
    force: Boolean((input as { force?: unknown } | undefined)?.force),
  }))
  .handler(({ data }) => setup.catalog(data.force))

export const saveSetupScope = createServerFn({ method: 'POST' })
  .validator(scopeInput)
  .handler(({ data }) => setup.saveScope(data))
