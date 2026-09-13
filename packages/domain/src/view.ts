import { Option, Schema } from 'effect'

/**
 * A View is a named way of looking at the Issues inside the current Escopo.
 * Horizon ships one builtin View; the user may save more (see issue #8).
 */
export const BuiltinViewId = Schema.Literals(['general'])
export type BuiltinViewId = typeof BuiltinViewId.Type

export interface BuiltinView {
  readonly id: BuiltinViewId
  /** Sidebar glyph, matching the prototype. */
  readonly icon: string
  readonly title: string
  readonly subtitle: string
}

export const builtinViews: readonly BuiltinView[] = [
  { id: 'general', icon: '◍', title: 'Geral', subtitle: 'issues de todo o Escopo' },
]

/** The list and kanban presentations of a View. */
export const ViewMode = Schema.Literals(['list', 'kanban'])
export type ViewMode = typeof ViewMode.Type

/** The presentation a View opens in. */
export const defaultViewMode: ViewMode = 'list'

/** Which View the content area is showing. */
export type ViewRef =
  | { readonly _tag: 'Builtin'; readonly id: BuiltinViewId }
  | { readonly _tag: 'Group'; readonly path: string }
  | { readonly _tag: 'Project'; readonly path: string }
  | { readonly _tag: 'Saved'; readonly id: string }
  | { readonly _tag: 'Initiative'; readonly id: string }

const GROUP_PREFIX = 'group:'
const PROJECT_PREFIX = 'project:'
const SAVED_PREFIX = 'saved:'
const INITIATIVE_PREFIX = 'initiative:'

/** The View Horizon opens on. */
export const defaultViewRef: ViewRef = { _tag: 'Builtin', id: 'general' }

const decodeBuiltinViewId = Schema.decodeUnknownOption(BuiltinViewId)
const decodeViewModeOption = Schema.decodeUnknownOption(ViewMode)

/** Decodes a URL search param into a mode, falling back to the prototype default. */
export const decodeViewMode = (input: unknown): ViewMode =>
  Option.getOrElse(decodeViewModeOption(input), () => defaultViewMode)

export const projectViewRef = (path: string): ViewRef => ({ _tag: 'Project', path })

/** The View that shows every Issue under a group and its subgroups. */
export const groupViewRef = (path: string): ViewRef => ({ _tag: 'Group', path })

/** The View that shows every Issue of one Projeto, across repositories. */
export const initiativeViewRef = (id: string): ViewRef => ({ _tag: 'Initiative', id })

/** Decodes a URL search param into a View reference, falling back to the Inbox. */
export const decodeViewRef = (input: unknown): ViewRef => {
  if (typeof input !== 'string') return defaultViewRef
  if (input.startsWith(GROUP_PREFIX)) {
    const path = input.slice(GROUP_PREFIX.length)
    return path.length > 0 ? groupViewRef(path) : defaultViewRef
  }
  if (input.startsWith(PROJECT_PREFIX)) {
    const path = input.slice(PROJECT_PREFIX.length)
    return path.length > 0 ? projectViewRef(path) : defaultViewRef
  }
  if (input.startsWith(INITIATIVE_PREFIX)) {
    const id = input.slice(INITIATIVE_PREFIX.length)
    return id.length > 0 ? initiativeViewRef(id) : defaultViewRef
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
    case 'Group':
      return GROUP_PREFIX + ref.path
    case 'Project':
      return PROJECT_PREFIX + ref.path
    case 'Saved':
      return SAVED_PREFIX + ref.id
    case 'Initiative':
      return INITIATIVE_PREFIX + ref.id
  }
}

export const builtinView = (id: BuiltinViewId): BuiltinView =>
  builtinViews.find((view) => view.id === id) ?? builtinViews[0]!
