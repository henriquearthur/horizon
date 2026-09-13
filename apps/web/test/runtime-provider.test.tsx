import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import {
  HorizonRuntimeProvider,
  replaceIssueInList,
  useHorizonRuntime,
} from '~/runtime/runtime-provider'
import type { RuntimeSnapshot } from '~/server/runtime'

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
