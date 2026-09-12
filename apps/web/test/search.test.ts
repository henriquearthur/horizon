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
  it('fills in the defaults and decodes the View once', () => {
    expect(resolveShellSearch({})).toEqual({
      viewParam: DEFAULT_VIEW_PARAM,
      view: { _tag: 'Builtin', id: 'inbox' },
      mode: 'list',
      query: '',
    })
  })

  it('passes through what is set', () => {
    expect(resolveShellSearch({ view: 'project:infra/ci', mode: 'kanban', q: 'ci' })).toEqual({
      viewParam: 'project:infra/ci',
      view: { _tag: 'Project', path: 'infra/ci' },
      mode: 'kanban',
      query: 'ci',
    })
  })
})
