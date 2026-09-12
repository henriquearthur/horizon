import { Option, Schema } from 'effect'

/**
 * A View is a named way of looking at the Issues inside the current Escopo.
 * Horizon ships four builtin Views; the user may save more (see issue #8).
 */
export const BuiltinViewId = Schema.Literals(['inbox', 'all', 'by-project', 'assigned-to-me'])
export type BuiltinViewId = typeof BuiltinViewId.Type

export interface BuiltinView {
  readonly id: BuiltinViewId
  /** Sidebar glyph, matching the prototype. */
  readonly icon: string
  readonly title: string
  readonly subtitle: string
}

export const builtinViews: readonly BuiltinView[] = [
  { id: 'inbox', icon: '◍', title: 'Inbox', subtitle: 'precisa da sua atenção' },
  { id: 'all', icon: '≡', title: 'Todos os issues', subtitle: 'todos os grupos e subgrupos' },
  {
    id: 'by-project',
    icon: '⊞',
    title: 'Por projeto',
    subtitle: 'agrupado por caminho do repositório',
  },
  { id: 'assigned-to-me', icon: '◐', title: 'Atribuídos a mim', subtitle: 'suas issues' },
]

/** The list and kanban presentations of a View. */
export const ViewMode = Schema.Literals(['list', 'kanban'])
export type ViewMode = typeof ViewMode.Type

/** The presentation a View opens in. */
export const defaultViewMode: ViewMode = 'list'

/** Which View the content area is showing. */
export type ViewRef =
  | { readonly _tag: 'Builtin'; readonly id: BuiltinViewId }
  | { readonly _tag: 'Project'; readonly path: string }
  | { readonly _tag: 'Saved'; readonly id: string }

const PROJECT_PREFIX = 'project:'
const SAVED_PREFIX = 'saved:'

/** The View Horizon opens on. */
export const defaultViewRef: ViewRef = { _tag: 'Builtin', id: 'inbox' }

const decodeBuiltinViewId = Schema.decodeUnknownOption(BuiltinViewId)
const decodeViewModeOption = Schema.decodeUnknownOption(ViewMode)

/** Decodes a URL search param into a mode, falling back to the prototype default. */
export const decodeViewMode = (input: unknown): ViewMode =>
  Option.getOrElse(decodeViewModeOption(input), () => defaultViewMode)

export const projectViewRef = (path: string): ViewRef => ({ _tag: 'Project', path })

/** Decodes a URL search param into a View reference, falling back to the Inbox. */
export const decodeViewRef = (input: unknown): ViewRef => {
  if (typeof input !== 'string') return defaultViewRef
  if (input.startsWith(PROJECT_PREFIX)) {
    const path = input.slice(PROJECT_PREFIX.length)
    return path.length > 0 ? projectViewRef(path) : defaultViewRef
  }
  if (input.startsWith(SAVED_PREFIX)) {
    const id = input.slice(SAVED_PREFIX.length)
    return id.length > 0 ? { _tag: 'Saved', id } : defaultViewRef
  }
  return Option.match(decodeBuiltinViewId(input), {
    onNone: () => defaultViewRef,
    onSome: (id): ViewRef => ({ _tag: 'Builtin', id }),
  })
}

/** Encodes a View reference back into its URL search param form. */
export const viewRefToParam = (ref: ViewRef): string => {
  switch (ref._tag) {
    case 'Builtin':
      return ref.id
    case 'Project':
      return PROJECT_PREFIX + ref.path
    case 'Saved':
      return SAVED_PREFIX + ref.id
  }
}

export const builtinView = (id: BuiltinViewId): BuiltinView =>
  builtinViews.find((view) => view.id === id) ?? builtinViews[0]!
