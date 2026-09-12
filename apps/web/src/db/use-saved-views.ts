import type { SavedView } from '@horizon/domain'
import { useEffect, useState } from 'react'

export const SAVED_VIEWS_STORAGE_KEY = 'horizon-saved-views'

const readSavedViews = (): readonly SavedView[] => {
  try {
    const raw = globalThis.localStorage?.getItem(SAVED_VIEWS_STORAGE_KEY)
    if (!raw) return []
    const value: unknown = JSON.parse(raw)
    return Array.isArray(value)
      ? value.filter((item): item is SavedView =>
          Boolean(
            item &&
            typeof item === 'object' &&
            typeof (item as { id?: unknown }).id === 'string' &&
            typeof (item as { name?: unknown }).name === 'string',
          ),
        )
      : []
  } catch {
    return []
  }
}

export const persistSavedViews = (views: readonly SavedView[]): void => {
  try {
    globalThis.localStorage?.setItem(SAVED_VIEWS_STORAGE_KEY, JSON.stringify(views))
    globalThis.dispatchEvent(new CustomEvent('horizon:saved-views'))
  } catch {
    // Storage may be unavailable; the in-memory UI remains usable.
  }
}

/** Live list of the user's saved Views, ordered by name. */
export function useSavedViews(scope?: string): readonly SavedView[] {
  const [views, setViews] = useState<readonly SavedView[]>(readSavedViews)
  useEffect(() => {
    const refresh = () => setViews(readSavedViews())
    globalThis.addEventListener('storage', refresh)
    globalThis.addEventListener('horizon:saved-views', refresh)
    return () => {
      globalThis.removeEventListener('storage', refresh)
      globalThis.removeEventListener('horizon:saved-views', refresh)
    }
  }, [])
  return [...views]
    .filter((view) => scope === undefined || view.scope === undefined || view.scope === scope)
    .sort((a, b) => a.name.localeCompare(b.name))
}
