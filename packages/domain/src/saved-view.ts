import { Schema } from 'effect'
import type { ViewRef } from './view.ts'

/**
 * A View the user named and kept. Horizon owns this data; the Provider never
 * sees it. Filters, ordering and grouping are added in issue #8.
 */
export const SavedView = Schema.Struct({
  id: Schema.String,
  name: Schema.String,
})
export type SavedView = typeof SavedView.Type

/** Standard Schema view of {@link SavedView}, for storage layers such as TanStack DB. */
export const SavedViewStandardSchema = Schema.toStandardSchemaV1(SavedView)

export const savedViewRef = (id: string): ViewRef => ({ _tag: 'Saved', id })
