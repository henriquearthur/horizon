import { decodeViewMode, decodeViewRef, viewRefToParam, type ViewMode } from '@horizon/domain'

export const DEFAULT_VIEW_PARAM = 'inbox'
const DEFAULT_MODE: ViewMode = 'list'

/**
 * Shell state that lives in the URL, so a View is shareable and reloadable.
 * Defaults are omitted to keep the address bar readable.
 */
export interface ShellSearch {
  readonly view?: string | undefined
  readonly mode?: ViewMode | undefined
  readonly q?: string | undefined
}

export const validateShellSearch = (search: Record<string, unknown>): ShellSearch => {
  const view = viewRefToParam(decodeViewRef(search.view))
  const mode = decodeViewMode(search.mode)
  const q = typeof search.q === 'string' ? search.q : ''
  return {
    ...(view === DEFAULT_VIEW_PARAM ? {} : { view }),
    ...(mode === DEFAULT_MODE ? {} : { mode }),
    ...(q === '' ? {} : { q }),
  }
}

export interface ResolvedShellSearch {
  readonly view: string
  readonly mode: ViewMode
  readonly q: string
}

export const resolveShellSearch = (search: ShellSearch): ResolvedShellSearch => ({
  view: search.view ?? DEFAULT_VIEW_PARAM,
  mode: search.mode ?? DEFAULT_MODE,
  q: search.q ?? '',
})
