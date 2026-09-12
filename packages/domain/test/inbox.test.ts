import { describe, expect, it } from 'vitest'
import { groupIssues, type ProviderIssue } from '../src/index.ts'

const issue = (id: number, labels: readonly string[]): ProviderIssue => ({
  id,
  iid: id,
  projectId: 1,
  title: `Issue ${id}`,
  state: 'opened',
  webUrl: `https://gitlab.example/issues/${id}`,
  assignees: [],
  labels,
})

describe('Inbox grouping', () => {
  it('groups structured Horizon properties including their defaults and conflicts', () => {
    const issues = [
      issue(1, []),
      issue(2, ['horizon::status::Em andamento', 'horizon::priority::P1 urgente']),
      issue(3, ['horizon::status::Backlog', 'horizon::status::Concluído']),
    ]

    expect([...groupIssues(issues, 'status').keys()]).toEqual([
      'Backlog',
      'Em andamento',
      'Conflito',
    ])
    expect([...groupIssues(issues, 'priority').keys()]).toEqual(['Sem prioridade', 'P1 urgente'])
  })
})
