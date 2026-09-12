import { useEffect, useMemo, useState } from 'react'
import {
  PRIORITY_VALUES,
  STATUS_VALUES,
  filterIssues,
  groupIssues,
  searchIssues,
  sortIssues,
  type InboxFilters,
  type InboxGroup,
  type InboxSort,
  type ProviderComment,
  type ProviderDiscussionMatch,
  type ProviderIssue,
  type ProviderWriteContract,
  type ViewMode,
  type ViewRef,
} from '@horizon/domain'
import { RefreshCw } from 'lucide-react'
import { FilterMenu } from './filter-menu'
import { IssueViews } from './issue-views'
import { IssueCreateForm, IssueDetailPanel } from '~/components/issue/issue-detail-panel'
import { ContentToolbar } from '~/components/shell/content-toolbar'
import { EmptyState } from '~/components/shell/empty-state'
import { Button } from '~/components/ui/button'
import { persistSavedViews, readSavedViews, useSavedViews } from '~/db/use-saved-views'
import type { RuntimeSnapshot } from '~/server/runtime'
import { searchRuntimeDiscussions } from '~/server/runtime-functions'

/** Notes search is expensive on GitLab: only run it for a real term. */
const MIN_DISCUSSION_QUERY = 3
const DISCUSSION_SEARCH_DELAY_MS = 450

const selectClass =
  'h-7 rounded-md border bg-background px-2 text-[11px] text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring'

