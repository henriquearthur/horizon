import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  builtinViews,
  decodeViewMode,
  decodeViewRef,
  projectViewRef,
  ViewMode,
  viewRefToParam,
} from '../src/index.ts'

describe('builtinViews', () => {
  it('lists the four builtin views in prototype order', () => {
    expect(builtinViews.map((v) => v.id)).toEqual(['inbox', 'all', 'by-project', 'assigned-to-me'])
  })

  it('gives every builtin view a title and a subtitle', () => {
    for (const view of builtinViews) {
      expect(view.title.length).toBeGreaterThan(0)
      expect(view.subtitle.length).toBeGreaterThan(0)
    }
  })
})

describe('decodeViewMode', () => {
  it('accepts the two prototype modes', () => {
    expect(decodeViewMode('list')).toBe('list')
    expect(decodeViewMode('kanban')).toBe('kanban')
  })

  it('falls back to list for anything else', () => {
    expect(decodeViewMode('grid')).toBe('list')
    expect(decodeViewMode(undefined)).toBe('list')
  })

  it('exposes a schema for the mode', () => {
    expect(Schema.decodeUnknownSync(ViewMode)('kanban')).toBe('kanban')
  })
})

describe('decodeViewRef', () => {
  it('decodes a builtin view reference', () => {
    expect(decodeViewRef('all')).toEqual({ _tag: 'Builtin', id: 'all' })
  })

  it('decodes a project view reference', () => {
    expect(decodeViewRef('project:infra/terraform-aws')).toEqual({
      _tag: 'Project',
      path: 'infra/terraform-aws',
    })
  })

  it('decodes a saved view reference', () => {
    expect(decodeViewRef('saved:abc123')).toEqual({ _tag: 'Saved', id: 'abc123' })
  })

  it('falls back to the inbox for unknown references', () => {
    expect(decodeViewRef('nope')).toEqual({ _tag: 'Builtin', id: 'inbox' })
    expect(decodeViewRef(undefined)).toEqual({ _tag: 'Builtin', id: 'inbox' })
    expect(decodeViewRef('project:')).toEqual({ _tag: 'Builtin', id: 'inbox' })
  })
})

describe('viewRefToParam', () => {
  it('round-trips every reference kind', () => {
    const refs = [
      { _tag: 'Builtin', id: 'by-project' },
      { _tag: 'Project', path: 'platform/api-gateway' },
      { _tag: 'Saved', id: 'v1' },
    ] as const
    for (const ref of refs) {
      expect(decodeViewRef(viewRefToParam(ref))).toEqual(ref)
    }
  })
})

describe('projectViewRef', () => {
  it('builds a project reference from a repository path', () => {
    expect(projectViewRef('edge/waf-rules')).toEqual({ _tag: 'Project', path: 'edge/waf-rules' })
  })
})
