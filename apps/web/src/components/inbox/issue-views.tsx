import { useState } from 'react'
import {
  STATUS_VALUES,
  readIssueProperties,
  type IssueStatus,
  type ProviderIssue,
  type ProviderProject,
  type ViewMode,
} from '@horizon/domain'
import { ChevronDown, GitMerge, ListTree } from 'lucide-react'
import {
  AssigneeStack,
  LabelChip,
  LabelOverflow,
  MetaCount,
  PriorityBadge,
  StatusDot,
  IssueStatusMenu,
} from '~/components/issue/issue-chrome'
import {
  issueCode,
  projectPath,
  relativeTime,
  absoluteTime,
  visibleLabels,
} from '~/lib/issue-presentation'
import { cn } from '~/lib/utils'

export interface IssueViewsProps {
  readonly mode: ViewMode
  readonly issues: readonly ProviderIssue[]
  readonly projects: readonly ProviderProject[]
  readonly onOpen: (issue: ProviderIssue) => void
  readonly groups?: ReadonlyMap<string, readonly ProviderIssue[]>
  /** Issue currently open in the detail panel, highlighted in place. */
  readonly selectedId?: number | undefined
  /** Called when a card is dropped on another Kanban column. */
  readonly onStatusChange?: (issue: ProviderIssue, status: IssueStatus) => void
  /** Sub-issues rolled up under each Issue, keyed by `projectId:iid`. */
  readonly childrenOf?: ReadonlyMap<string, readonly ProviderIssue[]>
}

export const issueKey = (issue: Pick<ProviderIssue, 'projectId' | 'iid'>): string =>
  `${issue.projectId}:${issue.iid}`

const LIST_LABEL_LIMIT = 2
const CARD_LABEL_LIMIT = 3

function IssueLabels({ labels, limit }: { labels: readonly string[]; limit: number }) {
  const shown = labels.slice(0, limit)
  return (
    <>
      {shown.map((label) => (
        <LabelChip key={label} label={label} />
      ))}
      {labels.length > limit ? <LabelOverflow count={labels.length - limit} /> : null}
    </>
  )
}

function IssueMeta({
  issue,
  path,
  code,
  className,
  childCount = 0,
  doneChildren = 0,
}: {
  issue: ProviderIssue
  path?: string
  code?: string
  className?: string
  childCount?: number
  doneChildren?: number
}) {
  const created = issue.createdAt ? relativeTime(issue.createdAt) : undefined
  return (
    <div
      className={cn(
        'flex min-w-0 items-center gap-2 font-mono text-[10.5px] text-muted-foreground',
        className,
      )}
    >
      {path ? <span className="truncate">{path}</span> : null}
      {code ? <span className="flex-none font-medium text-muted-foreground/90">{code}</span> : null}
      {created ? (
        <>
          <span aria-hidden className="flex-none opacity-50">
            ·
          </span>
          <time
            className="flex-none whitespace-nowrap"
            dateTime={issue.createdAt}
            title={absoluteTime(issue.createdAt)}
          >
            {created}
          </time>
        </>
      ) : null}
      <MetaCount
        icon={<GitMerge aria-hidden className="size-3" />}
        value={issue.mergeRequestCount ?? 0}
        label={`${issue.mergeRequestCount} merge request(s) vinculado(s)`}
        className="text-primary"
      />
      {childCount ? (
        <span
          title={`${childCount} sub-issue(s)`}
          className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-1.5 py-px text-[10px] tabular-nums text-muted-foreground"
        >
          <ListTree aria-hidden className="size-3" />
          {doneChildren}/{childCount}
        </span>
      ) : null}
    </div>
  )
}

