import { Button } from '~/components/ui/button'
import { useTheme } from '~/lib/theme'

export function ThemeToggle() {
  const { theme, toggleTheme } = useTheme()
  const label = theme === 'dark' ? 'Claro' : 'Escuro'

  return (
    <Button
      type="button"
      variant="outline"
      onClick={toggleTheme}
      aria-label={`Mudar para o tema ${label.toLowerCase()}`}
      className="h-7 shrink-0 rounded-[7px] px-2.5 text-[11.5px] text-muted-foreground shadow-none hover:text-foreground"
    >
      {label}
    </Button>
  )
}
