import { describe, expect, it } from 'vitest'
import {
  blockedBy,
  blockedIssueKeys,
  blockingLabel,
  blocks,
  isHorizonLabel,
  withBlockingLink,
  withoutBlockingLink,
  type ProviderIssue,
} from '../src/index.ts'

const issue = (projectId: number, iid: number, labels: readonly string[] = []): ProviderIssue => ({
  id: projectId * 1000 + iid,
  iid,
  projectId,
  title: `Issue ${projectId}:${iid}`,
  state: 'opened',
  webUrl: `https://gitlab.example/p/${projectId}/-/issues/${iid}`,
  assignees: [],
  labels,
})

describe('blocking links', () => {
  it('never becomes a GitLab scoped label, so one Issue can block many', () => {
    const label = blockingLabel({ projectId: 7, iid: 1 }, { projectId: 9, iid: 4 })
    expect(label).toBe('horizon::blocked::7:1:9:4')
    expect(isHorizonLabel(label)).toBe(true)
  })

  it('reads both directions out of the Escopo', () => {
    const source = issue(7, 1, [blockingLabel({ projectId: 7, iid: 1 }, { projectId: 9, iid: 4 })])
    const target = issue(9, 4)
    expect(blocks(source, [source, target])[0]?.targetIssue).toBe(target)
    expect(blockedBy(target, [source, target])[0]?.sourceIssue).toBe(source)
  })

  it('flags a link whose other end is outside the Escopo', () => {
    const source = issue(7, 1, [blockingLabel({ projectId: 7, iid: 1 }, { projectId: 9, iid: 4 })])
    const [reference] = blocks(source, [source])
    expect(reference?.valid).toBe(false)
    expect(reference?.carrier).toBe(source)
  })

  it('adds a link once and removes exactly the one asked for', () => {
    const source = issue(7, 1, ['backend'])
    const labels = withBlockingLink(source, { projectId: 9, iid: 4 })
    const linked = { ...source, labels }
    expect(withBlockingLink(linked, { projectId: 9, iid: 4 })).toEqual(labels)

    const [reference] = blocks(linked, [linked, issue(9, 4)])
    expect(withoutBlockingLink(reference!)).toEqual(['backend'])
  })
})

describe('blockedIssueKeys', () => {
  const done = 'horizon::status::Concluído'

  it('marks an Issue whose blocker is still open', () => {
    const blocker = issue(7, 1, [blockingLabel({ projectId: 7, iid: 1 }, { projectId: 9, iid: 4 })])
    const blocked = issue(9, 4)
    expect([...blockedIssueKeys([blocker, blocked])]).toEqual(['9:4'])
  })

  it('lets it go as soon as the blocker is concluded', () => {
    const blocker = issue(7, 1, [
      blockingLabel({ projectId: 7, iid: 1 }, { projectId: 9, iid: 4 }),
      done,
    ])
    expect([...blockedIssueKeys([blocker, issue(9, 4)])]).toEqual([])
  })

  it('says nothing about a blocker outside the Escopo', () => {
    const blocked = issue(9, 4, [blockingLabel({ projectId: 7, iid: 1 }, { projectId: 9, iid: 4 })])
    expect([...blockedIssueKeys([blocked])]).toEqual([])
  })
})
