import { describe, expect, it } from 'vitest'
import {
  STATUS_VALUES,
  readIssueProperties,
  writeIssueProperties,
  stateForStatus,
} from '../src/properties.ts'

describe('Horizon issue properties', () => {
  it('maps defaults and structured labels', () => {
    expect(STATUS_VALUES).toEqual(['Backlog', 'Em andamento', 'Pausada', 'Concluído'])
    expect(readIssueProperties({ labels: ['bug'], state: 'opened' })).toMatchObject({
      status: 'Backlog',
      priority: undefined,
    })
    expect(
      readIssueProperties({
        labels: ['horizon::status::Em andamento', 'horizon::priority::P1 urgente'],
        state: 'opened',
      }),
    ).toMatchObject({ status: 'Em andamento', priority: 'P1 urgente' })
    expect(
      readIssueProperties({ labels: ['horizon::status::Pausada'], state: 'opened' }),
    ).toMatchObject({ status: 'Pausada' })
  })
  it('surfaces conflicts and replaces only Horizon labels', () => {
    expect(
      readIssueProperties({
        labels: ['x', 'horizon::status::Backlog', 'horizon::status::Concluído'],
        state: 'opened',
      }).conflicts.status,
    ).toBe(true)
    expect(
      writeIssueProperties(['x', 'horizon::status::Backlog', 'horizon::priority::P4 baixa'], {
        status: 'Concluído',
      }),
    ).toEqual(['x', 'horizon::status::Concluído', 'horizon::priority::P4 baixa'])
  })
  it('maps completed status to closed state', () => {
    expect(stateForStatus('Concluído')).toBe('closed')
    expect(stateForStatus('Backlog')).toBe('opened')
    expect(stateForStatus('Pausada')).toBe('opened')
  })

  it('writes the paused status without changing unrelated labels', () => {
    expect(
      writeIssueProperties(['bug', 'horizon::status::Em andamento'], { status: 'Pausada' }),
    ).toEqual(['bug', 'horizon::status::Pausada'])
  })
})