export function InboxContent({
  snapshot,
  view,
  mode,
  query,
  provider,
  refresh,
  refreshing,
  onSavedViewSelected,
}: {
  readonly snapshot: RuntimeSnapshot
  readonly view: ViewRef
  readonly mode: ViewMode
  readonly query: string
  readonly provider: ProviderWriteContract
  readonly refresh: () => Promise<void>
  readonly refreshing: boolean
  readonly onSavedViewSelected?: (selection: {
    view: string
    mode?: ViewMode
    query?: string
  }) => void
}) {
  const [filters, setFilters] = useState<InboxFilters>({})
  const [sort, setSort] = useState<InboxSort>('updated')
  const [group, setGroup] = useState<InboxGroup>('project')
  const [selected, setSelected] = useState<ProviderIssue>()
  const [comments, setComments] = useState<readonly ProviderComment[]>([])
  const [detailError, setDetailError] = useState<string>()
  const [creating, setCreating] = useState(false)
  const [createProjectId, setCreateProjectId] = useState<number>()
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
    if (view._tag === 'Builtin' && view.id === 'by-project') setGroup('project')
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
    const term = query.trim()
    if (term.length < MIN_DISCUSSION_QUERY) {
      setDiscussionMatches([])
      return
    }
    // Searching notes costs one GitLab call per project, so it waits for the
    // user to stop typing instead of firing on every keystroke.
    let active = true
    const timer = globalThis.setTimeout(() => {
      void searchRuntimeDiscussions({ data: { query: term } })
        .then((matches) => {
          if (active) setDiscussionMatches(matches)
        })
        .catch(() => {
          if (active) setDiscussionMatches([])
        })
    }, DISCUSSION_SEARCH_DELAY_MS)
    return () => {
      active = false
      globalThis.clearTimeout(timer)
    }
  }, [query])

  // Keep the open issue in sync with the Provider, without throwing away an
  // edit in progress when the poll brings back an identical record.
  useEffect(() => {
    setSelected((current) => {
      if (!current) return current
      const fresh = snapshot.issues.find((issue) => issue.id === current.id)
      return fresh && JSON.stringify(fresh) !== JSON.stringify(current) ? fresh : current
    })
  }, [snapshot.issues])

  const projectById = useMemo(
    () => new Map(snapshot.projects.map((project) => [project.id, project])),
    [snapshot.projects],
  )
  const available = useMemo(() => {
    let issues = snapshot.issues
    if (view._tag === 'Project')
      issues = issues.filter((issue) => {
        const project = projectById.get(issue.projectId)
        return project ? `${project.namespace}/${project.path}` === view.path : false
      })
    if (view._tag === 'Builtin' && view.id === 'assigned-to-me')
      issues = issues.filter((issue) =>
        issue.assignees.some((assignee) => assignee.username === snapshot.connection.user.username),
      )
    if (view._tag === 'Builtin' && view.id === 'inbox')
      issues = issues.filter((issue) => issue.state === 'opened')
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
  const labels = [...new Set(snapshot.issues.flatMap((issue) => issue.labels))].filter(
    (label) => !label.startsWith('horizon::'),
  )
  const authors = [...new Set(snapshot.issues.flatMap((issue) => issue.author?.username ?? []))]
  const assignees = [
    ...new Set(snapshot.issues.flatMap((issue) => issue.assignees.map((user) => user.username))),
  ]
  const users = snapshot.users

  const openIssue = async (issue: ProviderIssue) => {
    setSelected(issue)
    setComments([])
    setDetailError(undefined)
    try {
      setComments(await provider.listComments(issue.projectId, issue.iid))
    } catch (cause) {
      setDetailError(
        cause instanceof Error ? cause.message : 'Não foi possível carregar a discussão.',
      )
    }
  }

  return (
    <>
      <ContentToolbar resultCount={`${issues.length} ${issues.length === 1 ? 'issue' : 'issues'}`}>
        <FilterMenu
          filters={[
            {
              label: 'Projeto',
              value: filters.projectIds?.[0] ? String(filters.projectIds[0]) : '',
              onChange: (value) => updateFilter('projectIds', value ? [Number(value)] : undefined),
              options: snapshot.projects.map((project) => ({
                value: String(project.id),
                label: `${project.namespace}/${project.path}`,
              })),
            },
            {
              label: 'Grupo',
              value: filters.groupPaths?.[0] ?? '',
              onChange: (value) => updateFilter('groupPaths', value ? [value] : undefined),
              options: snapshot.groups.map((group) => ({
                value: group.fullPath,
                label: group.fullPath,
              })),
            },
            {
              label: 'Status',
              value: filters.status ?? '',
              onChange: (value) => updateFilter('status', (value || undefined) as never),
              options: STATUS_VALUES.map((value) => ({ value, label: value })),
            },
            {
              label: 'Prioridade',
              value: filters.priority ?? '',
              onChange: (value) => updateFilter('priority', (value || undefined) as never),
              options: PRIORITY_VALUES.map((value) => ({ value, label: value })),
            },
            {
              label: 'Autor',
              value: filters.author ?? '',
              onChange: (value) => updateFilter('author', value || undefined),
              options: authors.map((value) => ({ value, label: value })),
            },
            {
              label: 'Responsável',
              value: filters.assignee ?? '',
              onChange: (value) => updateFilter('assignee', value || undefined),
              options: assignees.map((value) => ({ value, label: value })),
            },
            {
              label: 'Label',
              value: filters.labels?.[0] ?? '',
              onChange: (value) => updateFilter('labels', value ? [value] : undefined),
              options: labels.map((value) => ({ value, label: value })),
            },
          ]}
        />
        <details className="absolute right-4 top-[-35px] mr-[124px] z-30">
          <summary
            aria-label="Opções da view"
            className="cursor-pointer list-none px-2 text-muted-foreground"
          >
            ⋯
          </summary>
          <div className="absolute right-0 top-7 flex w-56 flex-col gap-2 rounded-[9px] border bg-popover p-3 shadow-lg">
            <FilterSelect
              label="Ordenar"
              value={sort}
              onChange={(value) => setSort(value as InboxSort)}
              options={[
                { value: 'updated', label: 'Mais recentes' },
                { value: 'created', label: 'Criação' },
                { value: 'title', label: 'Título' },
              ]}
              allowEmpty={false}
            />
            {mode === 'list' ? (
              <FilterSelect
                label="Agrupar"
                value={group}
                onChange={(value) => setGroup(value as InboxGroup)}
                options={[
                  { value: 'project', label: 'Projeto' },
                  { value: 'status', label: 'Status' },
                  { value: 'priority', label: 'Prioridade' },
                  { value: 'author', label: 'Autor' },
                  { value: 'assignee', label: 'Responsável' },
                  { value: 'label', label: 'Label' },
                ]}
                allowEmpty={false}
              />
            ) : null}
            <Button
              size="xs"
              variant="outline"
              onClick={() => {
                const name = globalThis.prompt?.('Nome da View')?.trim()
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
                onSavedViewSelected?.({ view: `saved:${id}`, mode, ...(query ? { query } : {}) })
              }}
            >
              Salvar View
            </Button>
            {activeSavedView ? (
              <>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    const name = globalThis
                      .prompt?.('Novo nome da View', activeSavedView.name)
                      ?.trim()
                    if (!name) return
                    persistSavedViews(
                      readSavedViews().map((savedView) =>
                        savedView.id === activeSavedView.id ? { ...savedView, name } : savedView,
                      ),
                    )
                  }}
                >
                  Renomear
                </Button>
                <Button
                  size="xs"
                  variant="ghost"
                  onClick={() => {
                    persistSavedViews(
                      readSavedViews().filter((savedView) => savedView.id !== activeSavedView.id),
                    )
                    onSavedViewSelected?.({ view: 'inbox' })
                  }}
                >
                  Excluir
                </Button>
              </>
            ) : null}
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Atualizar issues"
              onClick={() => void refresh()}
              disabled={refreshing}
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
              Novo issue
            </Button>
          </div>
        </details>
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
          />
        )}
        {creating ? (
          <aside className="absolute inset-y-0 right-0 z-20 w-[min(38vw,30rem)] min-w-[21rem] border-l bg-card p-4 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="font-semibold">Novo issue</h2>
              <Button size="icon-xs" variant="ghost" onClick={() => setCreating(false)}>
                ×
              </Button>
            </div>
            <label className="mb-4 block text-xs font-medium text-muted-foreground">
              Projeto
              <select
                aria-label="Projeto do novo issue"
                className="mt-1 h-9 w-full rounded-md border bg-background px-2 text-sm text-foreground"
                value={createProjectId}
                onChange={(event) => setCreateProjectId(Number(event.target.value))}
              >
                {snapshot.projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.namespace}/{project.path}
                  </option>
                ))}
              </select>
            </label>
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
            onClose={() => setSelected(undefined)}
            onUpdated={setSelected}
            onCommentCreated={(comment) => setComments((current) => [...current, comment])}
            users={users}
            availableLabels={labels}
          />
        ) : null}
        {detailError ? (
          <p
            role="alert"
            className="absolute bottom-3 right-3 z-30 rounded-md bg-destructive p-3 text-sm text-white"
          >
            {detailError}
          </p>
        ) : null}
      </div>
    </>
  )
}

function FilterSelect({
  label,
  value,
  onChange,
  options,
  allowEmpty = true,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: readonly { value: string; label: string }[]
  allowEmpty?: boolean
}) {
  return (
    <select
      aria-label={label}
      className={selectClass}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {allowEmpty ? <option value="">{label.replace('Filtrar por ', 'Todos: ')}</option> : null}
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
