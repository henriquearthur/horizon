import { useEffect, useState } from 'react'
import type {
  ProviderComment,
  ProviderIssue,
  ProviderUser,
  ProviderWriteContract,
} from '@horizon/domain'
import { PRIORITY_VALUES, readIssueProperties, STATUS_VALUES } from '@horizon/domain'
import { initialsOf } from '~/lib/initials'
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
  const [composerOpen, setComposerOpen] = useState(false)
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
      setComposerOpen(false)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível publicar o comentário.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <aside
      aria-label="Detalhes do issue"
      className="absolute inset-y-0 right-0 z-50 flex w-[clamp(340px,38vw,480px)] max-w-full flex-col border-l bg-card shadow-[-14px_0_40px_-10px_#0008]"
    >
      <header className="flex-none border-b px-[18px] py-3">
        <div className="mb-[9px] flex items-center gap-[7px] font-mono text-[10.5px] text-muted-foreground">
          <span className="font-medium text-primary">#{issue.iid}</span>
          <span className="min-w-0 flex-1 truncate">{issuePath(issue.webUrl)}</span>
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
          <h2 className="mb-[11px] text-[16px] leading-[1.32] font-semibold [text-wrap:pretty]">
            {issue.title}
          </h2>
        )}
        <div className="flex flex-wrap gap-1.5">
          {issue.labels
            .filter((label) => !label.startsWith('horizon::'))
            .map((label) => (
              <span
                key={label}
                className="rounded-[5px] bg-accent px-[7px] py-0.5 text-[10px] font-medium text-accent-foreground"
              >
                {label}
              </span>
            ))}
        </div>
        <div className="mt-3 flex items-center gap-1.5">
          <Button size="xs" variant="outline" onClick={() => setEditing(!editing)}>
            {editing ? 'Cancelar' : 'Editar'}
          </Button>
          {editing && (
            <Button size="xs" onClick={save} disabled={busy}>
              Salvar
            </Button>
          )}
          <Button
            size="xs"
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
        <div className="mt-2.5 flex items-center gap-2.5">
          <label className="text-xs font-medium text-foreground">
            <span className="sr-only">Status</span>
            <select
              aria-label="Status"
              className="h-[30px] rounded-lg border bg-background px-[11px] text-xs text-foreground"
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
          <label className="text-[11px] font-medium text-muted-foreground">
            <span className="sr-only">Prioridade</span>
            <select
              aria-label="Prioridade"
              className="h-[30px] rounded-md border border-transparent bg-transparent px-1 font-mono text-[11px] text-muted-foreground"
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
      <div className="grid flex-none grid-cols-2 gap-x-[18px] gap-y-[7px] border-b px-[18px] pt-3 pb-[13px] text-[11.5px]">
        <DetailMeta
          label="Responsável"
          value={issue.assignees.map((user) => user.name).join(', ') || 'Não atribuído'}
        />
        <DetailMeta label="Autor" value={issue.author?.name ?? '—'} />
        <DetailMeta
          label="Atualizado"
          value={issue.updatedAt ? new Date(issue.updatedAt).toLocaleDateString('pt-BR') : '—'}
        />
        <a
          href={issue.webUrl}
          target="_blank"
          rel="noreferrer"
          className="text-primary hover:underline"
        >
          Abrir no GitLab ↗
        </a>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-[18px] pt-4 pb-5">
        <DetailHeading>Descrição</DetailHeading>
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
          <p className="whitespace-pre-wrap text-[13px] leading-[1.68] [text-wrap:pretty]">
            {issue.description || 'Sem descrição.'}
          </p>
        )}
        <div className="mt-5 mb-3.5">
          <DetailHeading count={comments.length}>Discussão</DetailHeading>
        </div>
        {comments.map((c) => (
          <article key={c.id} className="mb-4 flex gap-2.5">
            <span className="flex size-6 flex-none items-center justify-center rounded-full bg-accent text-[9.5px] font-semibold text-accent-foreground">
              {initialsOf(c.author?.name ?? 'GitLab')}
            </span>
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-baseline gap-[7px]">
                <span className="text-[12.5px] font-semibold">{c.author?.name ?? 'GitLab'}</span>
                <time className="font-mono text-[10.5px] text-muted-foreground">
                  {new Date(c.createdAt).toLocaleString('pt-BR')}
                </time>
              </div>
              <p className="whitespace-pre-wrap text-[12.5px] leading-[1.6]">{c.body}</p>
            </div>
          </article>
        ))}
      </div>
      {error && (
        <p role="alert" className="border-t bg-destructive/10 p-3 text-sm text-destructive">
          {error}
        </p>
      )}
      <form
        className="flex-none border-t bg-card px-[18px] pt-2.5 pb-3.5"
        onSubmit={(e) => {
          e.preventDefault()
          void sendComment()
        }}
      >
        {composerOpen ? (
          <>
            <div className="mb-2 flex items-center justify-between text-[11.5px] text-muted-foreground">
              <span className="rounded-md bg-secondary px-2.5 py-1 text-foreground">Escrever</span>
              <span className="font-mono text-[10px]">Markdown</span>
            </div>
            <textarea
              autoFocus
              aria-label="Novo comentário"
              placeholder="Escreva um comentário…"
              className="h-[74px] w-full resize-none rounded-lg border bg-background px-[11px] py-[9px] text-[12.5px] leading-[1.55] outline-none focus-visible:ring-1 focus-visible:ring-ring"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
            />
            <div className="mt-2 flex justify-end gap-2">
              <Button
                size="xs"
                type="button"
                variant="outline"
                onClick={() => setComposerOpen(false)}
              >
                Cancelar
              </Button>
              <Button size="xs" type="submit" disabled={busy || !comment.trim()}>
                Comentar
              </Button>
            </div>
          </>
        ) : (
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="flex h-9 w-full items-center gap-[9px] rounded-lg border bg-background px-3 text-left text-[12.5px] text-muted-foreground hover:border-primary"
          >
            <span className="flex-1">Escrever um comentário…</span>
            <span className="font-mono text-[10px]">Markdown</span>
          </button>
        )}
      </form>
    </aside>
  )
}

