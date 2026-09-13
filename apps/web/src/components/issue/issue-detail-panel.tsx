import { useEffect, useMemo, useState } from 'react'
import type {
  BlockingReference,
  Initiative,
  ProviderComment,
  ProviderIssue,
  ProviderMergeRequest,
  ProviderProject,
  ProviderUser,
  ProviderWriteContract,
} from '@horizon/domain'
import {
  PRIORITY_VALUES,
  STATUS_VALUES,
  blockedBy,
  blocks,
  initiativeIdsFromLabels,
  initiativeLabel,
  isHorizonLabel,
  readIssueProperties,
  withBlockingLink,
  withoutBlockingLink,
} from '@horizon/domain'
import {
  ChevronDown,
  CornerLeftUp,
  ExternalLink,
  FolderKanban,
  FolderGit2,
  GitMerge,
  Info,
  ListTree,
  LoaderCircle,
  MessageSquare,
  OctagonX,
  Pencil,
  Plus,
  Search,
  UserPlus,
  X,
} from 'lucide-react'
import {
  AssigneeStack,
  LabelChip,
  TypeMark,
  PriorityBadge,
  StatusDot,
  UserAvatar,
} from '~/components/issue/issue-chrome'
import { Button } from '~/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { Input } from '~/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
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
import {
  absoluteTime,
  byAge,
  relativeTime,
  visibleLabels,
  issueTypes,
  projectPath,
} from '~/lib/issue-presentation'
import { useProjectMetadata } from '~/runtime/use-project-metadata'
import { cn } from '~/lib/utils'

