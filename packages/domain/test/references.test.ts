import { describe, expect, it } from 'vitest'
import { emptyScopeSelection, friendlyIssueId, resolveIssueReference } from '@horizon/domain'
import type { ProviderIssue, ProviderProject } from '@horizon/domain'

const project = (id: number, path: string, namespace = 'team'): ProviderProject => ({ id, path, namespace, name: path, webUrl: `https://git/${path}` })
const issue = (projectId: number, iid: number): ProviderIssue => ({ id: projectId * 10, iid, projectId, title: 'x', state: 'opened', webUrl: 'https://git/i', assignees: [], labels: [] })

describe('issue references', () => {
  it('keeps the friendly id algorithm and resolves technical references in scope', () => {
    const p = project(1, 'data-control')
    expect(friendlyIssueId(p, 7)).toBe('DC-7')
    expect(resolveIssueReference('team/data-control#7', [p], [issue(1, 7)], { ...emptyScopeSelection(), projects: [1] })).toMatchObject({ kind: 'resolved', technical: 'team/data-control#7', friendly: 'DC-7' })
  })
  it('reports friendly conflicts with all candidate paths', () => {
    const projects = [project(1, 'data-control'), project(2, 'data-center')]
    expect(resolveIssueReference('DC-7', projects, [issue(1, 7), issue(2, 7)], { ...emptyScopeSelection(), projects: [1, 2] })).toEqual({ kind: 'conflict', reference: 'DC-7', candidates: ['team/data-center', 'team/data-control'] })
  })
  it('does not resolve issues outside scope', () => {
    const p = project(1, 'data-control')
    expect(resolveIssueReference('DC-7', [p], [issue(1, 7)], emptyScopeSelection()).kind).toBe('not-found')
  })
})
