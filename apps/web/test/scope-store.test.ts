import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ScopeStore } from '~/server/scope-store'

describe('ScopeStore', () => {
  let directory: string
  const fileOf = () => join(directory, 'scope.json')

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'horizon-scope-'))
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('keeps the Escopo across restarts and normalizes what it stores', async () => {
    await new ScopeStore(fileOf()).saveScope({
      groups: ['infra', 'infra'],
      projects: [10, 10, -1],
      followGroups: ['infra', 'fora-do-escopo'],
    })

    await expect(new ScopeStore(fileOf()).getScope()).resolves.toEqual({
      groups: ['infra'],
      projects: [10],
      followGroups: ['infra'],
    })
  })

  it('reports an empty Escopo when nothing was saved yet', async () => {
    const store = new ScopeStore(fileOf())

    await expect(store.isEmpty()).resolves.toBe(true)
    await expect(store.getScope()).resolves.toEqual({
      groups: [],
      projects: [],
      followGroups: [],
    })
  })

  it('survives a corrupt file instead of breaking the whole app', async () => {
    await writeFile(fileOf(), 'não é json')

    await expect(new ScopeStore(fileOf()).isEmpty()).resolves.toBe(true)
  })
})
