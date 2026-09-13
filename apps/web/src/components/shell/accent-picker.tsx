import { Check, Palette } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
import { type AccentColor, useTheme } from '~/lib/theme'
import { cn } from '~/lib/utils'

const ACCENTS: readonly { value: AccentColor; label: string; color: string }[] = [
  { value: 'indigo', label: 'Índigo', color: 'oklch(0.67 0.17 275)' },
  { value: 'purple', label: 'Roxo', color: 'oklch(0.67 0.18 305)' },
  { value: 'blue', label: 'Azul', color: 'oklch(0.65 0.17 250)' },
  { value: 'cyan', label: 'Ciano', color: 'oklch(0.7 0.14 210)' },
  { value: 'green', label: 'Verde', color: 'oklch(0.67 0.15 150)' },
  { value: 'yellow', label: 'Amarelo', color: 'oklch(0.78 0.16 90)' },
  { value: 'orange', label: 'Laranja', color: 'oklch(0.7 0.17 55)' },
  { value: 'pink', label: 'Rosa', color: 'oklch(0.68 0.18 335)' },
]

export function AccentPicker() {
  const { accent, setAccent } = useTheme()
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon-sm"
          aria-label="Escolher cor de destaque"
          className="rounded-full shadow-none"
        >
          <Palette aria-hidden className="size-3.5 text-primary" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-52 p-2">
        <p className="px-2 pt-1 pb-2 text-[10px] font-semibold tracking-[0.08em] text-muted-foreground uppercase">
          Cor de destaque
        </p>
        <div className="grid grid-cols-2 gap-1">
          {ACCENTS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => setAccent(option.value)}
              className={cn(
                'flex h-8 items-center gap-2 rounded-lg px-2 text-xs transition-colors hover:bg-hover',
                option.value === accent && 'bg-accent text-accent-foreground',
              )}
            >
              <span
                className="size-3 rounded-full ring-1 ring-foreground/10"
                style={{ background: option.color }}
              />
              <span className="flex-1 text-left">{option.label}</span>
              {option.value === accent ? (
                <Check aria-hidden className="size-3 text-primary" />
              ) : null}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  )
}
