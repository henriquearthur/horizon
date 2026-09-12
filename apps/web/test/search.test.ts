import { describe, expect, it } from 'vitest'
import { DEFAULT_VIEW_PARAM, resolveShellSearch, validateShellSearch } from '~/lib/search'

describe('validateShellSearch', () => {
  it('keeps the URL clean when everything is at its default', () => {
    expect(validateShellSearch({})).toEqual({})
    expect(validateShellSearch({ view: DEFAULT_VIEW_PARAM, mode: 'list', q: '' })).toEqual({})
  })

  it('keeps non-default values', () => {
    expect(validateShellSearch({ view: 'all', mode: 'kanban', q: 'terraform' })).toEqual({
      view: 'all',
      mode: 'kanban',
      q: 'terraform',
    })
  })

  it('normalises unknown values back to the defaults', () => {
    expect(validateShellSearch({ view: 'nope', mode: 'grid', q: 42 })).toEqual({})
  })
})

describe('resolveShellSearch', () => {
  it('fills in the defaults', () => {
    expect(resolveShellSearch({})).toEqual({ view: DEFAULT_VIEW_PARAM, mode: 'list', q: '' })
  })

  it('passes through what is set', () => {
    expect(resolveShellSearch({ view: 'all', mode: 'kanban', q: 'ci' })).toEqual({
      view: 'all',
      mode: 'kanban',
      q: 'ci',
    })
  })
})
