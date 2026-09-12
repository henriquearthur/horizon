import { Link } from '@tanstack/react-router'
import { ChevronRight, Folder, Settings2 } from 'lucide-react'
import { useState } from 'react'
import { cn } from '~/lib/utils'
import { isIssueVisible } from '@horizon/domain'
import { hueFor } from '~/lib/tint'

/** One navigable row in the sidebar: a builtin View, a saved View or a project. */
export interface SidebarItem {
  /** Value of the `view` search param this row navigates to. */
  readonly viewParam: string
  readonly label: string
  readonly icon?: string
  /** Issue count, omitted while the Escopo has not been loaded yet. */
  readonly count?: string
}

/** A group of the Escopo, with its subgroups and projects hanging off it. */
export interface SidebarGroupItem {
  /** Full group path, e.g. `infra/platform`. */
  readonly path: string
  /** Last segment of the path, which is what the row shows. */
  readonly label: string
  /** Value of the `view` search param the group row navigates to. */
  readonly viewParam: string
  readonly count?: string
  readonly groups: readonly SidebarGroupItem[]
  readonly projects: readonly SidebarItem[]
}

export interface AppSidebarProps {
  /** Current `view` search param. */
  readonly activeView: string
  readonly views: readonly SidebarItem[]
  readonly savedViews: readonly SidebarItem[]
  readonly groups: readonly SidebarGroupItem[]
  readonly standaloneProjects?: readonly SidebarItem[]
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 pt-5 pb-1.5 text-[10px] font-semibold tracking-[0.09em] text-muted-foreground/80 uppercase first:pt-2">
      {children}
    </div>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return (
    <p className="px-2.5 pt-1 text-[11px] leading-[1.45] text-muted-foreground/80">{children}</p>
  )
}

function Count({ value, active }: { value: string | undefined; active?: boolean }) {
  if (value === undefined) return null
  return (
    <span
      className={cn(
        'flex-none font-mono text-[10.5px] tabular-nums transition-colors',
        active ? 'text-sidebar-accent-foreground/80' : 'text-muted-foreground/70',
      )}
    >
      {value}
    </span>
  )
}

/**
 * Every navigable row shares one shape: an accent bar on the left while it is
 * the active View, a soft hover, and a count that never competes with the name.
 */
const rowClass = (active: boolean) =>
  cn(
    'group relative flex items-center rounded-lg px-2.5 no-underline transition-colors duration-150 hover:no-underline',
    'before:absolute before:top-1/2 before:left-0 before:h-3.5 before:w-[2px] before:-translate-y-1/2 before:rounded-full before:bg-primary before:transition-opacity',
    active
      ? 'bg-sidebar-accent text-sidebar-accent-foreground before:opacity-100'
      : 'text-sidebar-foreground before:opacity-0 hover:bg-hover hover:text-foreground',
  )

