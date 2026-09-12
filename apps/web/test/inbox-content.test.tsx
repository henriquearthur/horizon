import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { InboxContent } from '~/components/inbox/inbox-content'
import type { RuntimeSnapshot } from '~/server/runtime'

const snapshot: RuntimeSnapshot = {
  connection: { url: 'https://gitlab.example.com', user: { id: 1, username: 'me', name: 'Me' } },
  scope: { groups: [], projects: [1], followGroups: [] },
  groups: [],
  projects: [
    { id: 1, path: 'app', name: 'App', namespace: 'team', webUrl: 'https://gitlab/team/app' },
  ],
  issues: [
    {
      id: 1,
      iid: 1,
      projectId: 1,
      title: 'Backlog issue',
      state: 'opened',
      webUrl: '#1',
      assignees: [],
      labels: [],
    },
    {
      id: 2,
      iid: 2,
      projectId: 1,
      title: 'Done issue',
      state: 'closed',
      webUrl: '#2',
      assignees: [],
      labels: ['horizon::status::Concluído'],
    },
  ],
}

describe('InboxContent', () => {
  it('filters scoped issues by structured status', async () => {
    render(
      <InboxContent
        snapshot={snapshot}
        view={{ _tag: 'Builtin', id: 'all' }}
        mode="list"
        query=""
        provider={{} as never}
        refresh={vi.fn()}
        refreshing={false}
      />,
    )

    expect(screen.getByText('Backlog issue')).toBeInTheDocument()
    expect(screen.getByText('Done issue')).toBeInTheDocument()
    await userEvent.selectOptions(screen.getByLabelText('Filtrar por status'), 'Concluído')
    expect(screen.queryByText('Backlog issue')).not.toBeInTheDocument()
    expect(screen.getByText('Done issue')).toBeInTheDocument()
  })
})
