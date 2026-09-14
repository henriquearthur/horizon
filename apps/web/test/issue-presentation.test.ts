import { describe, expect, it } from 'vitest'
import { statusOrder, statusPresentation } from '~/lib/issue-presentation'

describe('status presentation', () => {
  it('gives Pausada its own presentation and ordering', () => {
    expect(statusPresentation('Pausada')).toEqual({
      status: 'Pausada',
      color: 'var(--status-paused)',
      surface: 'bg-status-paused/15 text-status-paused',
    })
    expect(statusOrder('Pausada')).toBe(2)
    expect(statusOrder('Concluído')).toBe(3)
  })
})