function ViewRow({ item, active }: { item: SidebarItem; active: boolean }) {
  return (
    <Link
      to="."
      search={(previous) => ({ ...previous, view: item.viewParam })}
      aria-current={active ? 'page' : undefined}
      className={cn(rowClass(active), 'h-[30px] gap-2.5 text-[12.5px]', active && 'font-medium')}
    >
      {item.icon ? (
        <span aria-hidden className="w-3.5 text-center text-[11px] opacity-80">
          {item.icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      <Count value={item.count} active={active} />
    </Link>
  )
}

function ProjectRow({ item, active }: { item: SidebarItem; active: boolean }) {
  return (
    <Link
      to="."
      search={(previous) => ({ ...previous, view: item.viewParam })}
      aria-current={active ? 'page' : undefined}
      className={cn(rowClass(active), 'h-[26px] gap-2 font-mono text-[11.5px]')}
    >
      <span
        aria-hidden
        style={{ background: `oklch(0.64 0.12 ${hueFor(item.label)})` }}
        className="size-1.5 flex-none rounded-full opacity-80"
      />
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      <Count value={item.count} active={active} />
    </Link>
  )
}

function GroupRow({
  group,
  activeView,
  depth,
}: {
  group: SidebarGroupItem
  activeView: string
  depth: number
}) {
  const hasChildren = group.groups.length > 0 || group.projects.length > 0
  const [open, setOpen] = useState(depth === 0)
  const active = group.viewParam === activeView

  return (
    <div>
      <div className="flex items-center">
        <button
          type="button"
          onClick={() => setOpen((previous) => !previous)}
          aria-expanded={open}
          aria-label={`${open ? 'Recolher' : 'Expandir'} ${group.path}`}
          disabled={!hasChildren}
          className="flex size-[22px] flex-none items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-hover hover:text-foreground disabled:opacity-0"
        >
          <ChevronRight
            aria-hidden
            className={cn('size-3 transition-transform duration-200', open && 'rotate-90')}
          />
        </button>
        <Link
          to="."
          search={(previous) => ({ ...previous, view: group.viewParam })}
          aria-current={active ? 'page' : undefined}
          className={cn(rowClass(active), 'h-[28px] min-w-0 flex-1 gap-2 font-mono text-[11.5px]')}
        >
          <Folder aria-hidden className="size-3 flex-none opacity-60" />
          <span className="min-w-0 flex-1 truncate">{group.label}/</span>
          <Count value={group.count} active={active} />
        </Link>
      </div>
      {open && hasChildren ? (
        <div className="animate-rise ml-[21px] border-l border-sidebar-border/70 pl-1">
          {group.groups.map((child) => (
            <GroupRow key={child.path} group={child} activeView={activeView} depth={depth + 1} />
          ))}
          {group.projects.map((project) => (
            <ProjectRow
              key={project.viewParam}
              item={project}
              active={project.viewParam === activeView}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}

export function AppSidebar({
  activeView,
  views,
  savedViews,
  groups,
  standaloneProjects = [],
}: AppSidebarProps) {
  const [showEmpty, setShowEmpty] = useState(false)
  const visibleGroups = showEmpty ? groups : groups.flatMap(withIssues)
  const visibleStandaloneProjects = showEmpty
    ? standaloneProjects
    : standaloneProjects.filter((project) => Number(project.count) > 0)
  return (
    <nav
      aria-label="Navegação do Horizon"
      className="w-[238px] flex-none overflow-y-auto border-r border-sidebar-border bg-sidebar px-2.5 pt-2 pb-8"
    >
      <SectionLabel>Views</SectionLabel>
      {views.map((item) => (
        <ViewRow key={item.viewParam} item={item} active={item.viewParam === activeView} />
      ))}

      <SectionLabel>Views salvas</SectionLabel>
      {savedViews.map((item) => (
        <ViewRow key={item.viewParam} item={item} active={item.viewParam === activeView} />
      ))}
      {savedViews.length === 0 ? <Hint>Aplique filtros e salve para criar uma view.</Hint> : null}

      <SectionLabel>Grupos</SectionLabel>
      {visibleGroups.map((group) => (
        <GroupRow key={group.path} group={group} activeView={activeView} depth={0} />
      ))}
      {visibleStandaloneProjects.map((project) => (
        <ProjectRow
          key={project.viewParam}
          item={project}
          active={project.viewParam === activeView}
        />
      ))}
      {groups.length === 0 && standaloneProjects.length === 0 ? (
        <Hint>Selecione um Escopo para ver grupos e projetos.</Hint>
      ) : visibleGroups.length === 0 && visibleStandaloneProjects.length === 0 ? (
        <Hint>Nenhum grupo ou projeto tem issues.</Hint>
      ) : null}
      {groups.length > 0 || standaloneProjects.length > 0 ? (
        <label className="mt-2 flex cursor-pointer items-center gap-2 px-2.5 text-[11px] text-muted-foreground">
          <input
            type="checkbox"
            checked={showEmpty}
            onChange={(event) => setShowEmpty(event.target.checked)}
          />
          Exibir itens sem issues
        </label>
      ) : null}

      <SectionLabel>Configuração</SectionLabel>
      <Link
        to="/setup"
        className={cn(rowClass(false), 'h-[30px] gap-2.5 text-[12.5px]')}
      >
        <Settings2 aria-hidden className="size-3.5" />
        <span>Configurar Escopo</span>
      </Link>
    </nav>
  )
}

const withIssues = (group: SidebarGroupItem): readonly SidebarGroupItem[] => {
  const groups = group.groups.flatMap(withIssues)
  const projects = group.projects.filter((project) => Number(project.count) > 0)
  return Number(group.count) > 0 ? [{ ...group, groups, projects }] : []
}
