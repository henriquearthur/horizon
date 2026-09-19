import { describe, expect, it, vi } from 'vitest'
import type { ProviderWriteContract } from '@horizon/domain'
vi.mock('~/server/gitlab', () => ({
  cacheWrittenIssue: vi.fn(),
  cacheCreatedComment: vi.fn(),
  providerSnapshot: vi.fn(),
  writer: vi.fn(),
}))
import { RuntimeService } from '~/server/runtime'
import { cacheWrittenIssue } from '~/server/gitlab'

describe('RuntimeService detail cache', () => {
  it('deduplicates concurrent and repeated comment reads, then refreshes after writing', async () => {
    const issue = { id: 1, projectId: 2, iid: 3 }
    const provider = {
      listComments: vi.fn().mockResolvedValue([]),
      updateIssue: vi.fn().mockResolvedValue(issue),
    } as unknown as ProviderWriteContract
    const runtime = new RuntimeService(undefined, () => provider)
    await Promise.all([runtime.listComments(2, 3), runtime.listComments(2, 3)])
    await runtime.listComments(2, 3)
    expect(provider.listComments).toHaveBeenCalledTimes(1)
    await runtime.updateIssue(2, 3, { title: 'Novo' })
    expect(cacheWrittenIssue).toHaveBeenCalledWith(issue)
    await runtime.listComments(2, 3)
    expect(provider.listComments).toHaveBeenCalledTimes(2)
  })
})
