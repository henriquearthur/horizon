import { render, screen, waitFor, within } from '@testing-library/react'
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

  it.each(['list', 'kanban'] as const)(
    'changes status from the %s icon without opening the issue',
    async (mode) => {
      const updateIssueProperties = vi.fn().mockResolvedValue(snapshot.issues[0])
      const onIssueSelected = vi.fn()
      render(
        <InboxContent
          snapshot={snapshot}
          view={{ _tag: 'Builtin', id: 'general' }}
          mode={mode}
          query=""
          provider={{ updateIssueProperties } as never}
          refresh={vi.fn()}
          refreshing={false}
          onIssueSelected={onIssueSelected}
        />,
      )

      await userEvent.click(screen.getByRole('button', { name: 'Alterar status: Backlog' }))
      expect(await screen.findByRole('menuitem', { name: 'Em andamento' })).toBeInTheDocument()
      expect(screen.getByRole('menuitem', { name: 'Concluído' })).toBeInTheDocument()
      await userEvent.click(screen.getByRole('menuitem', { name: 'Concluído' }))

      expect(updateIssueProperties).toHaveBeenCalledWith(1, 1, { status: 'Concluído' })
      expect(onIssueSelected).not.toHaveBeenCalled()
    },
  )

  it('shows status mutation failures and remains retryable', async () => {
    const updateIssueProperties = vi
      .fn()
      .mockRejectedValueOnce(new Error('Falha ao fechar no GitLab.'))
      .mockResolvedValueOnce(snapshot.issues[0])
    render(
      <InboxContent
        snapshot={snapshot}
        view={{ _tag: 'Builtin', id: 'general' }}
        mode="list"
        query=""
        provider={{ updateIssueProperties } as never}
        refresh={vi.fn()}
        refreshing={false}
      />,
    )

    await userEvent.click(screen.getByRole('button', { name: 'Alterar status: Backlog' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Concluído' }))
    expect(await screen.findByText('Falha ao fechar no GitLab.')).toHaveAttribute('role', 'alert')

    await userEvent.click(screen.getByRole('button', { name: 'Alterar status: Backlog' }))
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Em andamento' }))
    expect(updateIssueProperties).toHaveBeenCalledTimes(2)
  })

  it('opens usable details while discussion requests are still pending', async () => {
    render(
      <InboxContent
        snapshot={snapshot}
        view={{ _tag: 'Builtin', id: 'general' }}
        mode="kanban"
        query=""
        refresh={vi.fn()}
        refreshing={false}
        provider={{ listComments: () => new Promise(() => {}) } as never}
      />,
    )
    await userEvent.click(screen.getByText('Backlog issue'))
    expect(screen.getByLabelText('Detalhes do issue')).toHaveAttribute('aria-busy', 'false')
    expect(screen.queryByLabelText('Carregando')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Editar' })).toBeEnabled()
  })

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
    const filterMenu = (await screen.findByLabelText('Buscar em Concluídos')).closest(
      '[data-slot="popover-content"]',
    ) as HTMLElement
    await userEvent.click(within(filterMenu).getByRole('button', { name: 'Status' }))
    await userEvent.click(within(filterMenu).getByText('Concluído').closest('button')!)

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

  it('closes the Detail and keeps it closed', async () => {
    const provider = { listComments: vi.fn().mockResolvedValue([]) } as never
    render(
      <InboxContent
        snapshot={snapshot}
        view={{ _tag: 'Builtin', id: 'general' }}
        mode="list"
        query=""
        issueRef="1:1"
        provider={provider}
        refresh={vi.fn()}
        refreshing={false}
      />,
    )

    expect(await screen.findByLabelText('Detalhes do issue')).toBeInTheDocument()
    await userEvent.click(screen.getAllByRole('button', { name: 'Fechar detalhes' })[0]!)

    expect(screen.queryByLabelText('Detalhes do issue')).not.toBeInTheDocument()
  })

  it('hangs a sub-issue under its parent instead of listing it twice', async () => {
    const withChild = {
      ...snapshot,
      issues: [
        { ...snapshot.issues[0]!, hasChildren: true },
        {
          ...snapshot.issues[0]!,
          id: 3,
          iid: 3,
          title: 'Sub issue',
          parentIid: 1,
          labels: [],
        },
      ],
    }
    render(
      <InboxContent
        snapshot={withChild}
        view={{ _tag: 'Builtin', id: 'general' }}
        mode="list"
        query=""
        provider={{} as never}
        refresh={vi.fn()}
        refreshing={false}
      />,
    )

    expect(screen.queryByText('Sub issue')).not.toBeInTheDocument()
    expect(screen.getByText('0 de 1 concluídos')).toBeInTheDocument()
    await userEvent.click(
      screen.getByRole('button', { name: /Expandir sub-issues de Backlog issue/ }),
    )
    expect(screen.getByText('Sub issue')).toBeInTheDocument()
  })

  it('allows the sub-issue progress to shrink inside a Kanban card', () => {
    const children = Array.from({ length: 10 }, (_, index) => ({
      ...snapshot.issues[0]!,
      id: index + 3,
      iid: index + 3,
      title: `Sub issue ${index + 1}`,
      parentIid: 1,
      labels: [],
    }))
    render(
      <InboxContent
        snapshot={{
          ...snapshot,
          issues: [{ ...snapshot.issues[0]!, hasChildren: true }, ...children],
        }}
        view={{ _tag: 'Builtin', id: 'general' }}
        mode="kanban"
        query=""
        provider={{} as never}
        refresh={vi.fn()}
        refreshing={false}
      />,
    )

    const progress = screen.getByTitle('0 de 10 concluídos')
    expect(progress).toHaveClass('min-w-0')
    expect(progress).not.toHaveClass('shrink-0')
    expect(screen.getByText('0 de 10 concluídos')).toHaveClass('truncate')
  })

  it('shows the parent of a sub-issue in the Detail and opens it in place', async () => {
    const withChild = {
      ...snapshot,
      issues: [
        { ...snapshot.issues[0]!, hasChildren: true },
        { ...snapshot.issues[0]!, id: 3, iid: 3, title: 'Sub issue', parentIid: 1, labels: [] },
      ],
    }
    const onIssueSelected = vi.fn()
    render(
      <InboxContent
        snapshot={withChild}
        view={{ _tag: 'Builtin', id: 'general' }}
        mode="list"
        query=""
        issueRef="1:3"
        provider={{ listComments: vi.fn().mockResolvedValue([]) } as never}
        refresh={vi.fn()}
        refreshing={false}
        onIssueSelected={onIssueSelected}
      />,
    )

    const parentReference = await screen.findByRole('button', {
      name: 'Abrir a issue pai #1: Backlog issue',
    })
    await userEvent.click(parentReference)
    expect(onIssueSelected).toHaveBeenCalledWith('1:1')
  })

  it('creates a blocking link from the Detail and writes it as a label', async () => {
    const updateIssue = vi.fn().mockResolvedValue(snapshot.issues[0])
    render(
      <InboxContent
        snapshot={snapshot}
        view={{ _tag: 'Builtin', id: 'general' }}
        mode="list"
        query=""
        issueRef="1:1"
        provider={{ listComments: vi.fn().mockResolvedValue([]), updateIssue } as never}
        refresh={vi.fn()}
        refreshing={false}
      />,
    )

    expect(await screen.findByText('Nenhum bloqueio registrado.')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Adicionar bloqueio/ }))
    const search = await screen.findByLabelText('Buscar issue para vincular')
    const picker = search.closest('[data-slot="popover-content"]') as HTMLElement
    await userEvent.click(within(picker).getByRole('button', { name: /Done issue/ }))

    await waitFor(() =>
      expect(updateIssue).toHaveBeenCalledWith(1, 1, { labels: ['horizon::blocked::1:1:1:2'] }),
    )
  })

  it('keeps an old parent and old siblings when one direct child remains open', async () => {
    const old = '2025-01-01T00:00:00Z'
    const parent = { ...snapshot.issues[0]!, state: 'closed' as const, closedAt: old }
    const openChild = { ...snapshot.issues[0]!, id: 3, iid: 3, title: 'Open child', parentIid: 1 }
    const oldChild = {
      ...snapshot.issues[0]!,
      id: 4,
      iid: 4,
      title: 'Old child',
      parentIid: 1,
      state: 'closed' as const,
      closedAt: old,
    }
    render(
      <InboxContent
        snapshot={{ ...snapshot, issues: [parent, openChild, oldChild] }}
        view={{ _tag: 'Builtin', id: 'general' }}
        mode="list"
        query=""
        provider={{} as never}
        refresh={vi.fn()}
        refreshing={false}
      />,
    )

    expect(screen.getByText('1 de 2 concluídos')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: /Expandir sub-issues/ }))
    expect(screen.getByText('Open child')).toBeInTheDocument()
    expect(screen.getByText('Old child')).toBeInTheDocument()
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

it('keeps merge request reads stable when only the issue status changes', async () => {
  const provider = {
    listComments: vi.fn().mockResolvedValue([]),
    listMergeRequests: vi.fn().mockResolvedValue([]),
  }
  const props = {
    snapshot,
    view: { _tag: 'Builtin', id: 'general' },
    mode: 'list',
    query: '',
    issueRef: '1:1',
    provider,
    refresh: vi.fn(),
    refreshing: false,
  } as const
  const { rerender } = render(<InboxContent {...props} provider={provider as never} />)
  await waitFor(() => expect(provider.listMergeRequests).toHaveBeenCalledTimes(1))
  rerender(
    <InboxContent
      {...props}
      provider={provider as never}
      snapshot={{
        ...snapshot,
        issues: [{ ...snapshot.issues[0]!, labels: ['horizon::status::Em andamento'] }],
      }}
    />,
  )
  expect(provider.listMergeRequests).toHaveBeenCalledTimes(1)
})
