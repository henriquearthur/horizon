import { mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { ConnectionStore } from '~/server/connection-store'

describe('ConnectionStore session', () => {
  let directory: string

  beforeEach(async () => {
    process.env.HORIZON_ENCRYPTION_KEY = 'test-key-with-at-least-thirty-two-characters'
    directory = await mkdtemp(join(tmpdir(), 'horizon-session-'))
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('keeps an authenticated browser session across service restarts', async () => {
    const file = join(directory, 'connection.json')
    const store = new ConnectionStore(file)
    await store.saveConnection('https://gitlab.example.com', 'secret', {
      id: 1,
      username: 'henrique',
      name: 'Henrique',
    })

    const session = await store.createSession()
    const restartedStore = new ConnectionStore(file)

    await expect(restartedStore.requireSession(session)).resolves.toBeUndefined()
    await expect(restartedStore.requireSession('invalid')).rejects.toThrow(
      'Sessão inválida ou expirada.',
    )
  })
})
