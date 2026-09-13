import { describe, expect, it } from 'vitest'
import {
  initiativeIdFromName,
  initiativeIdsFromLabels,
  initiativeLabel,
  isHorizonLabel,
} from '../src/index.ts'

describe('Projeto labels', () => {
  it('derives a readable id that survives a round trip through GitLab', () => {
    expect(initiativeIdFromName('Migração DF-e 2026')).toBe('migracao-df-e-2026')
    expect(initiativeIdFromName('  ***  ')).toBe('')
  })

  it('reads membership back out of the labels of an Issue', () => {
    const labels = ['type:spec', initiativeLabel('migracao-df-e-2026')]
    expect(initiativeIdsFromLabels(labels)).toEqual(['migracao-df-e-2026'])
    expect(isHorizonLabel(initiativeLabel('x'))).toBe(true)
  })
})
