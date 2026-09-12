import { Schema } from 'effect'
import type { ViewRef } from './view.ts'
import { PRIORITY_VALUES, STATUS_VALUES } from './properties.ts'

const SavedViewMode = Schema.Literals(['list', 'kanban'])
const SavedViewSort = Schema.Literals(['updated', 'created', 'title'])
const SavedViewGroup = Schema.Literals([
  'project',
  'author',
  'assignee',
  'status',
  'priority',
  'label',
])
const SavedViewStatus = Schema.Literals(STATUS_VALUES)
const SavedViewPriority = Schema.Literals(PRIORITY_VALUES)

/**
 * A View the user named and kept. Horizon owns this data; the Provider never
 * sees it. Filters, ordering and grouping are added in issue #8.
 */
export const SavedView = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
  /** Scope this view belongs to. Absent means the default/global scope. */
  scope: Schema.optional(Schema.String),
  /** Saved presentation and query preferences. */
  mode: Schema.optional(SavedViewMode),
  query: Schema.optional(Schema.String),
  groupBy: Schema.optional(SavedViewGroup),
  sort: Schema.optional(SavedViewSort),
  projectIds: Schema.optional(Schema.Array(Schema.Number)),
  groupPaths: Schema.optional(Schema.Array(Schema.String)),
  author: Schema.optional(Schema.String),
  assignee: Schema.optional(Schema.String),
  labels: Schema.optional(Schema.Array(Schema.String)),
  status: Schema.optional(SavedViewStatus),
  priority: Schema.optional(SavedViewPriority),
})
export type SavedView = typeof SavedView.Type

/** Standard Schema view of {@link SavedView}, for storage layers such as TanStack DB. */
export const SavedViewStandardSchema = Schema.toStandardSchemaV1(SavedView)

export const savedViewRef = (id: string): ViewRef => ({ _tag: 'Saved', id })