function IssueRow({
  issue,
  path,
  code,
  selected,
  onOpen,
  childCount = 0,
  doneChildren = 0,
  expanded,
  onToggle,
  depth = 0,
  onStatusChange,
}: {
  issue: ProviderIssue
  path: string
  code: string
  selected: boolean
  onOpen: () => void
  childCount?: number
  doneChildren?: number
  expanded?: boolean
  onToggle?: () => void
  depth?: number
  onStatusChange?: (status: IssueStatus) => void
}) {
  const properties = readIssueProperties(issue)
  const labels = visibleLabels(issue.labels)

  return (
    <div
      className="relative flex items-start"
      style={depth ? { paddingLeft: `${depth * 22}px` } : undefined}
    >
      {childCount ? (
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Recolher' : 'Expandir'} sub-issues de ${issue.title}`}
          className="mt-[9px] flex size-5 flex-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
        >
          <ChevronDown
            aria-hidden
            className={cn('size-3.5 transition-transform duration-150', !expanded && '-rotate-90')}
          />
        </button>
      ) : (
        <span aria-hidden className="size-5 flex-none" />
      )}
      <button
        type="button"
        onClick={onOpen}
        aria-current={selected ? 'true' : undefined}
        className={cn(
          'group relative flex min-w-0 flex-1 cursor-pointer items-start gap-3 rounded-xl py-2.5 pr-3 pl-2 text-left transition-colors duration-150',
          'before:absolute before:top-1/2 before:left-0 before:h-6 before:w-[2.5px] before:-translate-y-1/2 before:rounded-full before:bg-primary before:transition-opacity',
          selected
            ? 'bg-accent/70 before:opacity-100'
            : 'before:opacity-0 hover:bg-hover focus-visible:bg-hover',
        )}
      >
        {onStatusChange ? (
          <IssueStatusMenu
            status={properties.status}
            conflict={properties.conflicts.status}
            onChange={onStatusChange}
            className="-ml-1"
          />
        ) : (
          <StatusDot
            status={properties.status}
            conflict={properties.conflicts.status}
            className="mt-[5px]"
          />
        )}
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="min-w-0 flex-1 truncate text-[13.5px] leading-snug font-medium text-foreground">
              {issue.title}
            </span>
            <div className="hidden max-w-[42%] shrink-0 items-center gap-1.5 sm:flex">
              <IssueLabels labels={labels} limit={LIST_LABEL_LIMIT} />
            </div>
          </div>
          <IssueMeta
            issue={issue}
            path={path}
            code={code}
            childCount={childCount}
            doneChildren={doneChildren}
          />
        </div>
        <div className="flex shrink-0 items-center gap-2.5 pt-0.5">
          <PriorityBadge priority={properties.priority} conflict={properties.conflicts.priority} />
          <AssigneeStack users={issue.assignees} />
        </div>
      </button>
    </div>
  )
}

function IssueCard({
  issue,
  path,
  code,
  selected,
  dragging,
  onOpen,
  onDragStart,
  onDragEnd,
  draggable,
  childCount = 0,
  doneChildren = 0,
  onStatusChange,
}: {
  issue: ProviderIssue
  path: string
  code: string
  selected: boolean
  dragging: boolean
  onOpen: () => void
  onDragStart: () => void
  onDragEnd: () => void
  draggable: boolean
  childCount?: number
  doneChildren?: number
  onStatusChange?: (status: IssueStatus) => void
}) {
  const properties = readIssueProperties(issue)
  const labels = visibleLabels(issue.labels)

  return (
    <button
      type="button"
      draggable={draggable}
      onDragStart={(event) => {
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', String(issue.id))
        onDragStart()
      }}
      onDragEnd={onDragEnd}
      onClick={onOpen}
      aria-current={selected ? 'true' : undefined}
      className={cn(
        'flex w-full cursor-pointer flex-col gap-2 rounded-xl border bg-card px-3 py-2.5 text-left shadow-xs transition-all duration-200',
        draggable && 'cursor-grab active:cursor-grabbing',
        'hover:-translate-y-px hover:border-ring/50 hover:shadow-md',
        selected && 'border-primary shadow-md ring-1 ring-primary/30',
        dragging && 'scale-[0.98] opacity-40',
      )}
    >
      <div className="flex min-w-0 items-center gap-2 font-mono text-[10px] text-muted-foreground">
        {onStatusChange ? (
          <IssueStatusMenu
            status={properties.status}
            conflict={properties.conflicts.status}
            onChange={onStatusChange}
            className="-m-1 size-5"
          />
        ) : (
          <StatusDot
            status={properties.status}
            conflict={properties.conflicts.status}
            className="size-1.5"
          />
        )}
        <span className="min-w-0 flex-1 truncate">{path}</span>
        <span className="flex-none font-medium">{code}</span>
      </div>
      <div className="text-[12.5px] leading-[1.4] font-medium text-pretty text-foreground">
        {issue.title}
      </div>
      {labels.length ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <IssueLabels labels={labels} limit={CARD_LABEL_LIMIT} />
        </div>
      ) : null}
      <div className="flex items-center gap-2.5 border-t border-border/60 pt-2">
        <PriorityBadge priority={properties.priority} conflict={properties.conflicts.priority} />
        <IssueMeta
          issue={issue}
          className="gap-2 text-[10px]"
          childCount={childCount}
          doneChildren={doneChildren}
        />
        <div className="flex-1" />
        <AssigneeStack users={issue.assignees} size="xs" />
      </div>
    </button>
  )
}

