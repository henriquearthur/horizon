import { HorizonMark } from '~/components/shell/horizon-mark'
import { ThemeToggle } from '~/components/shell/theme-toggle'
import { AccentPicker } from '~/components/shell/accent-picker'
import { UserAvatar } from '~/components/issue/issue-chrome'

export interface AppHeaderProps {
  /** Name of the Provider user behind the Conexão, or `null` while unknown. */
  readonly userName: string | null
  /** Avatar of the Provider user, when the Provider published one. */
  readonly userAvatarUrl?: string | undefined
}

export function AppHeader({ userName, userAvatarUrl }: AppHeaderProps) {
  return (
    <header className="flex h-13 flex-none items-center gap-4 border-b bg-sidebar px-4">
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
