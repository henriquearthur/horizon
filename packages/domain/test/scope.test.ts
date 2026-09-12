import { describe, expect, it } from 'vitest'
import { normalizeScopeSelection, selectedProjects, type ProviderProject } from '../src/index.ts'

const project = (id: number, namespace: string): ProviderProject => ({
  id,
  path: `project-${id}`,
  name: `Project ${id}`,
  namespace,
  groupPath: namespace,
  webUrl: `https://gitlab/p/${id}`,
})

describe('Escopo', () => {
  it('normalizes explicit and dynamic group selections', () => {
    expect(
      normalizeScopeSelection({
        groups: ['platform', 'platform', ''],
        projects: [1, 1, 0],
        followGroups: ['platform', 'unknown'],
      }),
    ).toEqual({ groups: ['platform'], projects: [1], followGroups: ['platform'] })
  })

  it('includes projects created below a followed group', () => {
    const selection = normalizeScopeSelection({ groups: ['platform'], followGroups: ['platform'] })
    expect(
      selectedProjects([project(1, 'platform/tools'), project(2, 'other')], selection).map(
        (item) => item.id,
      ),
    ).toEqual([1])
  })
})
