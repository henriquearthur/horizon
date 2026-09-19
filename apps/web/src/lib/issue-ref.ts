import { friendlyIssueId, type ProviderIssue, type ProviderProject } from '@horizon/domain'

/** `DC-203` — the code the user reads and shares. */
const FRIENDLY_REF = /^[A-Za-z][A-Za-z0-9]*-\d+$/
/** `2187:203` — the fallback for an Issue whose project is not in the snapshot. */
const TECHNICAL_REF = /^\d+:\d+$/

export const isIssueRef = (value: string): boolean =>
  FRIENDLY_REF.test(value) || TECHNICAL_REF.test(value)

/**
 * The reference Horizon puts in the URL. The friendly code wins, so an address
 * reads `/issue/DC-203`; a project outside the snapshot keeps the technical
 * `projectId:iid`, which never becomes ambiguous.
 */
export const issueRefParam = (
  issue: Pick<ProviderIssue, 'projectId' | 'iid'>,
  projects: readonly ProviderProject[],
): string => {
  const project = projects.find((candidate) => candidate.id === issue.projectId)
  return project ? friendlyIssueId(project, issue.iid) : `${issue.projectId}:${issue.iid}`
}

/**
 * The Issue an URL reference points at. Two projects can share a friendly
 * prefix; the lowest project id wins, so the same address always opens the
 * same Issue.
 */
export const findIssueByRef = (
  ref: string | undefined,
  issues: readonly ProviderIssue[],
  projects: readonly ProviderProject[],
): ProviderIssue | undefined => {
  if (!ref) return undefined
  if (TECHNICAL_REF.test(ref)) {
    const [projectId = NaN, iid = NaN] = ref.split(':').map(Number)
    return issues.find((issue) => issue.projectId === projectId && issue.iid === iid)
  }
  const needle = ref.toLowerCase()
  const projectById = new Map(projects.map((project) => [project.id, project]))
  return issues
    .filter((issue) => {
      const project = projectById.get(issue.projectId)
      return Boolean(project) && friendlyIssueId(project!, issue.iid).toLowerCase() === needle
    })
    .sort((a, b) => a.projectId - b.projectId)[0]
}

/** The dedicated full-page address of an Issue. */
export const issuePageHref = (ref: string): string => `/issue/${ref}`
