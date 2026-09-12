import { Search, X } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Tooltip, TooltipContent, TooltipTrigger } from '~/components/ui/tooltip'
import { HorizonMark } from '~/components/shell/horizon-mark'
import { ThemeToggle } from '~/components/shell/theme-toggle'
import { UserAvatar } from '~/components/issue/issue-chrome'

export interface AppHeaderProps {
  /** Host of the configured Conexão, or `null` while none exists. */
  readonly connectionLabel: string | null
  /** Name of the Provider user behind the Conexão, or `null` while unknown. */
  readonly userName: string | null
  /** Avatar of the Provider user, when the Provider published one. */
  readonly userAvatarUrl?: string | undefined
  readonly query: string
  readonly onQueryChange: (query: string) => void
}

export function AppHeader({
  connectionLabel,
  userName,
  userAvatarUrl,
  query,
  onQueryChange,
}: AppHeaderProps) {
  return (
    <header className="flex h-13 flex-none items-center gap-4 border-b bg-sidebar px-4">
      <div className="flex w-[214px] flex-none items-center gap-2.5">
        <HorizonMark className="size-6 flex-none rounded-[7px] shadow-xs" />
        <span className="text-[14.5px] font-semibold tracking-tight text-foreground">Horizon</span>
        {connectionLabel === null ? (
          <span className="rounded-full border border-dashed px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
            sem conexão
          </span>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="flex min-w-0 items-center gap-1.5 rounded-full border bg-background/60 px-2 py-0.5 font-mono text-[10px] text-muted-foreground">
                <span aria-hidden className="size-1.5 rounded-full bg-status-done" />
                <span className="truncate">{connectionLabel}</span>
              </span>
            </TooltipTrigger>
            <TooltipContent>Conexão ativa</TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="relative flex max-w-[540px] flex-1 items-center">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3 size-3.5 text-muted-foreground"
        />
        <Input
          type="search"
          aria-label="Buscar issues, projetos, discussões"
          placeholder="Buscar issues, projetos, discussões…"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
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
      </div>

      <div className="flex-1" />

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
