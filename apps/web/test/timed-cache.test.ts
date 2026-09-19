import { describe, expect, it, vi } from 'vitest'
import { TimedCache } from '~/server/timed-cache'

describe('TimedCache', () => {
  it('serves the cached value and collapses concurrent readers into one load', async () => {
    const load = vi.fn(async () => 'valor')
    const cache = new TimedCache(60_000, load)

    await expect(Promise.all([cache.get(), cache.get(), cache.get()])).resolves.toEqual([
      'valor',
      'valor',
      'valor',
    ])
    await cache.get()

    expect(load).toHaveBeenCalledTimes(1)
  })

  it('reloads when forced and when the value goes stale', async () => {
    let count = 0
    const cache = new TimedCache(0, async () => ++count)

    await expect(cache.get()).resolves.toBe(1)
    await expect(cache.get()).resolves.toBe(2)
  })

  it('keeps the last good value when a refresh fails', async () => {
    let attempt = 0
    const cache = new TimedCache(0, async () => {
      attempt += 1
      if (attempt > 1) throw new Error('GitLab respondeu 429.')
      return 'bom'
    })

    await expect(cache.get()).resolves.toBe('bom')
    await expect(cache.get()).resolves.toBe('bom')
  })

  it('propagates the failure when there is nothing cached yet', async () => {
    const cache = new TimedCache(60_000, () => Promise.reject(new Error('sem conexão')))

    await expect(cache.get()).rejects.toThrow('sem conexão')
  })
})

it('patches a confirmed write without reloading or accepting an older in-flight result', async () => {
  let resolve!: (value: string[]) => void
  const load = vi
    .fn<() => Promise<string[]>>()
    .mockResolvedValueOnce(['old'])
    .mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done
        }),
    )
  const cache = new TimedCache(60_000, load)
  await cache.get()
  const refreshing = cache.get({ force: true })
  cache.update(() => ['confirmed'])
  resolve(['old'])
  expect(await refreshing).toEqual(['confirmed'])
  expect(await cache.get()).toEqual(['confirmed'])
  expect(load).toHaveBeenCalledTimes(2)
})