export function IssueDetailPanel({
  issue,
  comments,
  provider,
  onClose,
  onUpdated,
  onCommentCreated,
  loading = false,
  currentUser,
  users = [],
  availableLabels = [],
  issueHref,
  onIssueSelect,
  subIssues = [],
  parent,
  onOpenIssue,
  allIssues = [],
  projects = [],
  initiatives = [],
}: {
  issue: ProviderIssue
  comments: readonly ProviderComment[]
  provider: ProviderWriteContract
  onClose: () => void
  onUpdated?: (issue: ProviderIssue) => void
  onCommentCreated?: (comment: ProviderComment) => void
  /** Child items of this Issue, as the Provider links them. */
  subIssues?: readonly ProviderIssue[]
  /** The Issue this one hangs under, when the Provider links it to a parent. */
  parent?: ProviderIssue | undefined
  onOpenIssue?: (issue: ProviderIssue) => void
  /** Every Issue of the Escopo, so blocking links can point anywhere. */
  allIssues?: readonly ProviderIssue[]
  /** The projects of the Escopo, so a linked Issue can name its repository. */
  projects?: readonly ProviderProject[]
  initiatives?: readonly Initiative[]
  loading?: boolean
  currentUser?: ProviderUser
  users?: readonly ProviderUser[]
  availableLabels?: readonly string[]
  issueHref: (iid: number) => string
  /** Opens a `#123` reference from the text without reloading the page. */
  onIssueSelect?: ((iid: number) => void) | undefined
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
  const [mergeRequests, setMergeRequests] = useState<readonly ProviderMergeRequest[]>([])
  const [busy, setBusy] = useState(false)
  const properties = readIssueProperties(issue)
  const shownLabels = visibleLabels(issue.labels)
  const types = issueTypes(issue.labels)
  const initiativeId = initiativeIdsFromLabels(issue.labels)[0]
  const blocking = useMemo(() => blocks(issue, allIssues), [issue, allIssues])
  const blockedByReferences = useMemo(() => blockedBy(issue, allIssues), [issue, allIssues])
  // Members and labels of the project are only needed while editing, so they
  // are read on demand instead of travelling in every snapshot.
  const metadata = useProjectMetadata(editing ? issue.projectId : undefined)
  const people = metadata.users.length ? metadata.users : users
  const labelOptions = useMemo(
    () =>
      metadata.labels.length
        ? metadata.labels.filter((label) => !isHorizonLabel(label))
        : availableLabels,
    [metadata.labels, availableLabels],
  )
  const discussion = comments.filter((item) => !item.system)
  const activity = comments.filter((item) => item.system)

  useEffect(() => {
    let active = true
    setMergeRequests([])
    void provider
      .listMergeRequests?.(issue.projectId, issue.iid)
      .then((items) => {
        if (active) setMergeRequests(items)
      })
      .catch(() => {
        if (active) setMergeRequests([])
      })
    setTitle(issue.title)
    setDescription(issue.description ?? '')
    setAssigneeIds(issue.assignees.map((user) => user.id))
    setLabels(issue.labels)
    return () => {
      active = false
    }
  }, [issue, provider])

  const mutate = async (action: () => Promise<ProviderIssue>) => {
    setBusy(true)
    setError(undefined)
    try {
      // The write has to happen even with no listener: `onUpdated?.(await …)`
      // short-circuits the whole call, arguments included, when nobody listens.
      const updated = await action()
      onUpdated?.(updated)
      return true
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Não foi possível concluir a ação.')
      return false
    } finally {
      setBusy(false)
    }
  }
  const save = async () => {
    const saved = await mutate(() =>
      provider.updateIssue(issue.projectId, issue.iid, {
        title,
        description,
        assigneeIds,
        labels,
      }),
    )
    if (saved) setEditing(false)
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

  const setInitiative = (value: string) =>
    mutate(() =>
      provider.updateIssue(issue.projectId, issue.iid, {
        labels: [
          ...issue.labels.filter((label) => !label.startsWith('horizon::initiative::')),
          ...(value === 'none' ? [] : [initiativeLabel(value)]),
        ],
      }),
    )

  const assignToMe = () => {
    if (!currentUser || assigneeIds.includes(currentUser.id)) return
    const next = [...assigneeIds, currentUser.id]
    void mutate(() => provider.updateIssue(issue.projectId, issue.iid, { assigneeIds: next })).then(
      (saved) => {
        if (saved) setAssigneeIds(next)
      },
    )
  }

  return (
    <>
      <button
        type="button"
        aria-label="Fechar detalhes"
        className="fixed inset-0 z-40 cursor-default bg-foreground/8 backdrop-blur-[1px]"
        onClick={onClose}
      />
      <aside
        aria-label="Detalhes do issue"
        aria-busy={loading || busy}
        className="animate-panel-in fixed inset-y-0 right-0 z-50 flex w-[clamp(360px,40vw,520px)] max-w-full flex-col rounded-l-2xl border-l bg-card shadow-panel"
      >
        {(loading || busy) && (
          <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center rounded-l-2xl bg-card/45">
            <LoaderCircle className="size-5 animate-spin text-primary" aria-label="Carregando" />
          </div>
        )}
        <header className="flex-none border-b px-5 pt-3 pb-3">
          {/*
           * One identity line: what kind of item it is, where it lives and the
           * ways out of the panel. Everything that used to be a separate block
           * — labels, the meta grid, the actions — is folded into the single
           * control row below the title.
           */}
          <div className="mb-2 flex items-center gap-1.5 font-mono text-[10.5px] text-muted-foreground">
            <TypeMark types={types} />
            <span className="flex-none font-semibold text-primary">#{issue.iid}</span>
            <span className="min-w-0 max-w-[14rem] truncate">{issuePath(issue.webUrl)}</span>
            {issue.parentIid !== undefined ? (
              <ParentReference
                parentIid={issue.parentIid}
                parent={parent}
                webUrl={issue.webUrl}
                {...(onOpenIssue ? { onOpenIssue } : {})}
              />
            ) : null}
            <span className="flex-1" />
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
              className="h-9 text-[15px] font-semibold"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          ) : (
            <h2 className="text-[16px] leading-[1.3] font-semibold tracking-tight text-pretty text-foreground">
              {issue.title}
            </h2>
          )}

          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={busy}
                  aria-label={`Alterar status: ${properties.status}`}
                  className={CONTROL_CLASS}
                >
                  <StatusDot
                    status={properties.status}
                    conflict={properties.conflicts.status}
                    className="size-3"
                  />
                  {properties.status}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[10rem]">
                {STATUS_VALUES.map((option) => (
                  <DropdownMenuItem
                    key={option}
                    disabled={option === properties.status && !properties.conflicts.status}
                    onSelect={() =>
                      void mutate(() =>
                        provider.updateIssueProperties(issue.projectId, issue.iid, {
                          status: option,
                        }),
                      )
                    }
                  >
                    <StatusDot status={option} />
                    {option}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={busy}
                  aria-label="Prioridade"
                  className={CONTROL_CLASS}
                >
                  <PriorityBadge
                    priority={properties.priority ?? 'Sem prioridade'}
                    conflict={properties.conflicts.priority}
                  />
                  {properties.conflicts.priority
                    ? 'Corrigir conflito'
                    : (properties.priority ?? 'Sem prioridade')}
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[10rem]">
                {PRIORITY_VALUES.map((priority) => (
                  <DropdownMenuItem
                    key={priority}
                    disabled={priority === properties.priority && !properties.conflicts.priority}
                    onSelect={() =>
                      void mutate(() =>
                        provider.updateIssueProperties(issue.projectId, issue.iid, { priority }),
                      )
                    }
                  >
                    <PriorityBadge priority={priority} />
                    {priority}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  disabled={busy}
                  aria-label="Projeto"
                  className={CONTROL_CLASS}
                >
                  <FolderKanban aria-hidden className="size-3.5 text-muted-foreground" />
                  <span className="max-w-[9rem] truncate">
                    {initiativeId
                      ? (initiatives.find((item) => item.id === initiativeId)?.name ?? initiativeId)
                      : 'Sem projeto'}
                  </span>
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="start" className="min-w-[11rem]">
                <DropdownMenuItem
                  disabled={!initiativeId}
                  onSelect={() => void setInitiative('none')}
                >
                  Sem projeto
                </DropdownMenuItem>
                {initiatives.map((initiative) => (
                  <DropdownMenuItem
                    key={initiative.id}
                    disabled={initiative.id === initiativeId}
                    onSelect={() => void setInitiative(initiative.id)}
                  >
                    {initiative.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>

            <AssigneeControl
              issue={issue}
              busy={busy}
              {...(currentUser ? { currentUser } : {})}
              onAssignToMe={assignToMe}
            />

            {shownLabels.length ? <LabelSummary labels={shownLabels} /> : null}

            <span className="flex-1" />

            <IssueFacts issue={issue} />

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

        <div className="min-h-0 flex-1 overflow-auto px-5 pt-4 pb-6">
          {subIssues.length ? (
            <CollapsibleSection title="Sub-issues" count={subIssues.length}>
              <SubIssueList issues={subIssues} onOpenIssue={onOpenIssue} />
            </CollapsibleSection>
          ) : null}

          <CollapsibleSection
            title="Bloqueios"
            count={blocking.length + blockedByReferences.length}
          >
            <BlockingSection
              issue={issue}
              blocking={blocking}
              blockedByReferences={blockedByReferences}
              candidates={allIssues}
              projects={projects}
              disabled={busy}
              onLink={(target) =>
                void mutate(() =>
                  provider.updateIssue(issue.projectId, issue.iid, {
                    labels: withBlockingLink(issue, target),
                  }),
                )
              }
              onLinkReverse={(source) =>
                void mutate(() =>
                  provider.updateIssue(source.projectId, source.iid, {
                    labels: withBlockingLink(source, issue),
                  }),
                )
              }
              onUnlink={(reference) =>
                void mutate(() =>
                  provider.updateIssue(reference.carrier.projectId, reference.carrier.iid, {
                    labels: withoutBlockingLink(reference),
                  }),
                )
              }
              {...(onOpenIssue ? { onOpenIssue } : {})}
            />
          </CollapsibleSection>

          {mergeRequests.length ? (
            <CollapsibleSection title="Merge requests" count={mergeRequests.length}>
              <MergeRequestList mergeRequests={mergeRequests} />
            </CollapsibleSection>
          ) : null}

          <CollapsibleSection title="Descrição">
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
                    options={people.map((user) => ({
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
                    options={labelOptions.map((label) => ({
                      value: label,
                      label,
                      adornment: <LabelChip label={label} className="max-w-24" />,
                    }))}
                    selected={visibleLabels(labels)}
                    onChange={(next) => setLabels([...labels.filter(isHorizonLabel), ...next])}
                  />
                </Field>
              </div>
            ) : (
              <Markdown
                className="text-[13px] leading-[1.7] text-foreground"
                issueHref={issueHref}
                onIssueSelect={onIssueSelect}
              >
                {issue.description}
              </Markdown>
            )}
          </CollapsibleSection>

          <Tabs defaultValue="discussion" className="mt-6">
            <TabsList className="mb-4">
              <TabsTrigger value="discussion">Discussão ({discussion.length})</TabsTrigger>
              <TabsTrigger value="activity">Atividade ({activity.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="discussion">
              <CollapsibleSection title="Comentários" count={discussion.length} className="mb-0">
                <CommentList
                  comments={discussion}
                  empty="Nenhum comentário ainda."
                  issueHref={issueHref}
                  onIssueSelect={onIssueSelect}
                />
              </CollapsibleSection>
            </TabsContent>
            <TabsContent value="activity">
              <CollapsibleSection title="Histórico" count={activity.length} className="mb-0">
                <CommentList
                  comments={activity}
                  empty="Nenhuma atividade registrada."
                  activity
                  issueHref={issueHref}
                  onIssueSelect={onIssueSelect}
                />
              </CollapsibleSection>
            </TabsContent>
          </Tabs>
          {/* comments are rendered in their respective tabs above */}
          {false &&
            comments.map((c) => (
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
          <p
            role="alert"
            className="border-t bg-destructive/10 px-5 py-2.5 text-xs text-destructive"
          >
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
    </>
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
  const metadata = useProjectMetadata(projectId)
  const people = metadata.users.length ? metadata.users : users
  const labelOptions = metadata.labels.length
    ? metadata.labels.filter((label) => !isHorizonLabel(label))
    : availableLabels
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
          options={people.map((user) => ({
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
          options={labelOptions.map((label) => ({
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

/**
 * Every control in the Detail header wears the same quiet pill, so Status,
 * Prioridade, Projeto and Responsáveis read as one row of affordances instead
 * of four different widgets.
 */
const CONTROL_CLASS =
  'inline-flex h-7 items-center gap-1.5 rounded-lg border border-input bg-background px-2 text-[12px] text-foreground transition-colors hover:bg-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50'

/** Responsáveis: the faces, and the one action most people want on them. */
function AssigneeControl({
  issue,
  busy,
  currentUser,
  onAssignToMe,
}: {
  issue: ProviderIssue
  busy: boolean
  currentUser?: ProviderUser
  onAssignToMe: () => void
}) {
  const mine = currentUser && issue.assignees.some((user) => user.id === currentUser.id)
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" aria-label="Responsáveis" className={cn(CONTROL_CLASS, 'px-1.5')}>
          <AssigneeStack users={issue.assignees} size="xs" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-2">
        <p className="mb-1.5 px-1 text-[10px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
          Responsáveis
        </p>
        {issue.assignees.length ? (
          <ul className="mb-1 space-y-0.5">
            {issue.assignees.map((user) => (
              <li key={user.id} className="flex items-center gap-2 px-1 py-1 text-xs">
                <UserAvatar user={user} size="xs" />
                <span className="min-w-0 truncate">{user.name}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-1 px-1 py-1 text-xs text-muted-foreground">Não atribuído</p>
        )}
        {currentUser && !mine ? (
          <button
            type="button"
            disabled={busy}
            onClick={onAssignToMe}
            className="flex w-full items-center gap-1.5 rounded-md px-1 py-1.5 text-xs text-primary transition-colors hover:bg-hover disabled:opacity-50"
          >
            <UserPlus aria-hidden className="size-3.5" />
            Atribuir a mim
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}

/** Labels, two of them at most; the rest wait behind a counter. */
function LabelSummary({ labels }: { labels: readonly string[] }) {
  const shown = labels.slice(0, 2)
  const rest = labels.slice(2)
  return (
    <span className="inline-flex items-center gap-1.5">
      {shown.map((label) => (
        <LabelChip key={label} label={label} className="max-w-[7rem]" />
      ))}
      {rest.length ? (
        <Popover>
          <PopoverTrigger asChild>
            <button
              type="button"
              aria-label={`Mais ${rest.length} labels`}
              className="inline-flex h-[18px] items-center rounded-full bg-muted px-2 text-[10px] font-medium text-muted-foreground transition-colors hover:bg-hover"
            >
              +{rest.length}
            </button>
          </PopoverTrigger>
          <PopoverContent align="start" className="flex w-56 flex-wrap gap-1.5 p-2">
            {rest.map((label) => (
              <LabelChip key={label} label={label} />
            ))}
          </PopoverContent>
        </Popover>
      ) : null}
    </span>
  )
}

/** Autor and the two dates: true, useful, and almost never urgent. */
function IssueFacts({ issue }: { issue: ProviderIssue }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button size="icon-xs" variant="ghost" aria-label="Mais informações">
          <Info />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 p-2.5 text-[11.5px]">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5">
          <dt className="text-muted-foreground">Autor</dt>
          <dd className="m-0 flex min-w-0 items-center gap-1.5">
            {issue.author ? (
              <>
                <UserAvatar user={issue.author} size="xs" />
                <span className="truncate">{issue.author.name}</span>
              </>
            ) : (
              <span className="text-muted-foreground">—</span>
            )}
          </dd>
          <dt className="text-muted-foreground">Criado</dt>
          <dd className="m-0 truncate">{absoluteTime(issue.createdAt) ?? '—'}</dd>
          <dt className="text-muted-foreground">Atualizado</dt>
          <dd className="m-0 truncate" title={absoluteTime(issue.updatedAt)}>
            {relativeTime(issue.updatedAt) ?? '—'}
          </dd>
        </dl>
      </PopoverContent>
    </Popover>
  )
}

/**
 * The Issue this one hangs under. The list and the Kanban already say it; the
 * Detail says it too, right above the title, and takes the reader there.
 */
function ParentReference({
  parentIid,
  parent,
  webUrl,
  onOpenIssue,
}: {
  parentIid: number
  parent?: ProviderIssue | undefined
  webUrl: string
  onOpenIssue?: ((issue: ProviderIssue) => void) | undefined
}) {
  const properties = parent ? readIssueProperties(parent) : undefined
  const body = (
    <>
      <CornerLeftUp aria-hidden className="size-3 flex-none text-muted-foreground" />
      {properties ? (
        <StatusDot status={properties.status} conflict={properties.conflicts.status} />
      ) : null}
      <span className="flex-none">#{parentIid}</span>
      <span className="min-w-0 truncate">{parent?.title ?? 'Issue pai'}</span>
    </>
  )
  const className =
    'flex min-w-0 max-w-[12rem] items-center gap-1 rounded-md px-1 py-0.5 text-left text-muted-foreground transition-colors hover:bg-hover hover:text-foreground'

  // Without the parent in the Escopo there is nothing to open in place, so the
  // reference falls back to the Provider.
  if (!parent || !onOpenIssue)
    return (
      <a
        href={webUrl.replace(/\/issues\/\d+(?:$|[?#])/, `/issues/${parentIid}`)}
        target="_blank"
        rel="noreferrer"
        aria-label={`Abrir a issue pai #${parentIid}: ${parent?.title ?? ''}`.trim()}
        title={`Abrir a issue pai #${parentIid}`}
        className={className}
      >
        {body}
      </a>
    )
  return (
    <button
      type="button"
      onClick={() => onOpenIssue(parent)}
      aria-label={`Abrir a issue pai #${parentIid}: ${parent?.title ?? ''}`.trim()}
      title={`Abrir a issue pai #${parentIid}`}
      className={className}
    >
      {body}
    </button>
  )
}

/**
 * Blocking links. GitLab CE has no native `blocks/is blocked by`, so Horizon
 * writes the link as a label on the blocking Issue and reads both directions
 * back out of the Escopo.
 */
function BlockingSection({
  issue,
  blocking,
  blockedByReferences,
  candidates,
  projects,
  disabled,
  onLink,
  onLinkReverse,
  onUnlink,
  onOpenIssue,
}: {
  issue: ProviderIssue
  blocking: readonly BlockingReference[]
  blockedByReferences: readonly BlockingReference[]
  candidates: readonly ProviderIssue[]
  projects: readonly ProviderProject[]
  disabled: boolean
  onLink: (target: ProviderIssue) => void
  onLinkReverse: (source: ProviderIssue) => void
  onUnlink: (reference: BlockingReference) => void
  onOpenIssue?: ((issue: ProviderIssue) => void) | undefined
}) {
  const [direction, setDirection] = useState<'blocks' | 'blocked-by'>('blocks')
  const linked = new Set([
    ...blocking.map((reference) => reference.target),
    ...blockedByReferences.map((reference) => reference.source),
  ])
  const selectable = candidates.filter(
    (candidate) =>
      candidate.id !== issue.id && !linked.has(`${candidate.projectId}:${candidate.iid}`),
  )

  const row = (reference: BlockingReference, other: ProviderIssue | undefined, key: string) => (
    <li key={reference.label} className="flex items-center gap-2 px-2.5 py-1.5">
      {other ? (
        <StatusDot
          status={readIssueProperties(other).status}
          conflict={readIssueProperties(other).conflicts.status}
        />
      ) : (
        <OctagonX aria-hidden className="size-3.5 flex-none text-muted-foreground" />
      )}
      <button
        type="button"
        disabled={!other || !onOpenIssue}
        onClick={() => other && onOpenIssue?.(other)}
        className="min-w-0 flex-1 truncate text-left text-[12.5px] text-foreground disabled:cursor-default"
      >
        {other?.title ?? `Issue ${key} fora do Escopo`}
      </button>
      <span className="flex-none font-mono text-[10.5px] text-muted-foreground">
        {other ? repositoryOf(other, projects) : key.split(':')[0]}
        <span className="ml-1.5 opacity-70">#{other?.iid ?? key.split(':')[1]}</span>
      </span>
      <Button
        size="icon-xs"
        variant="ghost"
        disabled={disabled}
        aria-label="Remover bloqueio"
        className="text-muted-foreground hover:text-destructive"
        onClick={() => onUnlink(reference)}
      >
        <X />
      </Button>
    </li>
  )

  return (
    <div className="space-y-3">
      {blocking.length ? (
        <div>
          <p className="mb-1 text-[11px] text-muted-foreground">Bloqueia</p>
          <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border">
            {blocking.map((reference) => row(reference, reference.targetIssue, reference.target))}
          </ul>
        </div>
      ) : null}
      {blockedByReferences.length ? (
        <div>
          <p className="mb-1 text-[11px] text-muted-foreground">É bloqueada por</p>
          <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border">
            {blockedByReferences.map((reference) =>
              row(reference, reference.sourceIssue, reference.source),
            )}
          </ul>
        </div>
      ) : null}
      {!blocking.length && !blockedByReferences.length ? (
        <p className="text-[12.5px] text-muted-foreground">Nenhum bloqueio registrado.</p>
      ) : null}

      <div className="flex items-center gap-1.5">
        <Select
          value={direction}
          disabled={disabled}
          onValueChange={(value) => setDirection(value as 'blocks' | 'blocked-by')}
        >
          <SelectTrigger size="sm" aria-label="Direção do bloqueio" className="h-8 flex-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="blocks">Bloqueia</SelectItem>
            <SelectItem value="blocked-by">É bloqueada por</SelectItem>
          </SelectContent>
        </Select>
        <IssuePicker
          issues={selectable}
          projects={projects}
          disabled={disabled}
          onPick={(picked) => (direction === 'blocks' ? onLink(picked) : onLinkReverse(picked))}
        />
      </div>
    </div>
  )
}

/**
 * A searchable one-shot issue chooser. A blocking link can point at any
 * repository of the Escopo, so the chooser groups by repository and names it:
 * `#12` alone says nothing when twenty projects each have one.
 */
function IssuePicker({
  issues,
  projects,
  disabled,
  onPick,
}: {
  issues: readonly ProviderIssue[]
  projects: readonly ProviderProject[]
  disabled: boolean
  onPick: (issue: ProviderIssue) => void
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const needle = query.trim().toLocaleLowerCase()
  const groups = useMemo(() => {
    const byRepository = new Map<string, ProviderIssue[]>()
    let shown = 0
    for (const issue of issues) {
      const repository = repositoryOf(issue, projects)
      if (
        needle &&
        !`#${issue.iid} ${issue.title} ${repository}`.toLocaleLowerCase().includes(needle)
      )
        continue
      if (shown >= 50) break
      shown += 1
      byRepository.set(repository, [...(byRepository.get(repository) ?? []), issue])
    }
    return [...byRepository.entries()]
  }, [issues, projects, needle])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button size="xs" variant="outline" disabled={disabled} className="flex-1">
          <Plus aria-hidden />
          Adicionar bloqueio
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[min(24rem,80vw)] p-0">
        <div className="relative flex items-center border-b p-1.5">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3.5 size-3 text-muted-foreground"
          />
          <Input
            autoFocus
            aria-label="Buscar issue para vincular"
            placeholder="Buscar por título, #número ou repositório…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-7 border-0 bg-transparent pl-6 text-xs shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {groups.map(([repository, found]) => (
            <div key={repository} className="mb-1 last:mb-0">
              <p className="sticky top-0 z-10 flex items-center gap-1.5 bg-popover px-2 py-1 font-mono text-[10px] text-muted-foreground">
                <FolderGit2 aria-hidden className="size-3 flex-none" />
                <span className="min-w-0 truncate">{repository}</span>
                <span className="ml-auto tabular-nums opacity-70">{found.length}</span>
              </p>
              {found.map((issue) => (
                <button
                  key={issue.id}
                  type="button"
                  onClick={() => {
                    onPick(issue)
                    setQuery('')
                    setOpen(false)
                  }}
                  className="flex w-full items-center gap-2 rounded-md py-1.5 pr-2 pl-3.5 text-left text-xs transition-colors hover:bg-hover"
                >
                  <StatusDot status={readIssueProperties(issue).status} />
                  <span className="min-w-0 flex-1 truncate">{issue.title}</span>
                  <span className="flex-none font-mono text-[10px] text-muted-foreground">
                    #{issue.iid}
                  </span>
                </button>
              ))}
            </div>
          ))}
          {!groups.length ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              Nenhuma issue encontrada.
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** `grupo/projeto` for an Issue, falling back to the raw project id. */
function repositoryOf(issue: ProviderIssue, projects: readonly ProviderProject[]): string {
  return projectPath(
    projects.find((project) => project.id === issue.projectId),
    issue.projectId,
  )
}

/** Sub-issues, as Linear shows them: state, title and a way straight into each one. */
function SubIssueList({
  issues,
  onOpenIssue,
}: {
  issues: readonly ProviderIssue[]
  onOpenIssue?: ((issue: ProviderIssue) => void) | undefined
}) {
  const done = issues.filter((item) => readIssueProperties(item).status === 'Concluído').length
  // Oldest first, newest at the end, whatever order the caller handed over.
  const ordered = [...issues].sort(byAge)
  return (
    <div className="space-y-1">
      <div className="mb-2 flex items-center gap-2 text-[11px] text-muted-foreground">
        <ListTree aria-hidden className="size-3.5" />
        <span className="tabular-nums">
          {done} de {issues.length} concluído{issues.length === 1 ? '' : 's'}
        </span>
        <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
          <span
            className="block h-full rounded-full bg-primary transition-[width]"
            style={{ width: `${issues.length ? (done / issues.length) * 100 : 0}%` }}
          />
        </span>
      </div>
      {ordered.map((child) => {
        const properties = readIssueProperties(child)
        return (
          <button
            key={child.id}
            type="button"
            onClick={() => onOpenIssue?.(child)}
            className="flex w-full items-center gap-2.5 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-hover"
          >
            <StatusDot status={properties.status} conflict={properties.conflicts.status} />
            <span className="min-w-0 flex-1 truncate text-[12.5px] text-foreground">
              {child.title}
            </span>
            <PriorityBadge priority={properties.priority} />
            <span className="flex-none font-mono text-[10.5px] text-muted-foreground">
              #{child.iid}
            </span>
            <UserAvatar user={child.assignees[0]} size="xs" />
          </button>
        )
      })}
    </div>
  )
}

const MERGE_REQUEST_STATES: Record<string, { label: string; className: string }> = {
  merged: { label: 'merged', className: 'bg-primary/12 text-primary' },
  opened: {
    label: 'aberto',
    className: 'bg-emerald-500/12 text-emerald-600 dark:text-emerald-400',
  },
  closed: { label: 'fechado', className: 'bg-destructive/12 text-destructive' },
  locked: { label: 'travado', className: 'bg-muted text-muted-foreground' },
}

/** The Merge Requests the Provider links to the Issue, as a readable list. */
function MergeRequestList({ mergeRequests }: { mergeRequests: readonly ProviderMergeRequest[] }) {
  return (
    <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border">
      {mergeRequests.map((mergeRequest) => {
        const state = MERGE_REQUEST_STATES[mergeRequest.state] ?? {
          label: mergeRequest.state,
          className: 'bg-muted text-muted-foreground',
        }
        return (
          <li key={mergeRequest.id}>
            <a
              href={mergeRequest.webUrl}
              target="_blank"
              rel="noreferrer"
              className="flex flex-col gap-1.5 px-3 py-2.5 transition-colors hover:bg-hover"
            >
              <div className="flex min-w-0 items-center gap-2">
                <GitMerge aria-hidden className="size-3.5 flex-none text-primary" />
                <span className="min-w-0 flex-1 truncate text-[12.5px] font-medium text-foreground">
                  {mergeRequest.draft ? (
                    <span className="mr-1.5 text-muted-foreground">Rascunho</span>
                  ) : null}
                  {mergeRequest.title}
                </span>
                <span
                  className={cn(
                    'flex-none rounded-full px-2 py-px text-[10px] font-semibold',
                    state.className,
                  )}
                >
                  {state.label}
                </span>
              </div>
              <div className="flex min-w-0 items-center gap-2 font-mono text-[10.5px] text-muted-foreground">
                <span className="flex-none font-semibold">!{mergeRequest.iid}</span>
                {mergeRequest.sourceBranch ? (
                  <span className="min-w-0 truncate">
                    {mergeRequest.sourceBranch} → {mergeRequest.targetBranch}
                  </span>
                ) : null}
                {mergeRequest.author ? (
                  <span className="ml-auto flex flex-none items-center gap-1.5">
                    <UserAvatar user={mergeRequest.author} size="xs" />
                    {mergeRequest.author.name}
                  </span>
                ) : null}
                {mergeRequest.updatedAt ? (
                  <time
                    className="flex-none whitespace-nowrap"
                    dateTime={mergeRequest.updatedAt}
                    title={absoluteTime(mergeRequest.updatedAt)}
                  >
                    {relativeTime(mergeRequest.updatedAt)}
                  </time>
                ) : null}
              </div>
            </a>
          </li>
        )
      })}
    </ul>
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

function CollapsibleSection({
  title,
  count,
  children,
  className,
}: {
  title: string
  count?: number
  children: React.ReactNode
  className?: string
}) {
  const [open, setOpen] = useState(true)
  return (
    <section className={cn('mb-6', className)}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="mb-3 flex w-full items-center gap-2.5 text-left"
      >
        <h3 className="text-[10px] font-semibold tracking-[0.09em] text-muted-foreground uppercase">
          {title}
        </h3>
        <span className="h-px flex-1 bg-border" />
        {count !== undefined ? (
          <span className="font-mono text-[10.5px] text-muted-foreground">{count}</span>
        ) : null}
        <ChevronDown
          className={cn(
            'size-3.5 text-muted-foreground transition-transform',
            !open && '-rotate-90',
          )}
        />
      </button>
      {open ? children : null}
    </section>
  )
}

function CommentList({
  comments,
  empty,
  activity = false,
  issueHref,
  onIssueSelect,
}: {
  comments: readonly ProviderComment[]
  empty: string
  activity?: boolean
  issueHref: (iid: number) => string
  onIssueSelect?: ((iid: number) => void) | undefined
}) {
  if (!comments.length) return <p className="py-2 text-[12.5px] text-muted-foreground">{empty}</p>
  return (
    <>
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
            <Markdown
              className="text-[12.5px] leading-[1.65] text-foreground"
              empty=""
              issueHref={issueHref}
              onIssueSelect={onIssueSelect}
            >
              {activity ? c.body.replace(/^\w+\s+(added|removed|changed)\s+/i, '') : c.body}
            </Markdown>
          </div>
        </article>
      ))}
    </>
  )
}