const doneCount = (issues: readonly ProviderIssue[]): number =>
  issues.filter((issue) => readIssueProperties(issue).status === 'Concluído').length

export function IssueViews({
  mode,
  issues,
  projects,
  onOpen,
  groups,
  selectedId,
  onStatusChange,
  childrenOf,
}: IssueViewsProps) {
  const [dragging, setDragging] = useState<number>()
  const [dragOver, setDragOver] = useState<string>()
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set())
  const projectById = new Map(projects.map((project) => [project.id, project]))
  const pathFor = (issue: ProviderIssue) =>
    projectPath(projectById.get(issue.projectId), issue.projectId)
  const codeFor = (issue: ProviderIssue) => issueCode(issue, projectById.get(issue.projectId))
  const childrenFor = (issue: ProviderIssue) => childrenOf?.get(issueKey(issue)) ?? []
  const toggle = (key: string) =>
    setExpanded((current) => {
      const next = new Set(current)
      if (!next.delete(key)) next.add(key)
      return next
    })

  if (mode === 'kanban') {
    const canDrag = Boolean(onStatusChange)
    // The Kanban is split by repository: one board per project, so a column
    // never mixes work from repositories that have nothing to do with each other.
    const lanes = [
      ...issues.reduce((map, issue) => {
        map.set(issue.projectId, [...(map.get(issue.projectId) ?? []), issue])
        return map
      }, new Map<number, ProviderIssue[]>()),
    ].sort((left, right) =>
      projectPath(projectById.get(left[0]), left[0]).localeCompare(
        projectPath(projectById.get(right[0]), right[0]),
      ),
    )

    return (
      <div className="h-full overflow-auto px-5 pt-4 pb-6">
        {lanes.map(([projectId, laneIssues]) => (
          <section key={projectId} className="mb-7 last:mb-0">
            <header className="mb-2.5 flex items-center gap-2">
              <h2 className="font-mono text-[11.5px] font-semibold tracking-tight text-foreground">
                {projectPath(projectById.get(projectId), projectId)}
              </h2>
              <span className="rounded-full bg-muted px-1.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                {laneIssues.length}
              </span>
              <span className="h-px flex-1 bg-border" />
            </header>
            <div className="flex items-start gap-4">
              {STATUS_VALUES.map((status) => {
                const cards = laneIssues.filter(
                  (issue) => readIssueProperties(issue).status === status,
                )
                const dropKey = `${projectId}:${status}`
                const over = dragOver === dropKey
                return (
                  <section
                    key={status}
                    aria-label={`${projectPath(projectById.get(projectId), projectId)} · ${status}`}
                    onDragOver={(event) => {
                      if (!canDrag || dragging === undefined) return
                      event.preventDefault()
                      event.dataTransfer.dropEffect = 'move'
                      if (!over) setDragOver(dropKey)
                    }}
                    onDragLeave={(event) => {
                      if (event.currentTarget.contains(event.relatedTarget as Node | null)) return
                      if (over) setDragOver(undefined)
                    }}
                    onDrop={(event) => {
                      event.preventDefault()
                      const dropped = issues.find((issue) => issue.id === dragging)
                      setDragging(undefined)
                      setDragOver(undefined)
                      if (dropped && readIssueProperties(dropped).status !== status)
                        onStatusChange?.(dropped, status)
                    }}
                    className={cn(
                      'flex min-w-[250px] flex-1 flex-col gap-2.5 rounded-2xl border border-dashed p-2.5 transition-colors duration-200',
                      over
                        ? 'border-primary bg-accent/60'
                        : 'border-transparent bg-muted/60 dark:bg-muted/40',
                    )}
                  >
                    <header className="flex items-center gap-2 px-1.5 py-0.5">
                      <StatusDot status={status} />
                      <h3 className="text-[12px] font-semibold text-foreground">{status}</h3>
                      <span className="font-mono text-[10.5px] tabular-nums text-muted-foreground">
                        {cards.length}
                      </span>
                    </header>
                    {cards.map((issue) => (
                      <IssueCard
                        key={issue.id}
                        issue={issue}
                        path={pathFor(issue)}
                        code={codeFor(issue)}
                        selected={issue.id === selectedId}
                        dragging={dragging === issue.id}
                        draggable={canDrag}
                        childCount={childrenFor(issue).length}
                        doneChildren={doneCount(childrenFor(issue))}
                        onOpen={() => onOpen(issue)}
                        onDragStart={() => setDragging(issue.id)}
                        onDragEnd={() => {
                          setDragging(undefined)
                          setDragOver(undefined)
                        }}
                        onStatusChange={(status) => onStatusChange?.(issue, status)}
                      />
                    ))}
                    {!cards.length && (
                      <p
                        className={cn(
                          'rounded-xl border border-dashed px-2 py-5 text-center text-[11.5px] transition-colors',
                          over
                            ? 'border-primary text-primary'
                            : 'border-border/70 text-muted-foreground',
                        )}
                      >
                        {canDrag ? 'Arraste um issue para cá' : 'Nada aqui'}
                      </p>
                    )}
                  </section>
                )
              })}
            </div>
          </section>
        ))}
        {!lanes.length ? (
          <p className="px-5 py-[60px] text-center text-[12.5px] text-muted-foreground">
            Nenhum issue corresponde a esses filtros.
          </p>
        ) : null}
      </div>
    )
  }

  if (!issues.length)
    return (
      <p className="px-5 py-[60px] text-center text-[12.5px] text-muted-foreground">
        Nenhum issue corresponde a esses filtros.
      </p>
    )

  const renderRow = (issue: ProviderIssue, depth = 0) => {
    const children = childrenFor(issue)
    const key = issueKey(issue)
    const open = expanded.has(key)
    return (
      <div key={issue.id}>
        <IssueRow
          issue={issue}
          path={pathFor(issue)}
          code={codeFor(issue)}
          selected={issue.id === selectedId}
          onOpen={() => onOpen(issue)}
          childCount={children.length}
          doneChildren={doneCount(children)}
          expanded={open}
          onToggle={() => toggle(key)}
          depth={depth}
          onStatusChange={(status) => onStatusChange?.(issue, status)}
        />
        {open ? children.map((child) => renderRow(child, depth + 1)) : null}
      </div>
    )
  }

  const sections = groups?.size ? [...groups] : [['', issues] as const]
  return (
    <div className="px-2 pb-6">
      {sections.map(([name, items]) => {
        const project = projectById.get(Number(name))
        const heading = project ? `${project.namespace}/${project.path}` : name
        return (
          <section key={name}>
            {name && name !== 'Todos' && (
              <header className="sticky top-0 z-10 -mx-2 mb-0.5 flex items-center gap-2 border-b bg-background/85 px-5 pt-3 pb-1.5 backdrop-blur-sm">
                <h2 className="font-mono text-[11px] font-semibold tracking-tight text-foreground">
                  {heading}
                </h2>
                <span className="rounded-full bg-muted px-1.5 font-mono text-[10px] tabular-nums text-muted-foreground">
                  {items.length}
                </span>
              </header>
            )}
            <div className="pt-1">{items.map((issue) => renderRow(issue))}</div>
          </section>
        )
      })}
    </div>
  )
}
