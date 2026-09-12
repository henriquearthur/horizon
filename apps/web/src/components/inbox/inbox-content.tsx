import { useEffect, useMemo, useRef, useState } from 'react'
import {
  PRIORITY_VALUES,
  STATUS_VALUES,
  filterIssues,
  isIssueVisible,
  groupIssues,
  readIssueProperties,
  searchIssues,
  sortIssues,
  viewRefToParam,
  type InboxFilters,
  type InboxGroup,
  type InboxSort,
  type IssueStatus,
  type ProviderComment,
  type ProviderDiscussionMatch,
  type ProviderIssue,
  type ProviderWriteContract,
  type ViewMode,
  type ViewRef,
} from '@horizon/domain'
import { ArrowUpDown, Bookmark, Group, Plus, RefreshCw, X } from 'lucide-react'
import { FilterMenu, type FilterDefinition } from './filter-menu'
import { IssueViews } from './issue-views'
import { IssueCreateForm, IssueDetailPanel } from '~/components/issue/issue-detail-panel'
import { LabelChip, PriorityBadge, StatusDot, UserAvatar } from '~/components/issue/issue-chrome'
import { ContentToolbar } from '~/components/shell/content-toolbar'
import { EmptyState } from '~/components/shell/empty-state'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '~/components/ui/dropdown-menu'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '~/components/ui/select'
import { persistSavedViews, readSavedViews, useSavedViews } from '~/db/use-saved-views'
import { projectPath } from '~/lib/issue-presentation'
import { horizonIssueHref } from '~/lib/search'
import type { RuntimeSnapshot } from '~/server/runtime'
import { searchRuntimeDiscussions } from '~/server/runtime-functions'

const SORTS: readonly { value: InboxSort; label: string }[] = [
  { value: 'updated', label: 'Atualização' },
  { value: 'created', label: 'Criação' },
  { value: 'title', label: 'Título' },
]

const GROUPS: readonly { value: InboxGroup; label: string }[] = [
  { value: 'project', label: 'Projeto' },
  { value: 'status', label: 'Status' },
  { value: 'priority', label: 'Prioridade' },
  { value: 'author', label: 'Autor' },
  { value: 'assignee', label: 'Responsável' },
  { value: 'label', label: 'Label' },
]

