import type { ProviderGroup, ProviderProject } from './provider.ts'

export type ScopeSelection = {
  readonly groups: readonly string[]
  readonly projects: readonly number[]
  /** @deprecated Kept in persisted data for compatibility; always mirrors `groups`. */
  readonly followGroups: readonly string[]
}

export const emptyScopeSelection = (): ScopeSelection => ({
  groups: [],
  projects: [],
  followGroups: [],
})

export const normalizeScopeSelection = (selection: Partial<ScopeSelection>): ScopeSelection => {
  const groups = [
    ...new Set(
      (selection.groups ?? []).filter(
        (value): value is string => typeof value === 'string' && value.length > 0,
      ),
    ),
  ]
  return {
    groups,
    projects: [
      ...new Set(
        (selection.projects ?? []).filter(
          (value): value is number => Number.isInteger(value) && value > 0,
        ),
      ),
    ],
    followGroups: groups,
  }
}

export const projectBelongsToGroup = (
  project: Pick<ProviderProject, 'groupPath' | 'namespace'>,
  groupPath: string,
): boolean => {
  const path = project.groupPath ?? project.namespace
  return path === groupPath || path.startsWith(`${groupPath}/`)
}

export const isProjectSelected = (project: ProviderProject, selection: ScopeSelection): boolean =>
  selection.projects.includes(project.id) ||
  selection.groups.some((group) => projectBelongsToGroup(project, group))

export const selectedGroups = (
  groups: readonly ProviderGroup[],
  selection: ScopeSelection,
): readonly ProviderGroup[] =>
  groups.filter((group) =>
    selection.groups.some(
      (selected) => group.fullPath === selected || group.fullPath.startsWith(`${selected}/`),
    ),
  )

export const selectedProjects = (
  projects: readonly ProviderProject[],
  selection: ScopeSelection,
): readonly ProviderProject[] => projects.filter((project) => isProjectSelected(project, selection))
