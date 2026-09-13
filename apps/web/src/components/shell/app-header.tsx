import { Search, X } from 'lucide-react'
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
}

export function AppHeader({ userName, userAvatarUrl, query, onQueryChange }: AppHeaderProps) {
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
