import { SavedViewStandardSchema } from '@horizon/domain'
import { createCollection, localOnlyCollectionOptions } from '@tanstack/react-db'

/** Horizon-owned saved Views. Issue records live in the runtime snapshot. */
export const savedViewCollection = createCollection(
  localOnlyCollectionOptions({
    id: 'saved-views',
    schema: SavedViewStandardSchema,
    getKey: (savedView) => savedView.id,
  }),
)
