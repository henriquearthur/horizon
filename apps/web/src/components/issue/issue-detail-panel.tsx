import { useEffect, useState } from 'react'
import type {
  ProviderComment,
  ProviderIssue,
  ProviderUser,
  ProviderWriteContract,
} from '@horizon/domain'
import { PRIORITY_VALUES, readIssueProperties, STATUS_VALUES } from '@horizon/domain'
import { ExternalLink, GitMerge, MessageSquare, Pencil, X } from 'lucide-react'
import { LabelChip, PriorityBadge, StatusDot, UserAvatar } from '~/components/issue/issue-chrome'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Markdown } from '~/components/ui/markdown'
import { MultiSelect } from '~/components/ui/multi-select'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { Textarea } from '~/components/ui/textarea'
import { absoluteTime, relativeTime, visibleLabels } from '~/lib/issue-presentation'
import { cn } from '~/lib/utils'

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
  const shownLabels = visibleLabels(issue.labels)

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
  const save = async () => {
    await mutate(() =>
      provider.updateIssue(issue.projectId, issue.iid, {
        title,
        description,
        assigneeIds,
        labels,
      }),
    )
    setEditing(false)
  }
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
      className="animate-panel-in absolute inset-y-0 right-0 z-50 flex w-[clamp(360px,40vw,520px)] max-w-full flex-col rounded-l-2xl border-l bg-card shadow-panel"
    >
      <header className="flex-none border-b px-5 pt-3.5 pb-4">
        <div className="mb-3 flex items-center gap-2 font-mono text-[10.5px] text-muted-foreground">
          <span className="font-semibold text-primary">#{issue.iid}</span>
          <span className="min-w-0 flex-1 truncate">{issuePath(issue.webUrl)}</span>
          <Button variant="ghost" size="icon-xs" asChild>
            <a href={issue.webUrl} target="_blank" rel="noreferrer" aria-label="Abrir no GitLab">
              <ExternalLink />
            </a>
          </Button>
          <Button variant="ghost" size="icon-xs" onClick={onClose} aria-label="Fechar detalhes">
            <X />
          </Button>
        </div>

        {editing ? (
          <Input
            aria-label="Título"
            className="mb-3 h-9 text-[15px] font-semibold"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        ) : (
          <h2 className="mb-3 text-[17px] leading-[1.3] font-semibold tracking-tight text-pretty text-foreground">
            {issue.title}
          </h2>
        )}

        {shownLabels.length ? (
          <div className="mb-3 flex flex-wrap gap-1.5">
            {shownLabels.map((label) => (
              <LabelChip key={label} label={label} />
            ))}
          </div>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={properties.conflicts.status ? '' : properties.status}
            disabled={busy}
            onValueChange={(value) =>
              void mutate(() =>
                provider.updateIssueProperties(issue.projectId, issue.iid, {
                  status: value as (typeof STATUS_VALUES)[number],
                }),
              )
            }
          >
            <SelectTrigger size="sm" aria-label="Status" className="gap-2 rounded-full">
              <SelectValue placeholder="Corrigir conflito…">
                <StatusDot status={properties.status} />
                <span>{properties.status}</span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {STATUS_VALUES.map((status) => (
                <SelectItem key={status} value={status}>
                  <StatusDot status={status} />
                  {status}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={properties.conflicts.priority ? '' : (properties.priority ?? 'Sem prioridade')}
            disabled={busy}
            onValueChange={(value) =>
              void mutate(() =>
                provider.updateIssueProperties(issue.projectId, issue.iid, {
                  priority: value as (typeof PRIORITY_VALUES)[number],
                }),
              )
            }
          >
            <SelectTrigger size="sm" aria-label="Prioridade" className="gap-2 rounded-full">
              <SelectValue placeholder="Corrigir conflito…">
                <PriorityBadge
                  priority={properties.priority}
                  conflict={properties.conflicts.priority}
                />
                <span className="text-muted-foreground">
                  {properties.priority ?? 'Sem prioridade'}
                </span>
              </SelectValue>
            </SelectTrigger>
            <SelectContent>
              {PRIORITY_VALUES.map((priority) => (
                <SelectItem key={priority} value={priority}>
                  <PriorityBadge priority={priority} />
                  {priority}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex-1" />

          <Button
            size="xs"
            variant={editing ? 'secondary' : 'ghost'}
            onClick={() => setEditing(!editing)}
          >
            <Pencil aria-hidden />
            {editing ? 'Cancelar' : 'Editar'}
          </Button>
          {editing ? (
            <Button size="xs" onClick={() => void save()} disabled={busy}>
              Salvar
            </Button>
          ) : null}
        </div>

        {properties.conflicts.status || properties.conflicts.priority ? (
          <p
            role="alert"
            className="mt-2.5 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-[11.5px] text-destructive"
          >
            Há labels Horizon conflitantes. Escolha um valor para corrigir.
          </p>
        ) : null}
      </header>

      <dl className="grid flex-none grid-cols-2 gap-x-5 gap-y-2 border-b px-5 py-3.5 text-[11.5px]">
        <DetailMeta label="Responsável">
          {issue.assignees.length ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <UserAvatar user={issue.assignees[0]} size="xs" />
              <span className="truncate">
                {issue.assignees.map((user) => user.name).join(', ')}
              </span>
            </span>
          ) : (
            <span className="text-muted-foreground">Não atribuído</span>
          )}
        </DetailMeta>
        <DetailMeta label="Autor">
          {issue.author ? (
            <span className="flex min-w-0 items-center gap-1.5">
              <UserAvatar user={issue.author} size="xs" />
              <span className="truncate">{issue.author.name}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
        </DetailMeta>
        <DetailMeta label="Atualizado">
          <span title={absoluteTime(issue.updatedAt)}>{relativeTime(issue.updatedAt) ?? '—'}</span>
        </DetailMeta>
        <DetailMeta label="Criado">
          <span title={absoluteTime(issue.createdAt)}>{relativeTime(issue.createdAt) ?? '—'}</span>
        </DetailMeta>
        {issue.mergeRequestCount ? (
          <DetailMeta label="Merge requests">
            <span className="flex items-center gap-1.5 text-primary">
              <GitMerge aria-hidden className="size-3" />
              {issue.mergeRequestCount}
            </span>
          </DetailMeta>
        ) : null}
      </dl>

      <div className="min-h-0 flex-1 overflow-auto px-5 pt-4 pb-6">
        <DetailHeading>Descrição</DetailHeading>
        {editing ? (
          <div className="mb-6 space-y-3">
            <Textarea
              aria-label="Descrição"
              className="min-h-36 text-[12.5px] leading-relaxed"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
            <Field label="Responsáveis">
              <MultiSelect
                label="Responsáveis"
                placeholder="Ninguém"
                searchPlaceholder="Buscar pessoa…"
                options={users.map((user) => ({
                  value: String(user.id),
                  label: `${user.name} · @${user.username}`,
                  adornment: <UserAvatar user={user} size="xs" />,
                }))}
                selected={assigneeIds.map(String)}
                onChange={(next) => setAssigneeIds(next.map(Number))}
              />
            </Field>
            <Field label="Labels">
              <MultiSelect
                label="Labels"
                placeholder="Sem labels"
                searchPlaceholder="Buscar label…"
                options={availableLabels.map((label) => ({
                  value: label,
                  label,
                  adornment: <LabelChip label={label} className="max-w-24" />,
                }))}
                selected={visibleLabels(labels)}
                onChange={(next) =>
                  setLabels([...labels.filter((label) => label.startsWith('horizon::')), ...next])
                }
              />
            </Field>
          </div>
        ) : (
          <Markdown className="mb-6 text-[13px] leading-[1.7] text-foreground">
            {issue.description}
          </Markdown>
        )}

        <DetailHeading count={comments.length}>Discussão</DetailHeading>
        {comments.length === 0 ? (
          <p className="py-2 text-[12.5px] text-muted-foreground">Nenhum comentário ainda.</p>
        ) : null}
        {comments.map((c) => (
          <article key={c.id} className="mb-5 flex gap-2.5">
            <UserAvatar user={c.author} size="md" />
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex flex-wrap items-baseline gap-2">
                <span className="text-[12.5px] font-semibold text-foreground">
                  {c.author?.name ?? 'GitLab'}
                </span>
                <time
                  className="font-mono text-[10.5px] text-muted-foreground"
                  dateTime={c.createdAt}
                  title={absoluteTime(c.createdAt)}
                >
                  {relativeTime(c.createdAt) ?? ''}
                </time>
              </div>
              <Markdown className="text-[12.5px] leading-[1.65] text-foreground" empty="">
                {c.body}
              </Markdown>
            </div>
          </article>
        ))}
      </div>

      {error && (
        <p role="alert" className="border-t bg-destructive/10 px-5 py-2.5 text-xs text-destructive">
          {error}
        </p>
      )}

      <form
        className="flex-none border-t bg-card px-5 pt-3 pb-4"
        onSubmit={(e) => {
          e.preventDefault()
          void sendComment()
        }}
      >
        {composerOpen ? (
          <Tabs defaultValue="write">
            <div className="flex items-center justify-between">
              <TabsList>
                <TabsTrigger value="write">Escrever</TabsTrigger>
                <TabsTrigger value="preview">Prévia</TabsTrigger>
              </TabsList>
              <span className="font-mono text-[10px] text-muted-foreground">Markdown</span>
            </div>
            <TabsContent value="write">
              <Textarea
                autoFocus
                aria-label="Novo comentário"
                placeholder="Escreva um comentário… **negrito**, `código`, - listas"
                className="h-[84px] resize-none text-[12.5px] leading-[1.55]"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </TabsContent>
            <TabsContent value="preview">
              <div className="min-h-[84px] rounded-lg border bg-background px-3 py-2 text-[12.5px] leading-[1.6]">
                <Markdown empty="Nada para pré-visualizar.">{comment}</Markdown>
              </div>
            </TabsContent>
            <div className="mt-2 flex justify-end gap-2">
              <Button
                size="xs"
                type="button"
                variant="ghost"
                onClick={() => setComposerOpen(false)}
              >
                Cancelar
              </Button>
              <Button size="xs" type="submit" disabled={busy || !comment.trim()}>
                Comentar
              </Button>
            </div>
          </Tabs>
        ) : (
          <button
            type="button"
            onClick={() => setComposerOpen(true)}
            className="flex h-10 w-full items-center gap-2.5 rounded-xl border border-input bg-background px-3.5 text-left text-[12.5px] text-muted-foreground transition-colors hover:border-ring/60 hover:text-foreground"
          >
            <MessageSquare aria-hidden className="size-3.5" />
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
      <Input
        aria-label="Título"
        required
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Título do issue"
      />
      <Textarea
        aria-label="Descrição"
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Descrição (aceita Markdown)"
        className="min-h-32 text-[12.5px]"
      />
      <Field label="Responsáveis">
        <MultiSelect
          label="Responsáveis do novo issue"
          placeholder="Ninguém"
          searchPlaceholder="Buscar pessoa…"
          options={users.map((user) => ({
            value: String(user.id),
            label: `${user.name} · @${user.username}`,
            adornment: <UserAvatar user={user} size="xs" />,
          }))}
          selected={assigneeIds.map(String)}
          onChange={(next) => setAssigneeIds(next.map(Number))}
        />
      </Field>
      <Field label="Labels">
        <MultiSelect
          label="Labels do novo issue"
          placeholder="Sem labels"
          searchPlaceholder="Buscar label…"
          options={availableLabels.map((label) => ({
            value: label,
            label,
            adornment: <LabelChip label={label} className="max-w-24" />,
          }))}
          selected={[...labels]}
          onChange={(next) => setLabels(next)}
        />
      </Field>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <span className="block text-[11px] font-medium text-muted-foreground">{label}</span>
      {children}
    </div>
  )
}

function DetailMeta({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      <dt className="flex-none text-muted-foreground">{label}</dt>
      <dd className="m-0 min-w-0 flex-1 truncate text-foreground">{children}</dd>
    </div>
  )
}

function DetailHeading({
  children,
  count,
  className,
}: {
  children: React.ReactNode
  count?: number
  className?: string
}) {
  return (
    <div className={cn('mb-3 flex items-center gap-2.5', className)}>
      <h3 className="text-[10px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
        {children}
      </h3>
      <span className="h-px flex-1 bg-border" />
      {count !== undefined && (
        <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">{count}</span>
      )}
    </div>
  )
}
