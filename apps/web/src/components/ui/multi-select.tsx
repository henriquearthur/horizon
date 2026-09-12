import { useMemo, useState } from 'react'
import { Check, ChevronDown, Search } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
import { cn } from '~/lib/utils'

export interface MultiSelectOption {
  readonly value: string
  readonly label: string
  /** Rendered before the label, e.g. an avatar or a label chip. */
  readonly adornment?: React.ReactNode
}

/**
 * A searchable list of checkable options. Horizon shows people, labels and
 * projects with it, all of which can run into the hundreds, so the list is
 * always filterable and never a native `<select multiple>`.
 */
export function MultiSelect({
  label,
  options,
  selected,
  onChange,
  placeholder = 'Nenhum',
  searchPlaceholder = 'Filtrar…',
  className,
  triggerClassName,
}: {
  readonly label: string
  readonly options: readonly MultiSelectOption[]
  readonly selected: readonly string[]
  readonly onChange: (selected: readonly string[]) => void
  readonly placeholder?: string
  readonly searchPlaceholder?: string
  readonly className?: string
  readonly triggerClassName?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const visible = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    if (!needle) return options
    return options.filter((option) => option.label.toLocaleLowerCase().includes(needle))
  }, [options, query])

  const summary = selected.length
    ? options
        .filter((option) => selected.includes(option.value))
        .map((option) => option.label)
        .join(', ') || `${selected.length} selecionados`
    : placeholder

  const toggle = (value: string) =>
    onChange(
      selected.includes(value) ? selected.filter((item) => item !== value) : [...selected, value],
    )

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          aria-label={label}
          className={cn(
            'h-8 w-full justify-between gap-2 px-2.5 text-xs font-normal',
            !selected.length && 'text-muted-foreground',
            triggerClassName,
          )}
        >
          <span className="min-w-0 truncate">{summary}</span>
          <ChevronDown aria-hidden className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className={cn('w-[var(--radix-popover-trigger-width)] p-0', className)}>
        <div className="relative flex items-center border-b p-1.5">
          <Search
            aria-hidden
            className="pointer-events-none absolute left-3.5 size-3 text-muted-foreground"
          />
          <Input
            autoFocus
            aria-label={searchPlaceholder}
            placeholder={searchPlaceholder}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="h-7 border-0 bg-transparent pl-6 text-xs shadow-none focus-visible:ring-0"
          />
        </div>
        <div className="max-h-60 overflow-y-auto p-1">
          {visible.map((option) => {
            const checked = selected.includes(option.value)
            return (
              <button
                type="button"
                key={option.value}
                role="option"
                aria-selected={checked}
                onClick={() => toggle(option.value)}
                className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs transition-colors hover:bg-hover"
              >
                <span
                  className={cn(
                    'flex size-3.5 flex-none items-center justify-center rounded-[4px] border transition-colors',
                    checked ? 'border-primary bg-primary text-primary-foreground' : 'border-input',
                  )}
                >
                  {checked ? <Check className="size-2.5" strokeWidth={3} /> : null}
                </span>
                {option.adornment}
                <span className="min-w-0 flex-1 truncate">{option.label}</span>
              </button>
            )
          })}
          {!visible.length ? (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              Nenhuma opção encontrada.
            </p>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}
