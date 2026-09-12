import type { CSSProperties } from 'react'
import {
  STATUS_VALUES,
  readIssueProperties,
  type ProviderIssue,
  type ProviderProject,
  type ViewMode,
} from '@horizon/domain'
import { initialsOf } from '~/lib/initials'

const statusColors = ['oklch(0.62 0.02 286)', 'oklch(0.72 0.14 80)', 'oklch(0.65 0.15 152)']
const labelHues: Record<string, number> = {
  incident: 25,
  security: 15,
  terraform: 274,
  kubernetes: 240,
  ci: 152,
  observability: 205,
  'needs-review': 80,
  'tech-debt': 300,
  agent: 325,
  networking: 225,
  cost: 152,
  runbook: 280,
}

function tintStyle(hue: number): CSSProperties {
  return {
    '--chip-dark-bg': `oklch(0.28 0.055 ${hue})`,
    '--chip-dark-fg': `oklch(0.82 0.10 ${hue})`,
    '--chip-light-bg': `oklch(0.951 0.035 ${hue})`,
    '--chip-light-fg': `oklch(0.45 0.14 ${hue})`,
  } as CSSProperties
}

function IssueLabels({ issue }: { issue: ProviderIssue }) {
  return issue.labels
    .filter((label) => !label.startsWith('horizon::'))
    .map((label) => (
      <span
        key={label}
        style={tintStyle(labelHues[label] ?? 286)}
        className="shrink-0 whitespace-nowrap rounded-[5px] bg-[var(--chip-light-bg)] px-[6px] py-[1.5px] text-[10px] font-medium leading-normal text-[var(--chip-light-fg)] dark:bg-[var(--chip-dark-bg)] dark:text-[var(--chip-dark-fg)]"
      >
        {label}
      </span>
    ))
}

function Assignee({ issue, card = false }: { issue: ProviderIssue; card?: boolean }) {
  const user = issue.assignees[0]
  const name = user?.name ?? user?.username
  return (
    <span
      title={name ?? 'Não atribuído'}
      aria-label={name ?? 'Não atribuído'}
      className={`flex shrink-0 items-center justify-center rounded-full bg-accent font-sans font-semibold text-accent-foreground ${card ? 'size-[19px] text-[9px]' : 'size-[21px] text-[9.5px]'}`}
    >
      {initialsOf(name)}
    </span>
  )
}

function Priority({ issue }: { issue: ProviderIssue }) {
  const properties = readIssueProperties(issue)
  const priority = properties.priority?.split(' ')[0]
  return (
    <span
      title={properties.priority ?? 'Sem prioridade'}
      className={`font-mono font-medium ${priority === 'P1' ? 'text-destructive' : 'text-muted-foreground'}`}
    >
      {properties.conflicts.status || properties.conflicts.priority
        ? '⚠ Conflito'
        : properties.conflicts.priority
          ? '⚠'
          : priority === 'Sem'
            ? '—'
            : (priority ?? '—')}
    </span>
  )
}

function issueCode(issue: ProviderIssue, project?: ProviderProject) {
  if (!project) return `#${issue.iid}`
  const parts = project.path.split('-').filter(Boolean)
  const prefix = parts.length > 1 ? parts.map((part) => part[0]).join('') : project.path.slice(0, 2)
  return `${prefix.toUpperCase()}-${issue.iid}`
}

function updatedLabel(value?: string) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' }).format(date)
}

