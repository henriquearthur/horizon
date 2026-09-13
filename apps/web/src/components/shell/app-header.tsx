import { useEffect, useMemo, useRef, useState } from 'react'
import { Search, X } from 'lucide-react'
import type { ProviderGroup, ProviderIssue, ProviderProject } from '@horizon/domain'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { HorizonMark } from '~/components/shell/horizon-mark'
import { ThemeToggle } from '~/components/shell/theme-toggle'
import { AccentPicker } from '~/components/shell/accent-picker'
import { UserAvatar } from '~/components/issue/issue-chrome'

export interface AppHeaderProps {
  /** Name of the Provider user behind the Conexão, or `null` while unknown. */
  readonly userName: string | null
  /** Avatar of the Provider user, when the Provider published one. */
  readonly userAvatarUrl?: string | undefined
  readonly query: string
  readonly onQueryChange: (query: string) => void
  readonly issues?: readonly ProviderIssue[]
  readonly groups?: readonly ProviderGroup[]
  readonly projects?: readonly ProviderProject[]
  readonly onNavigate?: (target: GlobalSearchTarget) => void
}

export type GlobalSearchTarget =
  | { readonly kind: 'issue'; readonly projectId: number; readonly iid: number }
  | { readonly kind: 'group' | 'project'; readonly path: string }
  | { readonly kind: 'action'; readonly id: 'inbox' | 'scope' }

export function AppHeader({
  userName,
  userAvatarUrl,
  query,
  onQueryChange,
  issues = [],
  groups = [],
  projects = [],
  onNavigate,
}: AppHeaderProps) {
  const [open, setOpen] = useState(false)
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'k' || (!event.metaKey && !event.ctrlKey)) return
      event.preventDefault()
      setOpen(true)
      queueMicrotask(() => input.current?.focus())
    }
    globalThis.addEventListener('keydown', shortcut)
    return () => globalThis.removeEventListener('keydown', shortcut)
  }, [])
  const normalized = query.trim().toLocaleLowerCase()
  const results = useMemo(() => {
    if (!normalized) return []
    const contains = (value: string) => value.toLocaleLowerCase().includes(normalized)
    return [
      ...issues
        .filter((issue) => contains(issue.title))
        .map((issue) => ({
          key: `issue:${issue.projectId}:${issue.iid}`,
          label: `#${issue.iid} ${issue.title}`,
          type: 'Issue',
          target: { kind: 'issue', projectId: issue.projectId, iid: issue.iid } as const,
        })),
      ...groups
        .filter((group) => contains(group.fullPath))
        .map((group) => ({
          key: `group:${group.id}`,
          label: group.fullPath,
          type: group.fullPath.includes('/') ? 'Subgrupo' : 'Grupo',
          target: { kind: 'group', path: group.fullPath } as const,
        })),
      ...projects
        .filter((project) => contains(`${project.namespace}/${project.path}`))
        .map((project) => ({
          key: `project:${project.id}`,
          label: `${project.namespace}/${project.path}`,
          type: 'Projeto',
          target: { kind: 'project', path: `${project.namespace}/${project.path}` } as const,
        })),
      ...[
        {
          key: 'action:inbox',
          label: 'Ir para Inbox',
          type: 'Ação',
          target: { kind: 'action', id: 'inbox' } as const,
        },
        {
          key: 'action:scope',
          label: 'Configurar escopo',
          type: 'Ação',
          target: { kind: 'action', id: 'scope' } as const,
        },
      ].filter((item) => contains(item.label)),
    ].slice(0, 12)
  }, [groups, issues, normalized, projects])
  const choose = (target: GlobalSearchTarget) => {
    setOpen(false)
    onQueryChange('')
    onNavigate?.(target)
  }
  return (
    <header className="flex h-13 flex-none items-center gap-4 border-b bg-sidebar px-4">
      <div className="flex w-[214px] flex-none items-center gap-2.5">
        <HorizonMark className="size-6 flex-none rounded-[7px] shadow-xs" />
        <span className="text-[14.5px] font-semibold tracking-tight text-foreground">Horizon</span>
      </div>

      <div className="relative flex max-w-[540px] flex-1 items-center">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 size-3.5 text-muted-foreground"
        />
        <Input
          ref={input}
          type="search"
          aria-label="Buscar issues, projetos, discussões"
          placeholder="Buscar issues, projetos, discussões…"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          onFocus={() => setOpen(true)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setOpen(false)
            if (event.key === 'Enter' && results[0]) choose(results[0].target)
          }}
          className="h-8 rounded-full pr-9 pl-9 text-[12.5px]"
        />
        {query ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            aria-label="Limpar busca"
            onClick={() => onQueryChange('')}
            className="absolute right-1.5 rounded-full text-muted-foreground"
          >
            <X />
          </Button>
        ) : null}
        {open && query ? (
          <div
            role="listbox"
            aria-label="Resultados da busca global"
            className="absolute top-10 z-70 max-h-80 w-full overflow-auto rounded-xl border bg-popover p-1 shadow-lg"
          >
            {results.length ? (
              results.map((result) => (
                <button
                  key={result.key}
                  type="button"
                  role="option"
                  aria-selected="false"
                  onClick={() => choose(result.target)}
                  className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-sm hover:bg-accent"
                >
                  <span>{result.label}</span>
                  <span className="text-xs text-muted-foreground">{result.type}</span>
                </button>
              ))
            ) : (
              <p className="px-3 py-4 text-sm text-muted-foreground">Nenhum resultado.</p>
            )}
          </div>
        ) : null}
      </div>

      <div className="flex-1" />

      <AccentPicker />
      <ThemeToggle />

      <UserAvatar
        user={
          userName
            ? {
                id: 0,
                username: userName,
                name: userName,
                ...(userAvatarUrl ? { avatarUrl: userAvatarUrl } : {}),
              }
            : undefined
        }
        size="lg"
      />
    </header>
  )
}
