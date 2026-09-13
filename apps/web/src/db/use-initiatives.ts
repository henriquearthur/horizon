import type { Initiative } from '@horizon/domain'
import { useEffect, useState } from 'react'

/**
 * The Projeto catalog is Horizon-owned data, kept next to the saved Views.
 * Membership itself lives on the Issue, as a `horizon::initiative::<id>` label,
 * so a Projeto known only to another browser still shows up: ids found on the
 * Issues of the Escopo are merged into the catalog under their own name.
 */
export const INITIATIVES_STORAGE_KEY = 'horizon-initiatives'

const isInitiative = (value: unknown): value is Initiative =>
  Boolean(
    value &&
    typeof value === 'object' &&
    typeof (value as { id?: unknown }).id === 'string' &&
    typeof (value as { name?: unknown }).name === 'string',
  )

export const readInitiatives = (): readonly Initiative[] => {
  try {
    const raw = globalThis.localStorage?.getItem(INITIATIVES_STORAGE_KEY)
    const value: unknown = raw ? JSON.parse(raw) : null
    return Array.isArray(value) ? value.filter(isInitiative) : []
  } catch {
    return []
  }
}

export const persistInitiatives = (initiatives: readonly Initiative[]): void => {
  try {
    globalThis.localStorage?.setItem(INITIATIVES_STORAGE_KEY, JSON.stringify(initiatives))
    globalThis.dispatchEvent(new CustomEvent('horizon:initiatives'))
  } catch {
    // Storage may be unavailable; the in-memory UI remains usable.
  }
}

export const discoveredInitiative = (id: string): Initiative => ({
  id,
  name: id,
  description: '',
  state: 'active',
  createdAt: '',
  updatedAt: '',
})

/** The catalog, plus any Projeto the Escopo mentions but this browser never saw. */
export function useInitiatives(discoveredIds: readonly string[] = []): readonly Initiative[] {
  const [stored, setStored] = useState<readonly Initiative[]>(readInitiatives)
  useEffect(() => {
    const refresh = () => setStored(readInitiatives())
    globalThis.addEventListener('storage', refresh)
    globalThis.addEventListener('horizon:initiatives', refresh)
    return () => {
      globalThis.removeEventListener('storage', refresh)
      globalThis.removeEventListener('horizon:initiatives', refresh)
    }
  }, [])
  const known = new Set(stored.map((initiative) => initiative.id))
  return [
    ...stored,
    ...discoveredIds.filter((id) => !known.has(id)).map(discoveredInitiative),
  ].sort((left, right) => left.name.localeCompare(right.name))
}