export function IssueCreateForm({
  projectId,
  provider,
  users = [],
  availableLabels = [],
  onCreated,
}: {
  projectId: number
  provider: ProviderWriteContract
  users?: readonly ProviderUser[]
  availableLabels?: readonly string[]
  onCreated: (issue: ProviderIssue) => void
}) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [assigneeIds, setAssigneeIds] = useState<readonly number[]>([])
  const [labels, setLabels] = useState<readonly string[]>([])
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
          onCreated(
            await provider.createIssue({
              projectId,
              title: title.trim(),
              description,
              assigneeIds,
              labels,
            }),
          )
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
      <label className="block text-xs font-medium text-muted-foreground">
        Responsáveis
        <select
          multiple
          aria-label="Responsáveis do novo issue"
          className="mt-1 min-h-20 w-full rounded border bg-background p-2 text-sm text-foreground"
          value={assigneeIds.map(String)}
          onChange={(event) =>
            setAssigneeIds([...event.target.selectedOptions].map((option) => Number(option.value)))
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
          aria-label="Labels do novo issue"
          className="mt-1 min-h-20 w-full rounded border bg-background p-2 text-sm text-foreground"
          value={labels}
          onChange={(event) =>
            setLabels([...event.target.selectedOptions].map((option) => option.value))
          }
        >
          {availableLabels.map((label) => (
            <option key={label}>{label}</option>
          ))}
        </select>
      </label>
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

function issuePath(webUrl: string) {
  try {
    return new URL(webUrl).pathname.split('/-/issues/')[0]?.replace(/^\//, '') ?? ''
  } catch {
    return ''
  }
}

function DetailMeta({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-0 items-baseline gap-[7px]">
      <span className="flex-none text-muted-foreground">{label}</span>
      <span className="truncate">{value}</span>
    </div>
  )
}

function DetailHeading({ children, count }: { children: React.ReactNode; count?: number }) {
  return (
    <div className="mb-2.5 flex items-center gap-[9px]">
      <h3 className="text-[10px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
        {children}
      </h3>
      <span className="h-px flex-1 bg-border" />
      {count !== undefined && (
        <span className="font-mono text-[10.5px] text-muted-foreground">{count}</span>
      )}
    </div>
  )
}
