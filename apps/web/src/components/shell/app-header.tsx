import { Search } from 'lucide-react'
import { Avatar, AvatarFallback } from '~/components/ui/avatar'
import { Input } from '~/components/ui/input'
import { ThemeToggle } from '~/components/shell/theme-toggle'
import { initialsOf } from '~/lib/initials'

export interface AppHeaderProps {
  /** Host of the configured Conexão, or `null` while none exists. */
  readonly connectionLabel: string | null
  /** Name of the Provider user behind the Conexão, or `null` while unknown. */
  readonly userName: string | null
  readonly query: string
  readonly onQueryChange: (query: string) => void
}

export function AppHeader({ connectionLabel, userName, query, onQueryChange }: AppHeaderProps) {
  return (
    <header className="flex h-12 flex-none items-center gap-3.5 border-b bg-sidebar px-3.5">
      <div className="flex w-[212px] flex-none items-center gap-[9px]">
        <div className="flex size-[22px] items-center justify-center rounded-md bg-primary text-[12px] font-bold text-primary-foreground">
          H
        </div>
        <span className="text-sm font-semibold text-foreground">Horizon</span>
        <span className="rounded-[5px] border px-[5px] py-px font-mono text-[10.5px] text-muted-foreground">
          {connectionLabel ?? 'sem conexão'}
        </span>
      </div>

      <div className="relative flex max-w-[520px] flex-1 items-center">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-2.5 size-3 text-muted-foreground"
        />
        <Input
          type="search"
          aria-label="Buscar issues, projetos, discussões"
          placeholder="Buscar issues, projetos, discussões…"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          className="h-[30px] rounded-[7px] pl-[26px] text-[12.5px] md:text-[12.5px]"
        />
      </div>

      <div className="flex-1" />

      <ThemeToggle />

      <Avatar className="size-[26px] flex-none">
        <AvatarFallback className="bg-accent text-[10.5px] font-semibold text-accent-foreground">
          {initialsOf(userName)}
        </AvatarFallback>
      </Avatar>
    </header>
  )
}
