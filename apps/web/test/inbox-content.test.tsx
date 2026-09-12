import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { InboxContent } from '~/components/inbox/inbox-content'
import type { RuntimeSnapshot } from '~/server/runtime'
import { persistSavedViews } from '~/db/use-saved-views'

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
  users: [],
  labels: [],
}

describe('InboxContent', () => {
  beforeEach(() => localStorage.clear())

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

  it('surfaces property conflicts and Provider errors from issue details', async () => {
    const conflicted = {
      ...snapshot,
      issues: [
        {
          ...snapshot.issues[0]!,
          labels: ['horizon::status::Backlog', 'horizon::status::Concluído'],
        },
      ],
    }
    const provider = {
      listComments: vi.fn().mockRejectedValue(new Error('Token sem permissão.')),
    } as never
    render(
      <InboxContent
        snapshot={conflicted}
        view={{ _tag: 'Builtin', id: 'all' }}
        mode="list"
        query=""
        provider={provider}
        refresh={vi.fn()}
        refreshing={false}
      />,
    )

    expect(screen.getByText('⚠ Conflito')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Backlog issue'))
    expect(await screen.findByText('Token sem permissão.')).toHaveAttribute('role', 'alert')
  })

  it('restores the complete saved View for the matching Escopo', async () => {
    const scope = JSON.stringify(snapshot.scope)
    persistSavedViews([
      {
        id: 'p1',
        name: 'Concluídos',
        scope,
        mode: 'kanban',
        query: 'Done',
        status: 'Concluído',
        groupBy: 'status',
        sort: 'title',
      },
      { id: 'other', name: 'Outro escopo', scope: 'outro' },
    ])
    const onSavedViewSelected = vi.fn()
    render(
      <InboxContent
        snapshot={snapshot}
        view={{ _tag: 'Saved', id: 'p1' }}
        mode="list"
        query=""
        provider={{} as never}
        refresh={vi.fn()}
        refreshing={false}
        onSavedViewSelected={onSavedViewSelected}
      />,
    )

    expect(await screen.findByText('Done issue')).toBeInTheDocument()
    expect(screen.queryByText('Backlog issue')).not.toBeInTheDocument()
    expect(onSavedViewSelected).toHaveBeenCalledWith({
      view: 'saved:p1',
      mode: 'kanban',
      query: 'Done',
    })
  })
})
