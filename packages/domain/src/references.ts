import type { ProviderIssue, ProviderReadContract } from './provider-read.ts'
import { isProjectSelected, type ScopeSelection } from './scope.ts'
import type { ProviderProject } from './provider.ts'

export type IssueReference =
  | {
      readonly kind: 'resolved'
      readonly issue: ProviderIssue
      readonly project: ProviderProject
      readonly technical: string
      readonly friendly: string
    }
  | { readonly kind: 'not-found'; readonly reference: string }
  | {
      readonly kind: 'conflict'
      readonly reference: string
      readonly candidates: readonly string[]
    }

export const friendlyIssueId = (project: Pick<ProviderProject, 'path'>, iid: number): string => {
  const parts = project.path.split(/[-_]/).filter(Boolean)
  const prefix = parts.length > 1 ? parts.map((part) => part[0]).join('') : project.path.slice(0, 2)
  return `${prefix.toUpperCase()}-${iid}`
}

const technical = (project: ProviderProject, iid: number) =>
  `${project.namespace}/${project.path}#${iid}`

export const resolveIssueReference = (
  reference: string,
  projects: readonly ProviderProject[],
  issues: readonly ProviderIssue[],
  scope: ScopeSelection,
): IssueReference => {
  const selected = projects.filter((project) => isProjectSelected(project, scope))
  const input = reference.trim()
  const hash = input.lastIndexOf('#')
  const path = hash >= 0 ? input.slice(0, hash) : ''
  const iid = Number(hash >= 0 ? input.slice(hash + 1) : input.replace(/^.*-/, ''))
  if (!Number.isInteger(iid) || iid <= 0) return { kind: 'not-found', reference }
  const candidates = selected.filter((project) => {
    const fullPath = `${project.namespace}/${project.path}`
    // `123#4` is the reference shape the Provider ids produce; both it and the
    // canonical `namespace/path#iid` must reach the same Issue.
    if (hash >= 0) return /^\d+$/.test(path) ? project.id === Number(path) : fullPath === path
    return friendlyIssueId(project, iid).toLowerCase() === input.toLowerCase()
  })
  const matches = candidates.filter((project) =>
    issues.some((issue) => issue.projectId === project.id && issue.iid === iid),
  )
  if (matches.length === 0) return { kind: 'not-found', reference }
  if (matches.length > 1)
    return {
      kind: 'conflict',
      reference,
      candidates: matches.map((p) => `${p.namespace}/${p.path}`).sort(),
    }
  const project = matches[0]!
  const issue = issues.find((item) => item.projectId === project.id && item.iid === iid)!
  return {
    kind: 'resolved',
    issue,
    project,
    technical: technical(project, iid),
    friendly: friendlyIssueId(project, iid),
  }
}

export const resolveIssueReferenceFromProvider = async (
  provider: ProviderReadContract,
  scope: ScopeSelection,
  reference: string,
): Promise<IssueReference> => {
  const data = await provider.readScope(scope)
  return resolveIssueReference(reference, data.projects, data.issues, scope)
}
