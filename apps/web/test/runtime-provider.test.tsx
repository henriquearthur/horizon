import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { act } from '@testing-library/react'
import { updateRuntimeIssueProperties } from '~/server/runtime-functions'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  HorizonRuntimeProvider,
  replaceIssueInList,
  useHorizonRuntime,
} from '~/runtime/runtime-provider'
import type { RuntimeSnapshot } from '~/server/runtime'

vi.mock('~/server/runtime-functions', () => ({
  updateRuntimeIssueProperties: vi.fn(),
}))

const snapshot = (title: string): RuntimeSnapshot => ({
  connection: {
    url: 'https://gitlab.example.com',
    user: { id: 1, username: 'henrique', name: 'Henrique' },
  },
  scope: { groups: ['infra'], projects: [10], followGroups: [] },
  groups: [{ id: 2, fullPath: 'infra', name: 'Infra' }],
  projects: [
    {
      id: 10,
      path: 'platform',
      name: 'Platform',
      namespace: 'infra',
      groupPath: 'infra',
      webUrl: 'https://gitlab.example.com/infra/platform',
    },
  ],
  issues: [
    {
      id: 100,
      iid: 7,
      projectId: 10,
      title,
      state: 'opened',
      webUrl: 'https://gitlab.example.com/infra/platform/-/issues/7',
      assignees: [],
      labels: [],
    },
  ],
  users: [],
  labels: [],
})

function Consumer() {
  const runtime = useHorizonRuntime()
  return (
    <div>
      <span>{runtime.loading ? 'Carregando' : runtime.snapshot?.issues[0]?.title}</span>
      <button onClick={() => void runtime.refresh()}>Atualizar</button>
    </div>
  )
}

function ThrowingConsumer() {
  const runtime = useHorizonRuntime()
  const [caught, setCaught] = useState(false)
  return (
    <button
      onClick={async () => {
        try {
          await runtime.refresh({ force: true, throwOnError: true })
        } catch {
          setCaught(true)
        }
      }}
    >
      {caught ? 'Falha propagada' : 'Atualizar estritamente'}
    </button>
  )
}

