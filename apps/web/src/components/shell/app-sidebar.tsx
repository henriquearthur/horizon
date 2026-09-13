import { ChevronRight, Folder, FolderKanban, Settings2, Star } from 'lucide-react'
import { useState } from 'react'
import { Link } from '@tanstack/react-router'
import { cn } from '~/lib/utils'
import { hueFor } from '~/lib/tint'
import { Switch } from '~/components/ui/switch'

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
  readonly onConfigureScope?: () => void
  /** Projetos of the deployment, each linking to its cross-repository View. */
  readonly initiatives?: readonly SidebarItem[]
  readonly onManageInitiatives?: () => void
  readonly favorites?: readonly string[]
  readonly onToggleFavorite?: (viewParam: string) => void
}

function FavoriteButton({
  item,
  favorite,
  onToggle,
}: {
  item: SidebarItem
  favorite: boolean
  onToggle: (viewParam: string) => void
}) {
  return (
    <button
      type="button"
      aria-label={`${favorite ? 'Desfavoritar' : 'Favoritar'} ${item.label}`}
      onClick={(event) => {
        event.preventDefault()
        event.stopPropagation()
        onToggle(item.viewParam)
      }}
      className="ml-1 rounded p-1 text-muted-foreground/60 hover:bg-hover hover:text-foreground"
    >
      <Star aria-hidden className={cn('size-3', favorite && 'fill-current text-amber-500')} />
    </button>
  )
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
      search={(previous) => ({
        ...previous,
        view: item.viewParam === 'general' ? undefined : item.viewParam,
      })}
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

function ProjectRow({
  item,
  active,
  favorite,
  onToggle,
}: {
  item: SidebarItem
  active: boolean
  favorite?: boolean | undefined
  onToggle?: ((viewParam: string) => void) | undefined
}) {
  return (
    <div className="flex items-center">
      <Link
        to="."
        search={(previous) => ({ ...previous, view: item.viewParam })}
        aria-current={active ? 'page' : undefined}
        className={cn(rowClass(active), 'h-[26px] min-w-0 flex-1 gap-2 font-mono text-[11.5px]')}
      >
        <span
          aria-hidden
          style={{ background: `oklch(0.64 0.12 ${hueFor(item.label)})` }}
          className="size-1.5 flex-none rounded-full opacity-80"
        />
        <span className="min-w-0 flex-1 truncate">{item.label}</span>
        <Count value={item.count} active={active} />
      </Link>
      {onToggle ? (
        <FavoriteButton item={item} favorite={Boolean(favorite)} onToggle={onToggle} />
      ) : null}
    </div>
  )
}

function GroupRow({
  group,
  activeView,
  depth,
  favorites,
  onToggleFavorite,
}: {
  group: SidebarGroupItem
  activeView: string
  depth: number
  favorites?: readonly string[] | undefined
  onToggleFavorite?: ((viewParam: string) => void) | undefined
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
        {onToggleFavorite ? (
          <FavoriteButton
            item={{ viewParam: group.viewParam, label: `${group.label}/` }}
            favorite={favorites?.includes(group.viewParam) ?? false}
            onToggle={onToggleFavorite}
          />
        ) : null}
      </div>
      {open && hasChildren ? (
        <div className="animate-rise ml-[21px] border-l border-sidebar-border/70 pl-1">
          {group.groups.map((child) => (
            <GroupRow
              key={child.path}
              group={child}
              activeView={activeView}
              depth={depth + 1}
              favorites={favorites}
              onToggleFavorite={onToggleFavorite}
            />
          ))}
          {group.projects.map((project) => (
            <ProjectRow
              key={project.viewParam}
              item={project}
              active={project.viewParam === activeView}
              favorite={favorites?.includes(project.viewParam)}
              onToggle={onToggleFavorite}
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
  onConfigureScope,
  initiatives = [],
  onManageInitiatives,
  favorites = [],
  onToggleFavorite,
}: AppSidebarProps) {
  const [showEmpty, setShowEmpty] = useState(false)
  const visibleGroups = showEmpty ? groups : groups.flatMap(withIssues)
  const visibleStandaloneProjects = showEmpty
    ? standaloneProjects
    : standaloneProjects.filter((project) => Number(project.count) > 0)
  const allItems: SidebarItem[] = []
  const collect = (group: SidebarGroupItem) => {
    allItems.push({ viewParam: group.viewParam, label: `${group.label}/`, icon: '▰' })
    group.groups.forEach(collect)
    allItems.push(...group.projects)
  }
  groups.forEach(collect)
  allItems.push(...standaloneProjects)
  const favoriteItems = favorites
    .map((viewParam) => allItems.find((item) => item.viewParam === viewParam))
    .filter((item): item is SidebarItem => Boolean(item))
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

      <SectionLabel>Projetos</SectionLabel>
      {initiatives.map((item) => (
        <ViewRow key={item.viewParam} item={item} active={item.viewParam === activeView} />
      ))}
      {initiatives.length === 0 ? (
        <Hint>Um Projeto reúne issues de vários repositórios.</Hint>
      ) : null}
      {onManageInitiatives ? (
        <button
          type="button"
          onClick={onManageInitiatives}
          className={cn(rowClass(false), 'h-[28px] w-full gap-2.5 text-[12px]')}
        >
          <FolderKanban aria-hidden className="size-3.5" />
          <span>Gerenciar Projetos</span>
        </button>
      ) : null}

      <SectionLabel>Favoritos</SectionLabel>
      {favoriteItems.map((item) => (
        <div key={item.viewParam} className="flex items-center">
          <div className="min-w-0 flex-1">
            <ViewRow item={item} active={item.viewParam === activeView} />
          </div>
          <FavoriteButton item={item} favorite onToggle={onToggleFavorite ?? (() => {})} />
        </div>
      ))}
      {favoriteItems.length === 0 ? (
        <Hint>Favorite grupos e projetos para acesso rápido.</Hint>
      ) : null}

      <SectionLabel>Grupos</SectionLabel>
      {groups.length > 0 || standaloneProjects.length > 0 ? (
        <label className="mb-2 flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-sidebar-border/70 bg-background/45 px-2.5 py-2 text-[11px] leading-tight text-muted-foreground">
          <span>Exibir itens sem issues</span>
          <Switch
            checked={showEmpty}
            onCheckedChange={setShowEmpty}
            aria-label="Exibir itens sem issues"
          />
        </label>
      ) : null}
      {visibleGroups.map((group) => (
        <GroupRow
          key={group.path}
          group={group}
          activeView={activeView}
          depth={0}
          favorites={favorites}
          onToggleFavorite={onToggleFavorite}
        />
      ))}
      {visibleStandaloneProjects.map((project) => (
        <ProjectRow
          key={project.viewParam}
          item={project}
          active={project.viewParam === activeView}
          favorite={favorites?.includes(project.viewParam)}
          onToggle={onToggleFavorite}
        />
      ))}
      {groups.length === 0 && standaloneProjects.length === 0 ? (
        <Hint>Selecione um Escopo para ver grupos e projetos.</Hint>
      ) : visibleGroups.length === 0 && visibleStandaloneProjects.length === 0 ? (
        <Hint>Nenhum grupo ou projeto tem issues.</Hint>
      ) : null}
      <SectionLabel>Configuração</SectionLabel>
      <button
        type="button"
        onClick={onConfigureScope}
        className={cn(rowClass(false), 'h-[30px] w-full gap-2.5 text-[12.5px]')}
      >
        <Settings2 aria-hidden className="size-3.5" />
        <span>Configurar Escopo</span>
      </button>
    </nav>
  )
}

const withIssues = (group: SidebarGroupItem): readonly SidebarGroupItem[] => {
  const groups = group.groups.flatMap(withIssues)
  const projects = group.projects.filter((project) => Number(project.count) > 0)
  return Number(group.count) > 0 ? [{ ...group, groups, projects }] : []
}
