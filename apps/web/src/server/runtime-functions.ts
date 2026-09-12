import { createServerFn } from '@tanstack/react-start'
import {
  PRIORITY_VALUES,
  STATUS_VALUES,
  type CreateIssueInput,
  type IssuePriority,
  type IssueStatus,
  type UpdateIssueInput,
} from '@horizon/domain'
import { runtime } from './runtime'

const record = (input: unknown): Record<string, unknown> => {
  if (!input || typeof input !== 'object') throw new Error('Dados da ação inválidos.')
  return input as Record<string, unknown>
}
const issueRef = (input: unknown) => {
  const value = record(input)
  if (!Number.isInteger(value.projectId) || !Number.isInteger(value.iid))
    throw new Error('Issue inválido.')
  return { projectId: value.projectId as number, iid: value.iid as number }
}

export const getRuntimeSnapshot = createServerFn({ method: 'GET' })
  .validator((input: unknown): { force: boolean } => ({
    force: Boolean((input as { force?: unknown } | undefined)?.force),
  }))
  .handler(({ data }) => runtime.snapshot(data))

export const getIssue = createServerFn({ method: 'GET' })
  .validator(issueRef)
  .handler(({ data }) => runtime.readIssue(data.projectId, data.iid))

export const getIssueComments = createServerFn({ method: 'GET' })
  .validator(issueRef)
  .handler(({ data }) => runtime.listComments(data.projectId, data.iid))

export const searchRuntimeDiscussions = createServerFn({ method: 'GET' })
  .validator((input): { query: string } => {
    const value = record(input)
    if (typeof value.query !== 'string') throw new Error('Busca inválida.')
    return { query: value.query.trim() }
  })
  .handler(({ data }) => (data.query ? runtime.searchDiscussions(data.query) : []))

export const createRuntimeIssue = createServerFn({ method: 'POST' })
  .validator((input): CreateIssueInput => {
    const value = record(input)
    if (
      !Number.isInteger(value.projectId) ||
      typeof value.title !== 'string' ||
      !value.title.trim()
    )
      throw new Error('Informe o projeto e o título do issue.')
    return {
      projectId: value.projectId as number,
      title: value.title.trim(),
      ...(typeof value.description === 'string' ? { description: value.description } : {}),
      ...(Array.isArray(value.assigneeIds)
        ? { assigneeIds: value.assigneeIds.filter((id): id is number => Number.isInteger(id)) }
        : {}),
      ...(Array.isArray(value.labels)
        ? { labels: value.labels.filter((label): label is string => typeof label === 'string') }
        : {}),
    }
  })
  .handler(({ data }) => runtime.createIssue(data))

export const updateRuntimeIssue = createServerFn({ method: 'POST' })
  .validator((input): { projectId: number; iid: number; changes: UpdateIssueInput } => {
    const value = record(input)
    const ref = issueRef(value)
    const changes = record(value.changes)
    return {
      ...ref,
      changes: {
        ...(typeof changes.title === 'string' ? { title: changes.title } : {}),
        ...(typeof changes.description === 'string' ? { description: changes.description } : {}),
        ...(Array.isArray(changes.assigneeIds)
          ? { assigneeIds: changes.assigneeIds.filter((id): id is number => Number.isInteger(id)) }
          : {}),
        ...(Array.isArray(changes.labels)
          ? { labels: changes.labels.filter((label): label is string => typeof label === 'string') }
          : {}),
      },
    }
  })
  .handler(({ data }) => runtime.updateIssue(data.projectId, data.iid, data.changes))

export const createRuntimeComment = createServerFn({ method: 'POST' })
  .validator((input): { projectId: number; iid: number; body: string } => {
    const value = record(input)
    const ref = issueRef(value)
    if (typeof value.body !== 'string' || !value.body.trim())
      throw new Error('Escreva um comentário.')
    return { ...ref, body: value.body.trim() }
  })
  .handler(({ data }) => runtime.createComment(data.projectId, data.iid, data.body))

export const setRuntimeIssueState = createServerFn({ method: 'POST' })
  .validator((input): { projectId: number; iid: number; state: 'opened' | 'closed' } => {
    const value = record(input)
    const ref = issueRef(value)
    if (value.state !== 'opened' && value.state !== 'closed') throw new Error('Estado inválido.')
    return { ...ref, state: value.state }
  })
  .handler(({ data }) => runtime.setIssueState(data.projectId, data.iid, data.state))

export const updateRuntimeIssueProperties = createServerFn({ method: 'POST' })
  .validator(
    (
      input,
    ): {
      projectId: number
      iid: number
      changes: { status?: IssueStatus; priority?: IssuePriority }
    } => {
      const value = record(input)
      const ref = issueRef(value)
      const changes = record(value.changes)
      if (changes.status !== undefined && !STATUS_VALUES.includes(changes.status as IssueStatus))
        throw new Error('Status inválido.')
      if (
        changes.priority !== undefined &&
        !PRIORITY_VALUES.includes(changes.priority as IssuePriority)
      )
        throw new Error('Prioridade inválida.')
      return {
        ...ref,
        changes: {
          ...(changes.status ? { status: changes.status as IssueStatus } : {}),
          ...(changes.priority ? { priority: changes.priority as IssuePriority } : {}),
        },
      }
    },
  )
  .handler(({ data }) => runtime.updateIssueProperties(data.projectId, data.iid, data.changes))
