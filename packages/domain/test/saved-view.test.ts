import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { SavedView, SavedViewStandardSchema, savedViewRef } from '../src/index.ts'

describe('SavedView', () => {
  it('decodes a saved View', () => {
    expect(Schema.decodeUnknownSync(SavedView)({ id: 'v1', name: 'Incidentes P1' })).toEqual({
      id: 'v1',
      name: 'Incidentes P1',
    })
  })

  it('preserves existing status filters and accepts the paused status', () => {
    for (const status of ['Backlog', 'Em andamento', 'Pausada', 'Concluído']) {
      expect(
        Schema.decodeUnknownSync(SavedView)({ id: `v-${status}`, name: status, status }),
      ).toMatchObject({ status })
    }
  })

  it('rejects a saved View without a name', () => {
    expect(() => Schema.decodeUnknownSync(SavedView)({ id: 'v1' })).toThrow()
  })

  it('exposes a Standard Schema for storage layers', () => {
    const result = SavedViewStandardSchema['~standard'].validate({
      id: 'v1',
      name: 'Incidentes P1',
    })
    expect(result).not.toBeInstanceOf(Promise)
    expect(result).toMatchObject({ value: { id: 'v1', name: 'Incidentes P1' } })
  })
})

describe('savedViewRef', () => {
  it('points at a saved View', () => {
    expect(savedViewRef('v1')).toEqual({ _tag: 'Saved', id: 'v1' })
  })
})