describe('HorizonRuntimeProvider', () => {
  it('preserves the ordering timestamp for assignment-only updates', () => {
    const current = snapshot('Antes').issues[0]!
    const positioned = { ...current, updatedAt: '2026-09-01T10:00:00Z' }
    const assigned = {
      ...positioned,
      updatedAt: '2026-09-12T10:00:00Z',
      assignees: [snapshot('Depois').connection.user],
    }
    expect(replaceIssueInList([positioned], assigned, true)[0]).toMatchObject({
      assignees: assigned.assignees,
      updatedAt: positioned.updatedAt,
    })
  })

  it('keeps the parent link a write answer cannot carry', () => {
    const child = { ...snapshot('Antes').issues[0]!, parentIid: 4, hasChildren: false }
    const answered = { ...child, labels: ['horizon-blocks:1:9:1:2'] }
    delete (answered as { parentIid?: number }).parentIid

    expect(replaceIssueInList([child], answered)[0]).toMatchObject({
      parentIid: 4,
      labels: answered.labels,
    })
  })

  it('drops the close date of an Issue that came back open', () => {
    const closed = {
      ...snapshot('Antes').issues[0]!,
      state: 'closed' as const,
      closedAt: '2026-09-01T10:00:00Z',
    }
    const reopened = { ...closed, state: 'opened' as const }
    delete (reopened as { closedAt?: string }).closedAt

    expect(replaceIssueInList([closed], reopened)[0]).not.toHaveProperty('closedAt')
  })

  it('loads the scoped cache and replaces it after manual refresh', async () => {
    const loadSnapshot = vi
      .fn<() => Promise<RuntimeSnapshot>>()
      .mockResolvedValueOnce(snapshot('Primeiro'))
      .mockResolvedValueOnce(snapshot('Atualizado'))

    render(
      <HorizonRuntimeProvider loadSnapshot={loadSnapshot} pollingIntervalMs={0}>
        <Consumer />
      </HorizonRuntimeProvider>,
    )

    expect(screen.getByText('Carregando')).toBeInTheDocument()
    expect(await screen.findByText('Primeiro')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Atualizar' }))
    await waitFor(() => expect(screen.getByText('Atualizado')).toBeInTheDocument())
    expect(loadSnapshot).toHaveBeenCalledTimes(2)
  })

  it('propagates refresh failures when a save depends on the new snapshot', async () => {
    const loadSnapshot = vi
      .fn<() => Promise<RuntimeSnapshot>>()
      .mockResolvedValueOnce(snapshot('Inicial'))
      .mockRejectedValueOnce(new Error('GitLab indisponível'))

    render(
      <HorizonRuntimeProvider loadSnapshot={loadSnapshot} pollingIntervalMs={0}>
        <ThrowingConsumer />
      </HorizonRuntimeProvider>,
    )
    await waitFor(() => expect(loadSnapshot).toHaveBeenCalledOnce())
    await userEvent.click(screen.getByRole('button', { name: 'Atualizar estritamente' }))
    expect(await screen.findByText('Falha propagada')).toBeInTheDocument()
  })
})

it('updates status before GitLab responds and rolls back a rejected write', async () => {
  let reject!: (error: Error) => void
  vi.mocked(updateRuntimeIssueProperties).mockImplementation(
    () =>
      new Promise((_, fail) => {
        reject = fail
      }),
  )
  function StatusConsumer() {
    const { snapshot, provider } = useHorizonRuntime()
    return (
      <>
        <span>{snapshot?.issues[0]?.state}</span>
        <button
          onClick={() => {
            void provider.updateIssueProperties(10, 7, { status: 'Concluído' }).catch(() => {})
          }}
        >
          Fechar
        </button>
      </>
    )
  }
  render(
    <HorizonRuntimeProvider loadSnapshot={async () => snapshot('Antes')} pollingIntervalMs={0}>
      <StatusConsumer />
    </HorizonRuntimeProvider>,
  )
  await screen.findByText('opened')
  await userEvent.click(screen.getByText('Fechar'))
  expect(screen.getByText('closed')).toBeInTheDocument()
  await act(async () => reject(new Error('offline')))
  expect(screen.getByText('opened')).toBeInTheDocument()
})

it('serializes rapid edits and preserves the last intent when the first write fails', async () => {
  let reject!: (error: Error) => void
  let confirm!: (issue: RuntimeSnapshot['issues'][number]) => void
  vi.mocked(updateRuntimeIssueProperties)
    .mockImplementationOnce(
      () =>
        new Promise((_, fail) => {
          reject = fail
        }),
    )
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          confirm = done
        }),
    )
  function Edits() {
    const { snapshot, provider } = useHorizonRuntime()
    return (
      <>
        <span>{snapshot?.issues[0]?.labels.join(',')}</span>
        <button
          onClick={() => {
            void provider.updateIssueProperties(10, 7, { status: 'Concluído' }).catch(() => {})
            void provider.updateIssueProperties(10, 7, { status: 'Em andamento' }).catch(() => {})
          }}
        >
          Editar duas vezes
        </button>
      </>
    )
  }
  const load = vi.fn(async () => snapshot('Antes'))
  const before = vi.mocked(updateRuntimeIssueProperties).mock.calls.length
  render(
    <HorizonRuntimeProvider loadSnapshot={load} pollingIntervalMs={0}>
      <Edits />
    </HorizonRuntimeProvider>,
  )
  await waitFor(() => expect(load).toHaveBeenCalled())
  await userEvent.click(screen.getByText('Editar duas vezes'))
  expect(screen.getByText('horizon::status::Em andamento')).toBeInTheDocument()
  expect(updateRuntimeIssueProperties).toHaveBeenCalledTimes(before + 1)
  await act(async () => reject(new Error('offline')))
  expect(updateRuntimeIssueProperties).toHaveBeenCalledTimes(before + 2)
  expect(screen.getByText('horizon::status::Em andamento')).toBeInTheDocument()
  await act(async () =>
    confirm({ ...snapshot('Antes').issues[0]!, labels: ['horizon::status::Em andamento'] }),
  )
  expect(screen.getByText('horizon::status::Em andamento')).toBeInTheDocument()
})

it('does not let a poll started before a write undo the confirmed write', async () => {
  let finishPoll!: (value: RuntimeSnapshot) => void
  const load = vi
    .fn()
    .mockResolvedValueOnce(snapshot('Antes'))
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          finishPoll = done
        }),
    )
  vi.mocked(updateRuntimeIssueProperties).mockResolvedValueOnce({
    ...snapshot('Antes').issues[0]!,
    state: 'closed',
  })
  function Race() {
    const runtime = useHorizonRuntime()
    return (
      <>
        <span>{runtime.snapshot?.issues[0]?.state}</span>
        <button onClick={() => void runtime.refresh()}>Poll</button>
        <button
          onClick={() =>
            void runtime.provider.updateIssueProperties(10, 7, { status: 'Concluído' })
          }
        >
          Salvar status
        </button>
      </>
    )
  }
  render(
    <HorizonRuntimeProvider loadSnapshot={load} pollingIntervalMs={0}>
      <Race />
    </HorizonRuntimeProvider>,
  )
  await screen.findByText('opened')
  await userEvent.click(screen.getByText('Poll'))
  await userEvent.click(screen.getByText('Salvar status'))
  await act(async () => finishPoll(snapshot('Antes')))
  expect(screen.getByText('closed')).toBeInTheDocument()
})

it('preserves unchanged records and catalogs across polling', async () => {
  const { shareSnapshot } = await import('~/runtime/runtime-provider')
  const previous = snapshot('Antes')
  const identical = shareSnapshot(previous, structuredClone(previous))
  expect(identical.issues).toBe(previous.issues)
  expect(identical.projects).toBe(previous.projects)
  const changed = shareSnapshot(previous, snapshot('Depois'))
  expect(changed.issues[0]).not.toBe(previous.issues[0])
  expect(changed.projects).toBe(previous.projects)
})