export function InboxContent({
  snapshot,
  view,
  mode,
  query,
  issueRef,
  provider,
  refresh,
  refreshing,
  onSavedViewSelected,
  onIssueSelected,
}: {
  readonly snapshot: RuntimeSnapshot
  readonly view: ViewRef
  readonly mode: ViewMode
  readonly query: string
  readonly issueRef?: string | undefined
  readonly provider: ProviderWriteContract
  readonly refresh: () => Promise<void>
  readonly refreshing: boolean
  readonly onSavedViewSelected?: (selection: {
    view: string
    mode?: ViewMode
    query?: string
  }) => void
  readonly onIssueSelected?: (issueRef: string | undefined) => void
}) {
  const [filters, setFilters] = useState<InboxFilters>({})
  const [sort, setSort] = useState<InboxSort>('updated')
  const [group, setGroup] = useState<InboxGroup>('project')
  const [selected, setSelected] = useState<ProviderIssue>()
  const [comments, setComments] = useState<readonly ProviderComment[]>([])
  const [detailError, setDetailError] = useState<string>()
  const [detailLoading, setDetailLoading] = useState(false)
  const detailRequest = useRef(0)
  const [creating, setCreating] = useState(false)
  const [createProjectId, setCreateProjectId] = useState<number>()
  const [saveName, setSaveName] = useState('')
  const [savingView, setSavingView] = useState(false)
  const [discussionMatches, setDiscussionMatches] = useState<readonly ProviderDiscussionMatch[]>([])
  const updateFilter = <K extends keyof InboxFilters>(key: K, value: InboxFilters[K]) =>
    setFilters((current) => {
      const next = { ...current }
      if (value === undefined) delete next[key]
      else next[key] = value
      return next
    })
  const scopeKey = JSON.stringify(snapshot.scope)
  const savedViews = useSavedViews(scopeKey)
  const activeSavedView =
    view._tag === 'Saved' ? savedViews.find((savedView) => savedView.id === view.id) : undefined

  useEffect(() => {
    if (activeSavedView) {
      setFilters({
        ...(activeSavedView.projectIds ? { projectIds: activeSavedView.projectIds } : {}),
        ...(activeSavedView.groupPaths ? { groupPaths: activeSavedView.groupPaths } : {}),
        ...(activeSavedView.author ? { author: activeSavedView.author } : {}),
        ...(activeSavedView.assignee ? { assignee: activeSavedView.assignee } : {}),
        ...(activeSavedView.labels ? { labels: activeSavedView.labels } : {}),
        ...(activeSavedView.status
          ? { status: activeSavedView.status as NonNullable<InboxFilters['status']> }
          : {}),
        ...(activeSavedView.priority
          ? { priority: activeSavedView.priority as NonNullable<InboxFilters['priority']> }
          : {}),
      })
      setSort(activeSavedView.sort ?? 'updated')
      setGroup(activeSavedView.groupBy ?? 'project')
      onSavedViewSelected?.({
        view: `saved:${activeSavedView.id}`,
        ...(activeSavedView.mode ? { mode: activeSavedView.mode } : {}),
        ...(activeSavedView.query ? { query: activeSavedView.query } : {}),
      })
    }
  }, [activeSavedView?.id, view._tag])
  useEffect(() => {
    let active = true
    if (!query.trim()) {
      setDiscussionMatches([])
      return
    }
    void searchRuntimeDiscussions({ data: { query } })
      .then((matches) => {
        if (active) setDiscussionMatches(matches)
      })
      .catch(() => {
        if (active) setDiscussionMatches([])
      })
    return () => {
      active = false
    }
  }, [query])

  const projectById = useMemo(
    () => new Map(snapshot.projects.map((project) => [project.id, project])),
    [snapshot.projects],
  )
  const available = useMemo(() => {
    let issues = snapshot.issues.filter((issue) => isIssueVisible(issue))
    if (view._tag === 'Project')
      issues = issues.filter((issue) => {
        const project = projectById.get(issue.projectId)
        return project ? `${project.namespace}/${project.path}` === view.path : false
      })
    if (view._tag === 'Group')
      issues = issues.filter((issue) => {
        const path = projectById.get(issue.projectId)?.groupPath
        return path === view.path || path?.startsWith(`${view.path}/`) === true
      })
    return issues
  }, [projectById, snapshot, view])
  const issues = useMemo(() => {
    const found = searchIssues(available, query, snapshot.projects)
    const discussionKeys = new Set(
      discussionMatches.map((match) => `${match.projectId}:${match.iid}`),
    )
    const searched = query.trim()
      ? [
          ...new Map(
            [
              ...found,
              ...available.filter((issue) => discussionKeys.has(`${issue.projectId}:${issue.iid}`)),
            ].map((issue) => [issue.id, issue]),
          ).values(),
        ]
      : found
    return sortIssues(filterIssues(searched, filters, snapshot.projects), sort)
  }, [available, discussionMatches, filters, query, snapshot.projects, sort])
  const grouped = useMemo(() => groupIssues(issues, group), [group, issues])
  const issueHref = (iid: number) =>
    horizonIssueHref(
      {
        viewParam: viewRefToParam(view),
        mode,
        query,
      },
      selected?.projectId ?? 0,
      iid,
    )

  /** Counts come from the Issues the View offers, so a filter never reads `0` by surprise. */
  const countBy = (match: (issue: ProviderIssue) => boolean) => available.filter(match).length
  const labels = [...new Set(snapshot.issues.flatMap((issue) => issue.labels))].filter(
    (label) => !label.startsWith('horizon::'),
  )
  const userByUsername = new Map(snapshot.users.map((user) => [user.username, user]))
  const authors = [...new Set(snapshot.issues.flatMap((issue) => issue.author?.username ?? []))]
  const assignees = [
    ...new Set(snapshot.issues.flatMap((issue) => issue.assignees.map((user) => user.username))),
  ]

  const filterDefinitions: readonly FilterDefinition[] = [
    {
      label: 'Status',
      value: filters.status ?? '',
      onChange: (value) => updateFilter('status', (value || undefined) as never),
      options: STATUS_VALUES.map((value) => ({
        value,
        label: value,
        count: countBy((issue) => readIssueProperties(issue).status === value),
        adornment: <StatusDot status={value} />,
      })),
    },
    {
      label: 'Prioridade',
      value: filters.priority ?? '',
      onChange: (value) => updateFilter('priority', (value || undefined) as never),
      options: PRIORITY_VALUES.map((value) => ({
        value,
        label: value,
        count: countBy(
          (issue) => (readIssueProperties(issue).priority ?? 'Sem prioridade') === value,
        ),
        adornment: <PriorityBadge priority={value} />,
      })),
    },
    {
      label: 'Label',
      value: filters.labels?.[0] ?? '',
      onChange: (value) => updateFilter('labels', value ? [value] : undefined),
      options: labels.map((value) => ({
        value,
        label: value,
        count: countBy((issue) => issue.labels.includes(value)),
        adornment: <LabelChip label={value} className="max-w-20" />,
      })),
    },
    {
      label: 'Responsável',
      value: filters.assignee ?? '',
      onChange: (value) => updateFilter('assignee', value || undefined),
      options: assignees.map((value) => ({
        value,
        label: userByUsername.get(value)?.name ?? value,
        count: countBy((issue) => issue.assignees.some((user) => user.username === value)),
        adornment: <UserAvatar user={userByUsername.get(value)} size="xs" />,
      })),
    },
    {
      label: 'Autor',
      value: filters.author ?? '',
      onChange: (value) => updateFilter('author', value || undefined),
      options: authors.map((value) => ({
        value,
        label: userByUsername.get(value)?.name ?? value,
        count: countBy((issue) => issue.author?.username === value),
        adornment: <UserAvatar user={userByUsername.get(value)} size="xs" />,
      })),
    },
    {
      label: 'Projeto',
      value: filters.projectIds?.[0] ? String(filters.projectIds[0]) : '',
      onChange: (value) => updateFilter('projectIds', value ? [Number(value)] : undefined),
      options: snapshot.projects.map((project) => ({
        value: String(project.id),
        label: `${project.namespace}/${project.path}`,
        count: countBy((issue) => issue.projectId === project.id),
      })),
    },
    {
      label: 'Grupo',
      value: filters.groupPaths?.[0] ?? '',
      onChange: (value) => updateFilter('groupPaths', value ? [value] : undefined),
      options: snapshot.groups.map((scopeGroup) => ({
        value: scopeGroup.fullPath,
        label: scopeGroup.fullPath,
        count: countBy((issue) => {
          const path = projectById.get(issue.projectId)?.groupPath
          return (
            path === scopeGroup.fullPath || path?.startsWith(`${scopeGroup.fullPath}/`) === true
          )
        }),
      })),
    },
  ]

  const hasFilters = Object.keys(filters).length > 0

  const openIssue = async (issue: ProviderIssue) => {
    setSelected(issue)
    onIssueSelected?.(`${issue.projectId}:${issue.iid}`)
    setComments([])
    setDetailError(undefined)
    const requestId = ++detailRequest.current
    setDetailLoading(true)
    try {
      setComments(await provider.listComments(issue.projectId, issue.iid))
    } catch (cause) {
      setDetailError(
        cause instanceof Error ? cause.message : 'Não foi possível carregar a discussão.',
      )
    } finally {
      if (detailRequest.current === requestId) setDetailLoading(false)
    }
  }

  useEffect(() => {
    setSelected(undefined)
    setComments([])
  }, [
    view._tag,
    view._tag === 'Group' || view._tag === 'Project' ? view.path : view.id,
    mode,
    query,
  ])

  useEffect(() => {
    if (!issueRef) return
    const [projectId, iid] = issueRef.split(':').map(Number)
    if (selected?.projectId === projectId && selected?.iid === iid) return
    const target = snapshot.issues.find(
      (issue) => issue.projectId === projectId && issue.iid === iid,
    )
    if (target) void openIssue(target)
  }, [issueRef, selected?.id, snapshot.issues])

  const changeStatus = async (issue: ProviderIssue, status: IssueStatus) => {
    setDetailError(undefined)
    try {
      const updated = await provider.updateIssueProperties(issue.projectId, issue.iid, { status })
      if (selected?.id === updated.id) setSelected(updated)
    } catch (cause) {
      setDetailError(cause instanceof Error ? cause.message : 'Não foi possível mover o issue.')
    }
  }

  const saveCurrentView = () => {
    const name = saveName.trim()
    if (!name) return
    const id = globalThis.crypto.randomUUID()
    persistSavedViews([
      ...readSavedViews(),
      {
        id,
        name,
        scope: scopeKey,
        mode,
        ...(query ? { query } : {}),
        groupBy: group,
        sort,
        ...filters,
      },
    ])
    setSaveName('')
    setSavingView(false)
    onSavedViewSelected?.({ view: `saved:${id}`, mode, ...(query ? { query } : {}) })
  }

  return (
    <>
      <ContentToolbar
        resultCount={`${issues.length} ${issues.length === 1 ? 'issue' : 'issues'}`}
        actions={
          <div className="flex items-center gap-1.5">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="xs" className="text-muted-foreground">
                  <ArrowUpDown aria-hidden />
                  {SORTS.find((option) => option.value === sort)?.label}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Ordenar por</DropdownMenuLabel>
                <DropdownMenuRadioGroup
                  value={sort}
                  onValueChange={(value) => setSort(value as InboxSort)}
                >
                  {SORTS.map((option) => (
                    <DropdownMenuRadioItem key={option.value} value={option.value}>
                      {option.label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
                {mode === 'list' ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel>Agrupar por</DropdownMenuLabel>
                    <DropdownMenuRadioGroup
                      value={group}
                      onValueChange={(value) => setGroup(value as InboxGroup)}
                    >
                      {GROUPS.map((option) => (
                        <DropdownMenuRadioItem key={option.value} value={option.value}>
                          {option.label}
                        </DropdownMenuRadioItem>
                      ))}
                    </DropdownMenuRadioGroup>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>

            {activeSavedView ? (
              <SavedViewActions
                name={activeSavedView.name}
                onRenamed={(name) =>
                  persistSavedViews(
                    readSavedViews().map((savedView) =>
                      savedView.id === activeSavedView.id ? { ...savedView, name } : savedView,
                    ),
                  )
                }
                onDeleted={() => {
                  persistSavedViews(
                    readSavedViews().filter((savedView) => savedView.id !== activeSavedView.id),
                  )
                  onSavedViewSelected?.({ view: 'general' })
                }}
              />
            ) : null}

            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Atualizar issues"
              onClick={() => void refresh()}
              disabled={refreshing}
              className="text-muted-foreground"
            >
              <RefreshCw className={refreshing ? 'animate-spin' : ''} />
            </Button>

            <Button
              size="xs"
              onClick={() => {
                setCreateProjectId(filters.projectIds?.[0] ?? snapshot.projects[0]?.id)
                setCreating(true)
              }}
              disabled={!snapshot.projects.length}
            >
              <Plus aria-hidden />
              Novo issue
            </Button>
          </div>
        }
      >
        <FilterMenu filters={filterDefinitions} />

        {true ? (
          <>
            <Button
              variant="ghost"
              size="xs"
              className="text-muted-foreground"
              onClick={() => setFilters({})}
            >
              <X aria-hidden />
              Limpar
            </Button>
            <Popover open={savingView} onOpenChange={setSavingView}>
              <PopoverTrigger asChild>
                <Button variant="secondary" size="xs">
                  <Bookmark aria-hidden />
                  Salvar view
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 p-3">
                <form
                  className="flex flex-col gap-2"
                  onSubmit={(event) => {
                    event.preventDefault()
                    saveCurrentView()
                  }}
                >
                  <label
                    className="text-[11px] font-medium text-muted-foreground"
                    htmlFor="save-view-name"
                  >
                    Nome da View
                  </label>
                  <Input
                    id="save-view-name"
                    autoFocus
                    value={saveName}
                    onChange={(event) => setSaveName(event.target.value)}
                    placeholder="Incidentes P1"
                    className="h-8 text-xs"
                  />
                  <Button type="submit" size="xs" disabled={!saveName.trim()}>
                    Salvar
                  </Button>
                </form>
              </PopoverContent>
            </Popover>
          </>
        ) : null}
      </ContentToolbar>

      <div className="relative flex-1 overflow-y-auto">
        {issues.length === 0 ? (
          <EmptyState>Nenhum issue corresponde a esta View e aos filtros atuais.</EmptyState>
        ) : (
          <IssueViews
            mode={mode}
            issues={issues}
            projects={snapshot.projects}
            groups={grouped}
            onOpen={openIssue}
            selectedId={selected?.id}
            onStatusChange={(issue, status) => void changeStatus(issue, status)}
          />
        )}
        {creating ? (
          <aside className="animate-panel-in absolute inset-y-0 right-0 z-20 w-[min(40vw,32rem)] min-w-[22rem] overflow-y-auto rounded-l-2xl border-l bg-card p-5 shadow-panel">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-[15px] font-semibold tracking-tight">Novo issue</h2>
              <Button
                size="icon-xs"
                variant="ghost"
                onClick={() => setCreating(false)}
                aria-label="Fechar"
              >
                <X />
              </Button>
            </div>
            <div className="mb-4 space-y-1">
              <span className="block text-[11px] font-medium text-muted-foreground">Projeto</span>
              <Select
                {...(createProjectId ? { value: String(createProjectId) } : {})}
                onValueChange={(value) => setCreateProjectId(Number(value))}
              >
                <SelectTrigger size="sm" aria-label="Projeto do novo issue" className="w-full">
                  <SelectValue placeholder="Escolha um projeto" />
                </SelectTrigger>
                <SelectContent>
                  {snapshot.projects.map((project) => (
                    <SelectItem key={project.id} value={String(project.id)}>
                      {projectPath(project, project.id)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {createProjectId ? (
              <IssueCreateForm
                key={createProjectId}
                projectId={createProjectId}
                provider={provider}
                users={snapshot.users}
                availableLabels={snapshot.labels
                  .map((label) => label.name)
                  .filter((label) => !label.startsWith('horizon::'))}
                onCreated={(issue) => {
                  setCreating(false)
                  void openIssue(issue)
                }}
              />
            ) : null}
          </aside>
        ) : null}
        {selected ? (
          <IssueDetailPanel
            issue={selected}
            comments={comments}
            provider={provider}
            onClose={() => {
              setSelected(undefined)
              onIssueSelected?.(undefined)
            }}
            onUpdated={setSelected}
            onCommentCreated={(comment) => setComments((current) => [...current, comment])}
            users={snapshot.users}
            currentUser={snapshot.connection.user}
            loading={detailLoading}
            availableLabels={labels}
            issueHref={issueHref}
          />
        ) : null}
        {detailError ? (
          <p
            role="alert"
            className="animate-rise absolute right-4 bottom-4 z-60 rounded-xl bg-destructive px-3.5 py-2.5 text-xs text-destructive-foreground shadow-lg"
          >
            {detailError}
          </p>
        ) : null}
      </div>
    </>
  )
}

function SavedViewActions({
  name,
  onRenamed,
  onDeleted,
}: {
  name: string
  onRenamed: (name: string) => void
  onDeleted: () => void
}) {
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(name)
  useEffect(() => setDraft(name), [name])

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="xs" className="text-muted-foreground">
          <Group aria-hidden />
          View salva
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-64 space-y-2 p-3">
        <form
          className="flex flex-col gap-2"
          onSubmit={(event) => {
            event.preventDefault()
            if (draft.trim()) onRenamed(draft.trim())
            setOpen(false)
          }}
        >
          <label className="text-[11px] font-medium text-muted-foreground" htmlFor="rename-view">
            Renomear
          </label>
          <Input
            id="rename-view"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            className="h-8 text-xs"
          />
          <Button type="submit" size="xs" disabled={!draft.trim()}>
            Salvar nome
          </Button>
        </form>
        <Button
          variant="ghost"
          size="xs"
          className="w-full text-destructive hover:bg-destructive/10"
          onClick={() => {
            onDeleted()
            setOpen(false)
          }}
        >
          Excluir view
        </Button>
      </PopoverContent>
    </Popover>
  )
}
