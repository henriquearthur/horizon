import { render, screen } from '@testing-library/react'
import { useState } from 'react'
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
      closedAt: new Date().toISOString(),
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

  it('names timestamp sort options explicitly', async () => {
    render(
      <InboxContent
        snapshot={snapshot}
        view={{ _tag: 'Builtin', id: 'general' }}
        mode="list"
        query=""
        provider={{} as never}
        refresh={vi.fn()}
        refreshing={false}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: /Atualização/ }))
    expect(await screen.findByRole('menuitemradio', { name: 'Atualização' })).toBeInTheDocument()
    expect(screen.getByRole('menuitemradio', { name: 'Criação' })).toBeInTheDocument()
  })

  it('filters scoped issues by structured status', async () => {
    render(
      <InboxContent
        snapshot={snapshot}
        view={{ _tag: 'Builtin', id: 'general' }}
        mode="list"
        query=""
        provider={{} as never}
        refresh={vi.fn()}
        refreshing={false}
      />,
    )

    expect(screen.getByText('Backlog issue')).toBeInTheDocument()
    expect(screen.getByText('Done issue')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Filtro' }))
    await userEvent.click(await screen.findByRole('button', { name: /^Concluído/ }))

    expect(screen.queryByText('Backlog issue')).not.toBeInTheDocument()
    expect(screen.getByText('Done issue')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Remover filtro Status' })).toBeInTheDocument()
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
        view={{ _tag: 'Builtin', id: 'general' }}
        mode="list"
        query=""
        provider={provider}
        refresh={vi.fn()}
        refreshing={false}
      />,
    )

    expect(screen.getByTitle('Status conflitante')).toBeInTheDocument()
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

  it('keeps the Detail open when assigning the issue to the current user', async () => {
    function Harness() {
      const [current, setCurrent] = useState(snapshot)
      const provider = {
        listComments: vi.fn().mockResolvedValue([]),
        updateIssue: vi.fn().mockImplementation(async (_projectId, _iid, changes) => {
          const updated = {
            ...current.issues[0]!,
            assignees: [current.connection.user],
            ...changes,
          }
          setCurrent({ ...current, issues: [updated, ...current.issues.slice(1)] })
          return updated
        }),
      } as never
      return (
        <InboxContent
          snapshot={current}
          view={{ _tag: 'Builtin', id: 'general' }}
          mode="list"
          query=""
          provider={provider}
          refresh={vi.fn()}
          refreshing={false}
        />
      )
    }

    render(<Harness />)
    await userEvent.click(screen.getByText('Backlog issue'))
    expect(await screen.findByLabelText('Detalhes do issue')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Atribuir a mim' }))
    expect(await screen.findByLabelText('Detalhes do issue')).toBeInTheDocument()
  })
})