export function IssueViews({
  mode,
  issues,
  projects,
  onOpen,
  groups,
}: {
  mode: ViewMode
  issues: readonly ProviderIssue[]
  projects: readonly ProviderProject[]
  onOpen: (issue: ProviderIssue) => void
  groups?: ReadonlyMap<string, readonly ProviderIssue[]>
}) {
  const projectById = new Map(projects.map((project) => [project.id, project]))
  const pathFor = (issue: ProviderIssue) => {
    const project = projectById.get(issue.projectId)
    return project ? `${project.namespace}/${project.path}` : `Projeto ${issue.projectId}`
  }
  if (mode === 'kanban') {
    return (
      <div className="h-full overflow-auto px-4 pb-5 pt-[14px]">
        <div className="flex min-h-full items-start gap-[14px]">
          {STATUS_VALUES.map((status, index) => {
            const cards = issues.filter((issue) => readIssueProperties(issue).status === status)
            return (
              <section
                key={status}
                aria-label={status}
                className="flex min-w-[236px] flex-1 flex-col gap-[9px] rounded-[10px] border border-dashed border-transparent bg-secondary p-[9px]"
              >
                <header className="flex items-center gap-[7px] px-1 py-px">
                  <span
                    className="size-[7px] rounded-full"
                    style={{ background: statusColors[index] }}
                  />
                  <h2 className="text-xs font-semibold">{status}</h2>
                  <span className="font-mono text-[10.5px] text-muted-foreground">
                    {cards.length}
                  </span>
                </header>
                {cards.map((issue) => (
                  <button
                    key={issue.id}
                    type="button"
                    onClick={() => onOpen(issue)}
                    className="flex flex-col gap-[7px] rounded-[9px] border border-transparent bg-card px-[11px] py-[10px] text-left hover:border-primary focus-visible:outline-2 focus-visible:outline-primary"
                  >
                    <div className="flex w-full min-w-0 items-center gap-[7px] font-mono text-[10px] text-muted-foreground">
                      <span className="min-w-0 flex-1 truncate">{pathFor(issue)}</span>
                      <span className="shrink-0">
                        {issueCode(issue, projectById.get(issue.projectId))}
                      </span>
                    </div>
                    <div className="text-pretty text-[12.5px] font-medium leading-[1.38]">
                      {issue.title}
                    </div>
                    <div className="flex flex-wrap items-center gap-[5px]">
                      <IssueLabels issue={issue} />
                    </div>
                    <div className="flex w-full items-center gap-2 font-mono text-[10px] text-muted-foreground">
                      <Priority issue={issue} />
                      <span className="flex-1" />
                      <Assignee issue={issue} card />
                    </div>
                  </button>
                ))}
                {!cards.length && (
                  <p className="px-2 py-[18px] text-center text-[11.5px] text-muted-foreground">
                    Arraste um issue para cá
                  </p>
                )}
              </section>
            )
          })}
        </div>
      </div>
    )
  }
  if (!issues.length)
    return (
      <p className="px-5 py-[60px] text-center text-[12.5px] text-muted-foreground">
        Nenhum issue corresponde a esses filtros.
      </p>
    )
  const sections = groups?.size ? [...groups] : [['', issues] as const]
  return (
    <div>
      {sections.map(([name, items]) => {
        const project = projectById.get(Number(name))
        return (
          <section key={name}>
            {name && name !== 'Todos' && (
              <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background px-4 pb-[5px] pt-[9px]">
                <h2 className="font-mono text-[11px] font-medium">
                  {project ? `${project.namespace}/${project.path}` : name}
                </h2>
                <span className="font-mono text-[10.5px] text-muted-foreground">
                  {items.length}
                </span>
              </header>
            )}
            {items.map((issue) => {
              const properties = readIssueProperties(issue)
              const updated = updatedLabel(issue.updatedAt)
              return (
                <button
                  key={issue.id}
                  type="button"
                  onClick={() => onOpen(issue)}
                  className="flex w-full items-start gap-[10px] border-b border-l-2 border-l-transparent py-[9px] pl-3 pr-4 text-left hover:bg-muted focus-visible:bg-muted"
                >
                  <span
                    className="mt-[5px] size-[7px] shrink-0 rounded-full"
                    style={{ background: statusColors[STATUS_VALUES.indexOf(properties.status)] }}
                  />
                  <div className="flex min-w-0 flex-1 flex-col gap-[3px]">
                    <div className="flex min-w-0 items-center gap-[7px]">
                      <span className="min-w-0 flex-1 truncate text-[13px] font-medium">
                        {issue.title}
                      </span>
                      <div className="flex max-w-[45%] items-center gap-[7px] overflow-hidden">
                        <IssueLabels issue={issue} />
                      </div>
                    </div>
                    <div className="flex min-w-0 items-center gap-[7px] font-mono text-[10.5px] text-muted-foreground">
                      <span className="truncate">{pathFor(issue)}</span>
                      <span className="shrink-0">
                        {issueCode(issue, projectById.get(issue.projectId))}
                      </span>
                      {updated && (
                        <>
                          <span>·</span>
                          <time className="shrink-0" dateTime={issue.updatedAt}>
                            {updated}
                          </time>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-2 pt-px text-[10.5px]">
                    <Priority issue={issue} />
                    <Assignee issue={issue} />
                  </div>
                </button>
              )
            })}
          </section>
        )
      })}
    </div>
  )
}
