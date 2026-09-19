import { isIssueVisible, groupViewRef, projectViewRef, viewRefToParam } from '@horizon/domain'
import type { ProviderGroup, ProviderIssue, ProviderProject } from '@horizon/domain'
import type { SidebarGroupItem, SidebarItem } from '~/components/shell/app-sidebar'

export interface ScopeTree {
  readonly groups: readonly SidebarGroupItem[]
  readonly standaloneProjects: readonly SidebarItem[]
}

/** Find an ancestor by walking path segments instead of scanning every group. */
const ownerOf = (path: string | undefined, paths: ReadonlySet<string>): string | undefined => {
  while (path) {
    if (paths.has(path)) return path
    const slash = path.lastIndexOf('/')
    if (slash < 0) break
    path = path.slice(0, slash)
  }
  return undefined
}

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
  const paths = new Set(groups.map((group) => group.fullPath))
  const groupsByParent = new Map<string | undefined, ProviderGroup[]>()
  for (const group of groups) {
    const slash = group.fullPath.lastIndexOf('/')
    const parent = slash < 0 ? undefined : ownerOf(group.fullPath.slice(0, slash), paths)
    const siblings = groupsByParent.get(parent)
    if (siblings) siblings.push(group)
    else groupsByParent.set(parent, [group])
  }
  const issuesByProject = new Map<number, number>()
  for (const issue of issues.filter((item) => isIssueVisible(item)))
    issuesByProject.set(issue.projectId, (issuesByProject.get(issue.projectId) ?? 0) + 1)

  const projectsByGroup = new Map<string, SidebarItem[]>()
  const projectCountByGroup = new Map<string, number>()
  for (const project of projects) {
    const owner = ownerOf(project.groupPath ?? project.namespace, paths)
    const target = owner ?? `__standalone__`
    const count = issuesByProject.get(project.id) ?? 0
    const item = {
      viewParam: viewRefToParam(projectViewRef(`${project.namespace}/${project.path}`)),
      label: project.path,
      count: String(count),
    }
    const siblings = projectsByGroup.get(target)
    if (siblings) siblings.push(item)
    else projectsByGroup.set(target, [item])
    projectCountByGroup.set(target, (projectCountByGroup.get(target) ?? 0) + count)
  }

  const childrenOf = (path: string | undefined): readonly SidebarGroupItem[] =>
    (groupsByParent.get(path) ?? [])
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
