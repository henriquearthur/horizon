import {
  decodeViewMode,
  decodeViewRef,
  defaultViewMode,
  defaultViewRef,
  viewRefToParam,
  type ViewMode,
  type ViewRef,
} from '@horizon/domain'

/** Canonical `view` param of the View Horizon opens on. */
export const DEFAULT_VIEW_PARAM = viewRefToParam(defaultViewRef)

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
    ...(mode === defaultViewMode ? {} : { mode }),
    ...(q === '' ? {} : { q }),
  }
}

/** The shell state with defaults filled in and the View decoded once. */
export interface ResolvedShellSearch {
  /** Canonical `view` param, for links and active-row comparison. */
  readonly viewParam: string
  readonly view: ViewRef
  readonly mode: ViewMode
  readonly query: string
}

export const resolveShellSearch = (search: ShellSearch): ResolvedShellSearch => {
  const viewParam = search.view ?? DEFAULT_VIEW_PARAM
  return {
    viewParam,
    view: decodeViewRef(viewParam),
    mode: search.mode ?? defaultViewMode,
    query: search.q ?? '',
  }
}
