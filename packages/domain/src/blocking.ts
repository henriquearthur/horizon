import type { ProviderIssue } from './provider-read.ts'

/** Stable label used for an informational cross-project dependency. */
export const blockingLabel = (
  source: Pick<ProviderIssue, 'projectId' | 'iid'>,
  target: Pick<ProviderIssue, 'projectId' | 'iid'>,
): string => `horizon::blocks::${source.projectId}:${source.iid}::${target.projectId}:${target.iid}`

export interface BlockingReference {
  readonly source: string
  readonly target: string
  readonly sourceIssue?: ProviderIssue
  readonly targetIssue?: ProviderIssue
  readonly valid: boolean
}

const key = (projectId: number, iid: number) => `${projectId}:${iid}`
const pattern = /^horizon::blocks::(\d+):(\d+)::(\d+):(\d+)$/

/** Derives both directions and flags references absent from the readable scope. */
export const blockingReferences = (issues: readonly ProviderIssue[]): readonly BlockingReference[] => {
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
        ...(sourceIssue ? { sourceIssue } : {}),
        ...(targetIssue ? { targetIssue } : {}),
        valid: !!sourceIssue && !!targetIssue,
      })
    }
  }
  return result
}

export const blocks = (issue: ProviderIssue, issues: readonly ProviderIssue[]): readonly BlockingReference[] =>
  blockingReferences(issues).filter((reference) => reference.source === key(issue.projectId, issue.iid))

export const blockedBy = (issue: ProviderIssue, issues: readonly ProviderIssue[]): readonly BlockingReference[] =>
  blockingReferences(issues).filter((reference) => reference.target === key(issue.projectId, issue.iid))
