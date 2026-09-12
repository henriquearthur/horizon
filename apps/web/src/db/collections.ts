import { SavedViewStandardSchema } from '@horizon/domain'
import { createCollection, localOnlyCollectionOptions } from '@tanstack/react-db'

/**
 * Horizon's local store. The Provider stays the canonical source for Issues;
 * TanStack DB holds Horizon-owned data (Views, preferences) and, from issue #5
 * on, the Issue cache.
 *
 * Saved Views are in-memory for now. Issue #8 persists them per Escopo.
 */
export const savedViewCollection = createCollection(
  localOnlyCollectionOptions({
    id: 'saved-views',
    schema: SavedViewStandardSchema,
    getKey: (savedView) => savedView.id,
  }),
)
