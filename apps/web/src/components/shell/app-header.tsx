import { PanelLeft, PanelLeftClose } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { HorizonMark } from '~/components/shell/horizon-mark'
import { ThemeToggle } from '~/components/shell/theme-toggle'
import { AccentPicker } from '~/components/shell/accent-picker'
import { UserAvatar } from '~/components/issue/issue-chrome'

export interface AppHeaderProps {
  /** Name of the Provider user behind the Conexão, or `null` while unknown. */
  readonly userName: string | null
  /** Avatar of the Provider user, when the Provider published one. */
  readonly userAvatarUrl?: string | undefined
  /** Whether the sidebar is showing; omitted where there is no sidebar. */
  readonly sidebarOpen?: boolean
  readonly onToggleSidebar?: () => void
}

export function AppHeader({
  userName,
  userAvatarUrl,
  sidebarOpen = true,
  onToggleSidebar,
}: AppHeaderProps) {
  return (
    <header className="flex h-13 flex-none items-center gap-4 border-b bg-sidebar px-4">
      {onToggleSidebar ? (
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={onToggleSidebar}
          aria-label={sidebarOpen ? 'Recolher a barra lateral' : 'Mostrar a barra lateral'}
          aria-pressed={!sidebarOpen}
        >
          {sidebarOpen ? <PanelLeftClose /> : <PanelLeft />}
        </Button>
      ) : null}
      <div className="flex flex-none items-center gap-2.5">
        <HorizonMark className="size-6 flex-none rounded-[7px] shadow-xs" />
        <span className="text-[14.5px] font-semibold tracking-tight text-foreground">Horizon</span>
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
