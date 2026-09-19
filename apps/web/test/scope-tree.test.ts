import { expect, it } from 'vitest'
import { buildScopeTree } from '~/lib/scope-tree'

it('finds the nearest tracked ancestor across missing levels and accumulates counts', () => {
  const tree = buildScopeTree(
    [
      { id: 1, fullPath: 'org', name: 'Org' },
      { id: 2, fullPath: 'org/missing/team', name: 'Team' },
    ],
    [
      { id: 1, path: 'app', name: 'App', namespace: 'org/missing/team/deeper', webUrl: '' },
      { id: 2, path: 'other', name: 'Other', namespace: 'personal', webUrl: '' },
    ],
    [
      {
        id: 1,
        iid: 1,
        projectId: 1,
        title: 'Issue',
        state: 'opened',
        webUrl: '',
        labels: [],
        assignees: [],
      },
    ],
  )
  expect(tree.groups[0]).toMatchObject({
    path: 'org',
    count: '1',
    groups: [{ path: 'org/missing/team', count: '1', projects: [{ label: 'app', count: '1' }] }],
  })
  expect(tree.standaloneProjects).toMatchObject([{ label: 'other', count: '0' }])
})
