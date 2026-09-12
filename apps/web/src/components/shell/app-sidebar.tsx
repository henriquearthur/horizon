import { Link } from '@tanstack/react-router'
import { useState } from 'react'
import { cn } from '~/lib/utils'

/** One navigable row in the sidebar: a builtin View, a saved View or a project. */
export interface SidebarItem {
  /** Value of the `view` search param this row navigates to. */
  readonly viewParam: string
  readonly label: string
  readonly icon?: string
  /** Issue count, omitted while the Escopo has not been loaded yet. */
  readonly count?: string
}

export interface SidebarGroupItem {
  /** Full group path, e.g. `infra`. */
  readonly path: string
  readonly count?: string
  readonly projects: readonly SidebarItem[]
}

export interface AppSidebarProps {
  /** Current `view` search param. */
  readonly activeView: string
  readonly views: readonly SidebarItem[]
  readonly savedViews: readonly SidebarItem[]
  readonly groups: readonly SidebarGroupItem[]
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2 pt-1.5 pb-1 text-[10px] font-semibold tracking-[0.06em] text-muted-foreground uppercase">
      {children}
    </div>
  )
}

function Hint({ children }: { children: React.ReactNode }) {
  return <p className="px-2 pt-0.5 text-[11px] leading-[1.45] text-muted-foreground">{children}</p>
}

function Count({ value }: { value: string | undefined }) {
  if (value === undefined) return null
  return <span className="flex-none font-mono text-[10.5px] text-muted-foreground">{value}</span>
}

function ViewRow({ item, active }: { item: SidebarItem; active: boolean }) {
  return (
    <Link
      to="."
      search={(previous) => ({ ...previous, view: item.viewParam })}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-[29px] items-center gap-2 rounded-md px-2 text-[12.5px] no-underline hover:bg-muted hover:no-underline',
        active
          ? 'bg-sidebar-accent font-medium text-sidebar-accent-foreground'
          : 'text-sidebar-foreground',
      )}
    >
      {item.icon ? (
        <span aria-hidden className="w-3.5 text-center text-[11px] opacity-85">
          {item.icon}
        </span>
      ) : null}
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      <Count value={item.count} />
    </Link>
  )
}

function ProjectRow({ item, active }: { item: SidebarItem; active: boolean }) {
  return (
    <Link
      to="."
      search={(previous) => ({ ...previous, view: item.viewParam })}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex h-[26px] items-center gap-[7px] rounded-md px-2 font-mono text-[11.5px] no-underline hover:bg-muted hover:no-underline',
        active ? 'bg-sidebar-accent text-sidebar-accent-foreground' : 'text-sidebar-foreground',
      )}
    >
      <span className="min-w-0 flex-1 truncate">{item.label}</span>
      <Count value={item.count} />
    </Link>
  )
}

function GroupRow({ group, activeView }: { group: SidebarGroupItem; activeView: string }) {
  const [open, setOpen] = useState(true)

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((previous) => !previous)}
        aria-expanded={open}
        className="flex h-[27px] w-full items-center gap-[7px] rounded-md px-2 text-[12px] text-sidebar-foreground hover:bg-muted"
      >
        <span
          aria-hidden
          className={cn(
            'w-2.5 flex-none text-[9px] text-muted-foreground transition-transform duration-100',
            open && 'rotate-90',
          )}
        >
          ▶
        </span>
        <span className="min-w-0 flex-1 truncate text-left font-mono text-[11.5px]">
          {group.path}/
        </span>
        <Count value={group.count} />
      </button>
      {open ? (
        <div className="ml-[17px] border-l border-sidebar-border pl-[5px]">
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

export function AppSidebar({ activeView, views, savedViews, groups }: AppSidebarProps) {
  return (
    <nav
      aria-label="Navegação do Horizon"
      className="w-[226px] flex-none overflow-y-auto border-r border-sidebar-border bg-sidebar px-2 pt-2.5 pb-6"
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
      {groups.map((group) => (
        <GroupRow key={group.path} group={group} activeView={activeView} />
      ))}
      {groups.length === 0 ? <Hint>Selecione um Escopo para ver grupos e projetos.</Hint> : null}
    </nav>
  )
}
