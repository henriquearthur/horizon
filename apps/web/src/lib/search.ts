import {
  decodeViewMode,
  decodeViewRef,
  defaultViewMode,
  defaultViewRef,
  viewRefToParam,
  type ViewMode,
  type ViewRef,
} from '@horizon/domain'
import { isIssueRef } from '~/lib/issue-ref'

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
  readonly issue?: string | undefined
}

export const validateShellSearch = (search: Record<string, unknown>): ShellSearch => {
  const view = viewRefToParam(decodeViewRef(search.view))
  const mode = decodeViewMode(search.mode)
  const q = typeof search.q === 'string' ? search.q : ''
  const issue = typeof search.issue === 'string' && isIssueRef(search.issue) ? search.issue : ''
  return {
    ...(view === DEFAULT_VIEW_PARAM ? {} : { view }),
    ...(mode === defaultViewMode ? {} : { mode }),
    ...(q === '' ? {} : { q }),
    ...(issue === '' ? {} : { issue }),
  }
}

/** The shell state with defaults filled in and the View decoded once. */
export interface ResolvedShellSearch {
  /** Canonical `view` param, for links and active-row comparison. */
  readonly viewParam: string
  readonly view: ViewRef
  readonly mode: ViewMode
  readonly query: string
  readonly issueRef: string | undefined
}

export const resolveShellSearch = (search: ShellSearch): ResolvedShellSearch => {
  const viewParam = search.view ?? DEFAULT_VIEW_PARAM
  return {
    viewParam,
    view: decodeViewRef(viewParam),
    mode: search.mode ?? defaultViewMode,
    query: search.q ?? '',
    issueRef: search.issue,
  }
}

/** Opens an Issue inside Horizon without discarding the current reading context. */
export const horizonIssueHref = (
  current: Pick<ResolvedShellSearch, 'viewParam' | 'mode' | 'query'>,
  ref: string,
): string => {
  const params = new URLSearchParams()
  if (current.viewParam !== DEFAULT_VIEW_PARAM) params.set('view', current.viewParam)
  if (current.mode !== defaultViewMode) params.set('mode', current.mode)
  if (current.query) params.set('q', current.query)
  params.set('issue', ref)
  return `/?${params.toString()}`
}
