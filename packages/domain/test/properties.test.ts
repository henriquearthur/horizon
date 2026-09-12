import { describe, expect, it } from 'vitest'
import { readIssueProperties, writeIssueProperties, stateForStatus } from '../src/properties.ts'

describe('Horizon issue properties', () => {
  it('maps defaults and structured labels', () => {
    expect(readIssueProperties({ labels: ['bug'], state: 'opened' })).toMatchObject({ status: 'Backlog', priority: undefined })
    expect(readIssueProperties({ labels: ['horizon::status::Em andamento', 'horizon::priority::P1 urgente'], state: 'opened' })).toMatchObject({ status: 'Em andamento', priority: 'P1 urgente' })
  })
  it('surfaces conflicts and replaces only Horizon labels', () => {
    expect(readIssueProperties({ labels: ['x', 'horizon::status::Backlog', 'horizon::status::Concluído'], state: 'opened' }).conflicts.status).toBe(true)
    expect(writeIssueProperties(['x', 'horizon::status::Backlog', 'horizon::priority::P4 baixa'], { status: 'Concluído' })).toEqual(['x', 'horizon::status::Concluído', 'horizon::priority::P4 baixa'])
  })
  it('maps completed status to closed state', () => { expect(stateForStatus('Concluído')).toBe('closed'); expect(stateForStatus('Backlog')).toBe('opened') })
})
