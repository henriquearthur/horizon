import { describe, expect, it } from 'vitest'
import type { ProviderIssue, ProviderProject } from '@horizon/domain'
import { findIssueByRef, isIssueRef, issuePageHref, issueRefParam } from '~/lib/issue-ref'

const project = (id: number, path: string): ProviderProject => ({
  id,
  path,
  name: path,
  namespace: 'team',
  webUrl: `https://gitlab/team/${path}`,
})

const issue = (id: number, projectId: number, iid: number): ProviderIssue => ({
  id,
  iid,
  projectId,
  title: `Issue ${iid}`,
  state: 'opened',
  webUrl: `#${iid}`,
  assignees: [],
  labels: [],
})

const projects = [project(2187, 'documentos-contabeis'), project(9, 'app')]
const issues = [issue(1, 2187, 203), issue(2, 9, 7)]

describe('issueRefParam', () => {
  it('uses the friendly code the user reads', () => {
    expect(issueRefParam(issues[0]!, projects)).toBe('DC-203')
    expect(issuePageHref(issueRefParam(issues[0]!, projects))).toBe('/issue/DC-203')
  })

  it('falls back to the technical reference outside the snapshot', () => {
    expect(issueRefParam({ projectId: 404, iid: 1 }, projects)).toBe('404:1')
  })
})

describe('findIssueByRef', () => {
  it('reads both the friendly code and the technical reference', () => {
    expect(findIssueByRef('DC-203', issues, projects)).toBe(issues[0])
    expect(findIssueByRef('dc-203', issues, projects)).toBe(issues[0])
    expect(findIssueByRef('9:7', issues, projects)).toBe(issues[1])
  })

  it('has nothing to open for an unknown reference', () => {
    expect(findIssueByRef('DC-999', issues, projects)).toBeUndefined()
    expect(findIssueByRef(undefined, issues, projects)).toBeUndefined()
  })
})

describe('isIssueRef', () => {
  it('accepts the two shapes the URL carries', () => {
    expect(isIssueRef('DC-203')).toBe(true)
    expect(isIssueRef('2187:203')).toBe(true)
    expect(isIssueRef('setup')).toBe(false)
    expect(isIssueRef('')).toBe(false)
  })
})
