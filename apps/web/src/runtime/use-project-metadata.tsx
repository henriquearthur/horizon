import { useEffect, useState } from 'react'
import type { ProviderUser } from '@horizon/domain'
import { getProjectMetadata } from '~/server/runtime-functions'

export interface ProjectMetadataValue {
  readonly users: readonly ProviderUser[]
  readonly labels: readonly string[]
  readonly loading: boolean
}

const EMPTY: ProjectMetadataValue = { users: [], labels: [], loading: false }
const cache = new Map<number, { users: readonly ProviderUser[]; labels: readonly string[] }>()

/**
 * Members and labels of one project. The Inbox snapshot no longer carries them
 * — reading them for every repository of a large Escopo cost two GitLab calls
 * per repository — so the forms ask for the one project they are about.
 */
export function useProjectMetadata(projectId: number | undefined): ProjectMetadataValue {
  const [value, setValue] = useState<ProjectMetadataValue>(
    projectId !== undefined && cache.has(projectId)
      ? { ...cache.get(projectId)!, loading: false }
      : EMPTY,
  )

  useEffect(() => {
    if (projectId === undefined) return
    const cached = cache.get(projectId)
    if (cached) {
      setValue({ ...cached, loading: false })
      return
    }
    let active = true
    setValue({ ...EMPTY, loading: true })
    void getProjectMetadata({ data: { projectId } })
      .then((metadata) => {
        const next = {
          users: metadata.users,
          labels: metadata.labels.map((label) => label.name),
        }
        cache.set(projectId, next)
        if (active) setValue({ ...next, loading: false })
      })
      .catch(() => {
        // The form still works with what the snapshot already knows.
        if (active) setValue(EMPTY)
      })
    return () => {
      active = false
    }
  }, [projectId])

  return value
}
