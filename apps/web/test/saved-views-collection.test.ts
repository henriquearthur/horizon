import { describe, expect, it } from 'vitest'
import { savedViewCollection } from '~/db/collections'

describe('savedViewCollection', () => {
  it('starts empty, because saved Views are created by the user', async () => {
    await savedViewCollection.preload()
    expect(savedViewCollection.size).toBe(0)
  })

  it('keys saved Views by id', async () => {
    await savedViewCollection.preload()
    savedViewCollection.insert({ id: 'v1', name: 'Incidentes P1' })

    expect(savedViewCollection.get('v1')).toMatchObject({ id: 'v1', name: 'Incidentes P1' })

    savedViewCollection.delete('v1')
    expect(savedViewCollection.size).toBe(0)
  })
})
