import type { SavedView } from '@horizon/domain'
import { useLiveQuery } from '@tanstack/react-db'
import { savedViewCollection } from '~/db/collections'

/** Live list of the user's saved Views, ordered by name. */
export function useSavedViews(): readonly SavedView[] {
  const { data } = useLiveQuery((query) =>
    query.from({ savedView: savedViewCollection }).orderBy(({ savedView }) => savedView.name),
  )
  return data
}
