import { isIssueVisible, groupViewRef, projectViewRef, viewRefToParam } from '@horizon/domain'
import type { ProviderGroup, ProviderIssue, ProviderProject } from '@horizon/domain'
import type { SidebarGroupItem, SidebarItem } from '~/components/shell/app-sidebar'

export interface ScopeTree {
  readonly groups: readonly SidebarGroupItem[]
  readonly standaloneProjects: readonly SidebarItem[]
}

/** The group a path belongs under: the longest group path that is a prefix of it. */
const parentOf = (path: string, paths: readonly string[]): string | undefined =>
  paths
    .filter((candidate) => candidate !== path && path.startsWith(`${candidate}/`))
    .sort((left, right) => right.length - left.length)[0]

/**
 * Turns the flat Escopo into the tree the sidebar shows: groups nest under
 * their parent group and projects hang off the group that owns them. Counts
 * are cumulative, so a parent reports everything beneath it.
 */
export const buildScopeTree = (
  groups: readonly ProviderGroup[],
  projects: readonly ProviderProject[],
  issues: readonly ProviderIssue[],
): ScopeTree => {
  const paths = groups.map((group) => group.fullPath)
  const issuesByProject = new Map<number, number>()
  for (const issue of issues.filter((item) => isIssueVisible(item)))
    issuesByProject.set(issue.projectId, (issuesByProject.get(issue.projectId) ?? 0) + 1)

  /** The deepest group in the Escopo that contains the project. */
  const ownerOf = (groupPath: string | undefined): string | undefined =>
    groupPath === undefined
      ? undefined
      : paths
          .filter((path) => path === groupPath || groupPath.startsWith(`${path}/`))
          .sort((left, right) => right.length - left.length)[0]

  const projectsByGroup = new Map<string, SidebarItem[]>()
  const projectCountByGroup = new Map<string, number>()
  for (const project of projects) {
    const owner = ownerOf(project.groupPath ?? project.namespace)
    const target = owner ?? `__standalone__`
    const count = issuesByProject.get(project.id) ?? 0
    projectsByGroup.set(target, [
      ...(projectsByGroup.get(target) ?? []),
      {
        viewParam: viewRefToParam(projectViewRef(`${project.namespace}/${project.path}`)),
        label: project.path,
        count: String(count),
      },
    ])
    projectCountByGroup.set(target, (projectCountByGroup.get(target) ?? 0) + count)
  }

  const childrenOf = (path: string | undefined): readonly SidebarGroupItem[] =>
    groups
      .filter((group) => parentOf(group.fullPath, paths) === path)
      .sort((left, right) => left.fullPath.localeCompare(right.fullPath))
      .map((group) => {
        const children = childrenOf(group.fullPath)
        const own = projectCountByGroup.get(group.fullPath) ?? 0
        const total = children.reduce((sum, child) => sum + Number(child.count ?? '0'), own)
        return {
          path: group.fullPath,
          label: group.fullPath.split('/').at(-1) ?? group.fullPath,
          viewParam: viewRefToParam(groupViewRef(group.fullPath)),
          count: String(total),
          groups: children,
          projects: (projectsByGroup.get(group.fullPath) ?? []).sort((left, right) =>
            left.label.localeCompare(right.label),
          ),
        }
      })

  return {
    groups: childrenOf(undefined),
    standaloneProjects: (projectsByGroup.get('__standalone__') ?? []).sort((left, right) =>
      left.label.localeCompare(right.label),
    ),
  }
}
