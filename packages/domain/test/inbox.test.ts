import { describe, expect, it } from 'vitest'
import {
  filterIssues,
  searchIssues,
  groupIssues,
  sortIssues,
  visibleIssueHierarchy,
  type ProviderIssue,
  blockingLabel,
  blocks,
  blockedBy,
  blockingReferences,
} from '../src/index.ts'

const issue = (id: number, labels: readonly string[]): ProviderIssue => ({
  id,
  iid: id,
  projectId: 1,
  title: `Issue ${id}`,
  state: 'opened',
  webUrl: `https://gitlab.example/issues/${id}`,
  assignees: [],
  labels,
})

describe('Inbox grouping', () => {
  it('derives informational blocking in both directions, including inaccessible references', () => {
    const source = issue(1, [])
    const target = { ...issue(2, []), projectId: 9 }
    const label = blockingLabel(source, target)
    const linked = { ...source, labels: [label] }
    expect(blocks(linked, [linked, target])).toHaveLength(1)
    expect(blockedBy(target, [linked, target])).toHaveLength(1)
    expect(blockingReferences([linked, target])[0]?.valid).toBe(true)
    const invalid = { ...source, labels: [blockingLabel(source, { projectId: 88, iid: 7 })] }
    expect(blockingReferences([invalid])[0]?.valid).toBe(false)
  })
  it('keeps an old closed parent and all direct children while one child is open', () => {
    const old = '2026-01-01T00:00:00Z'
    const parent = { ...issue(1, []), state: 'closed' as const, closedAt: old }
    const openChild = { ...issue(2, []), parentIid: 1 }
    const oldChild = { ...issue(3, []), parentIid: 1, state: 'closed' as const, closedAt: old }
    const unrelated = { ...issue(4, []), state: 'closed' as const, closedAt: old }

    expect(
      visibleIssueHierarchy(
        [parent, openChild, oldChild, unrelated],
        Date.parse('2026-02-01T00:00:00Z'),
      ),
    ).toEqual([parent, openChild, oldChild])
  })
  it('groups structured Horizon properties including their defaults and conflicts', () => {
    const issues = [
      issue(1, []),
      issue(2, ['horizon::status::Em andamento', 'horizon::priority::P1 urgente']),
      issue(3, ['horizon::status::Backlog', 'horizon::status::Concluído']),
    ]

    expect([...groupIssues(issues, 'status').keys()]).toEqual([
      'Backlog',
      'Em andamento',
      'Conflito',
    ])
    expect([...groupIssues(issues, 'priority').keys()]).toEqual(['Sem prioridade', 'P1 urgente'])
  })

  it('filters by group path and sorts by Provider timestamps', () => {
    const older = {
      ...issue(99, []),
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-03T00:00:00Z',
    }
    const newer = {
      ...issue(1, []),
      projectId: 2,
      createdAt: '2026-01-02T00:00:00Z',
      updatedAt: '2026-01-04T00:00:00Z',
    }
    const projects = [
      { id: 1, path: 'a', name: 'A', namespace: 'infra', groupPath: 'infra', webUrl: '#' },
      { id: 2, path: 'b', name: 'B', namespace: 'apps', groupPath: 'apps', webUrl: '#' },
    ]

    expect(filterIssues([older, newer], { groupPaths: ['infra'] }, projects)).toEqual([older])
    expect(sortIssues([older, newer], 'created')).toEqual([newer, older])
    expect(sortIssues([older, newer], 'updated')).toEqual([newer, older])
  })
})

describe('searchIssues', () => {
  it('reads the labels a human wrote, not the ones Horizon writes', () => {
    const blocked = issue(1, ['horizon-blocks:1:2:1:1', 'horizon::status::Em andamento'])
    const tagged = issue(2, ['blocks-refactor'])

    expect(searchIssues([blocked, tagged], 'blocks')).toEqual([tagged])
    expect(searchIssues([blocked, tagged], 'status')).toEqual([])
    expect(searchIssues([blocked, tagged], 'Issue 1')).toEqual([blocked])
  })
})
