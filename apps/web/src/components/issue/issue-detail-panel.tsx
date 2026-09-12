import { useEffect, useState } from 'react'
import type {
  ProviderComment,
  ProviderIssue,
  ProviderUser,
  ProviderWriteContract,
} from '@horizon/domain'
import { PRIORITY_VALUES, readIssueProperties, STATUS_VALUES } from '@horizon/domain'
import { Button } from '~/components/ui/button'

export function IssueDetailPanel({
  issue,
  comments,
  provider,
  onClose,
  onUpdated,
  onCommentCreated,
  users = [],
  availableLabels = [],
}: {
  issue: ProviderIssue
  comments: readonly ProviderComment[]
  provider: ProviderWriteContract
  onClose: () => void
  onUpdated: (issue: ProviderIssue) => void
  onCommentCreated?: (comment: ProviderComment) => void
  users?: readonly ProviderUser[]
  availableLabels?: readonly string[]
}) {
  const [editing, setEditing] = useState(false)
  const [title, setTitle] = useState(issue.title)
  const [description, setDescription] = useState(issue.description ?? '')
  const [comment, setComment] = useState('')
  const [assigneeIds, setAssigneeIds] = useState<readonly number[]>(
    issue.assignees.map((u) => u.id),
  )
  const [labels, setLabels] = useState<readonly string[]>(issue.labels)
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const properties = readIssueProperties(issue)
  useEffect(() => {
    setTitle(issue.title)
    setDescription(issue.description ?? '')
    setAssigneeIds(issue.assignees.map((user) => user.id))
    setLabels(issue.labels)
  }, [issue])
  const mutate = async (action: () => Promise<ProviderIssue>) => {
    setBusy(true)
    setError(undefined)
    try {
      onUpdated(await action())
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível concluir a ação.')
    } finally {
      setBusy(false)
    }
  }
  const save = () =>
    mutate(() =>
      provider.updateIssue(issue.projectId, issue.iid, {
        title,
        description,
        assigneeIds,
        labels,
      }),
    )
  const sendComment = async () => {
    if (!comment.trim()) return
    setBusy(true)
    setError(undefined)
    try {
      const created = await provider.createComment(issue.projectId, issue.iid, comment.trim())
      onCommentCreated?.(created)
      setComment('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível publicar o comentário.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <aside
      aria-label="Detalhes do issue"
      className="absolute inset-y-0 right-0 z-20 flex w-[min(38vw,30rem)] min-w-[21rem] flex-col border-l bg-card shadow-xl"
    >
      <header className="border-b p-4">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>#{issue.iid}</span>
          <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Fechar detalhes">
            ×
          </Button>
        </div>
        {editing ? (
          <input
            aria-label="Título"
            className="mt-3 w-full rounded border bg-background p-2 text-lg font-semibold"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        ) : (
          <h2 className="mt-3 text-lg font-semibold">{issue.title}</h2>
        )}
        <div className="mt-3 flex gap-2">
          <Button size="sm" variant="outline" onClick={() => setEditing(!editing)}>
            {editing ? 'Cancelar' : 'Editar'}
          </Button>
          {editing && (
            <Button size="sm" onClick={save} disabled={busy}>
              Salvar
            </Button>
          )}
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              mutate(() =>
                provider.setIssueState(
                  issue.projectId,
                  issue.iid,
                  issue.state === 'closed' ? 'opened' : 'closed',
                ),
              )
            }
            disabled={busy}
          >
            {issue.state === 'closed' ? 'Reabrir' : 'Fechar'}
          </Button>
        </div>
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label className="text-[10px] font-medium uppercase text-muted-foreground">
            Status
            <select
              aria-label="Status"
              className="mt-1 h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground"
              value={properties.conflicts.status ? '' : properties.status}
              onChange={(event) =>
                void mutate(() =>
                  provider.updateIssueProperties(issue.projectId, issue.iid, {
                    status: event.target.value as (typeof STATUS_VALUES)[number],
                  }),
                )
              }
              disabled={busy}
            >
              {properties.conflicts.status ? <option value="">Corrigir conflito…</option> : null}
              {STATUS_VALUES.map((status) => (
                <option key={status}>{status}</option>
              ))}
            </select>
          </label>
          <label className="text-[10px] font-medium uppercase text-muted-foreground">
            Prioridade
            <select
              aria-label="Prioridade"
              className="mt-1 h-8 w-full rounded-md border bg-background px-2 text-xs text-foreground"
              value={properties.conflicts.priority ? '' : (properties.priority ?? 'Sem prioridade')}
              onChange={(event) =>
                void mutate(() =>
                  provider.updateIssueProperties(issue.projectId, issue.iid, {
                    priority: event.target.value as (typeof PRIORITY_VALUES)[number],
                  }),
                )
              }
              disabled={busy}
            >
              {properties.conflicts.priority ? <option value="">Corrigir conflito…</option> : null}
              {PRIORITY_VALUES.map((priority) => (
                <option key={priority}>{priority}</option>
              ))}
            </select>
          </label>
        </div>
        {properties.conflicts.status || properties.conflicts.priority ? (
          <p role="alert" className="mt-2 text-xs text-destructive">
            Há labels Horizon conflitantes. Escolha um valor para corrigir.
          </p>
        ) : null}
      </header>
      <div className="flex-1 overflow-auto p-4">
        {editing ? (
          <div className="mb-5 space-y-3">
            <textarea
              aria-label="Descrição"
              className="min-h-32 w-full rounded border bg-background p-2"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <label className="block text-xs font-medium text-muted-foreground">
              Responsáveis
              <select
                multiple
                aria-label="Responsáveis"
                className="mt-1 min-h-20 w-full rounded border bg-background p-2 text-sm text-foreground"
                value={assigneeIds.map(String)}
                onChange={(event) =>
                  setAssigneeIds(
                    [...event.target.selectedOptions].map((option) => Number(option.value)),
                  )
                }
              >
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name} · @{user.username}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-xs font-medium text-muted-foreground">
              Labels
              <select
                multiple
                aria-label="Labels"
                className="mt-1 min-h-20 w-full rounded border bg-background p-2 text-sm text-foreground"
                value={labels}
                onChange={(event) => {
                  const horizonLabels = labels.filter((label) => label.startsWith('horizon::'))
                  setLabels([
                    ...horizonLabels,
                    ...[...event.target.selectedOptions].map((option) => option.value),
                  ])
                }}
              >
                {availableLabels.map((label) => (
                  <option key={label}>{label}</option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <p className="mb-5 whitespace-pre-wrap text-sm">
            {issue.description || 'Sem descrição.'}
          </p>
        )}
        <h3 className="mb-3 text-xs font-semibold uppercase text-muted-foreground">
          Discussão ({comments.length})
        </h3>
        {comments.map((c) => (
          <article key={c.id} className="mb-4">
            <div className="text-xs font-medium">
              {c.author?.name ?? 'GitLab'}{' '}
              <time className="ml-2 text-muted-foreground">
                {new Date(c.createdAt).toLocaleString('pt-BR')}
              </time>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm">{c.body}</p>
          </article>
        ))}
      </div>
      {error && (
        <p role="alert" className="border-t bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <form
        className="border-t p-3"
        onSubmit={(e) => {
          e.preventDefault()
          void sendComment()
        }}
      >
        <textarea
          aria-label="Novo comentário"
          placeholder="Escreva um comentário…"
          className="w-full rounded border bg-background p-2 text-sm"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
        />
        <Button className="mt-2" size="sm" type="submit" disabled={busy || !comment.trim()}>
          Comentar
        </Button>
      </form>
    </aside>
  )
}

export function IssueCreateForm({
  projectId,
  provider,
  users = [],
  onCreated,
}: {
  projectId: number
  provider: ProviderWriteContract
  users?: readonly ProviderUser[]
  onCreated: (issue: ProviderIssue) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault()
        setBusy(true)
        setError(undefined)
        try {
          onCreated(await provider.createIssue({ projectId, title: title.trim(), description }))
        } catch (x) {
          setError(x instanceof Error ? x.message : 'Não foi possível criar o issue.')
        } finally {
          setBusy(false)
        }
      }}
    >
      <input
        aria-label="Título"
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Título do issue"
        className="w-full rounded border bg-background p-2"
      />
      <textarea
        aria-label="Descrição"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Descrição"
        className="min-h-32 w-full rounded border bg-background p-2"
      />
      {users.length > 0 && (
        <p className="text-xs text-muted-foreground">{users.length} responsáveis disponíveis</p>
      )}
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <Button type="submit" disabled={busy || !title.trim()}>
        Criar issue
      </Button>
    </form>
  )
}
