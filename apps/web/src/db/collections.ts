import { SavedViewStandardSchema, type ProviderIssue } from '@horizon/domain'
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

/** Fast local cache of the last Provider-confirmed Issue records. */
export const issueCollection = createCollection(
  localOnlyCollectionOptions<ProviderIssue, number>({
    id: 'issues',
    getKey: (issue) => issue.id,
  }),
)
