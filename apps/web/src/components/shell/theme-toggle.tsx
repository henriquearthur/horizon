import { Moon, Sun } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { useTheme } from '~/lib/theme'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const label = theme === 'dark' ? 'Claro' : 'Escuro'
  const Icon = theme === 'dark' ? Sun : Moon

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={toggleTheme}
      aria-label={`Mudar para o tema ${label.toLowerCase()}`}
      className="h-8 rounded-full px-3 text-[11.5px] text-muted-foreground shadow-none hover:text-foreground"
    >
      <Icon
        aria-hidden
        className="size-3.5 transition-transform duration-300 group-hover:rotate-12"
      />
      {label}
    </Button>
  )
}
