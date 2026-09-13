import type { ProviderIssue } from './provider-read.ts'
import { readIssueProperties } from './properties.ts'

/**
 * Stable label used for a cross-project blocking link, written on the blocking
 * Issue as `<source project>:<source iid>:<target project>:<target iid>`.
 *
 * The prefix deliberately uses a single colon: a `horizon::…` name would be a
 * GitLab scoped label, and GitLab keeps only one label per scope, so an Issue
 * could never block more than one other Issue.
 */
export const BLOCKING_LABEL_PREFIX = 'horizon::blocked::'

export const blockingLabel = (
  source: Pick<ProviderIssue, 'projectId' | 'iid'>,
  target: Pick<ProviderIssue, 'projectId' | 'iid'>,
): string =>
  `${BLOCKING_LABEL_PREFIX}${source.projectId}:${source.iid}:${target.projectId}:${target.iid}`

export interface BlockingReference {
  readonly source: string
  readonly target: string
  /** The exact label that encodes this link. */
  readonly label: string
  /** The Issue whose labels carry this link; the one to edit to undo it. */
  readonly carrier: ProviderIssue
  readonly sourceIssue?: ProviderIssue
  readonly targetIssue?: ProviderIssue
  readonly valid: boolean
}

const key = (projectId: number, iid: number) => `${projectId}:${iid}`
const pattern = /^(?:horizon::blocked::|horizon-blocks:)(\d+):(\d+):(\d+):(\d+)$/

/** `projectId:iid`, the key both ends of a link are written with. */
export const issueRefKey = (issue: Pick<ProviderIssue, 'projectId' | 'iid'>): string =>
  key(issue.projectId, issue.iid)

/** Derives both directions and flags references absent from the readable scope. */
export const blockingReferences = (
  issues: readonly ProviderIssue[],
): readonly BlockingReference[] => {
  const byKey = new Map(issues.map((issue) => [key(issue.projectId, issue.iid), issue]))
  const result: BlockingReference[] = []
  for (const issue of issues) {
    for (const label of issue.labels) {
      const match = pattern.exec(label)
      if (!match) continue
      const source = key(Number(match[1]), Number(match[2]))
      const target = key(Number(match[3]), Number(match[4]))
      const sourceIssue = byKey.get(source)
      const targetIssue = byKey.get(target)
      result.push({
        source,
        target,
        label,
        carrier: issue,
        ...(sourceIssue ? { sourceIssue } : {}),
        ...(targetIssue ? { targetIssue } : {}),
        valid: !!sourceIssue && !!targetIssue,
      })
    }
  }
  return result
}

export const blocks = (
  issue: ProviderIssue,
  issues: readonly ProviderIssue[],
): readonly BlockingReference[] =>
  blockingReferences(issues).filter((reference) => reference.source === issueRefKey(issue))

export const blockedBy = (
  issue: ProviderIssue,
  issues: readonly ProviderIssue[],
): readonly BlockingReference[] =>
  blockingReferences(issues).filter((reference) => reference.target === issueRefKey(issue))

/** Adds the link to the labels of the blocking Issue, never twice. */
export const withBlockingLink = (
  source: ProviderIssue,
  target: Pick<ProviderIssue, 'projectId' | 'iid'>,
): readonly string[] => [...new Set([...source.labels, blockingLabel(source, target)])]

/** Drops one link from the labels of the Issue that carries it. */
export const withoutBlockingLink = (reference: BlockingReference): readonly string[] =>
  reference.carrier.labels.filter((label) => label !== reference.label)

/**
 * The Issues that cannot start yet: something blocks them and that blocker is
 * still open. A blocker outside the Escopo says nothing about its own state,
 * so it never marks the Issue as blocked — an unreachable link is shown as
 * such where the links themselves are listed.
 */
export const blockedIssueKeys = (issues: readonly ProviderIssue[]): ReadonlySet<string> => {
  const blocked = new Set<string>()
  for (const reference of blockingReferences(issues)) {
    if (!reference.sourceIssue) continue
    if (readIssueProperties(reference.sourceIssue).status === 'Concluído') continue
    blocked.add(reference.target)
  }
  return blocked
}
