import { useMemo, useState } from 'react'
import { Check, ListFilter, Search, X } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '~/components/ui/popover'
import { cn } from '~/lib/utils'

export interface FilterOption {
  readonly value: string
  readonly label: string
  /** How many Issues the option matches, shown next to it. */
  readonly count?: number
  /** Rendered before the label, e.g. a Status dot or a label chip. */
  readonly adornment?: React.ReactNode
}

export interface FilterDefinition {
  readonly label: string
  readonly value: string
  readonly onChange: (value: string) => void
  readonly options: readonly FilterOption[]
}

/**
 * The applied filters, as removable chips, plus the two-pane menu that adds
 * one. Categories live on the left, their options on the right, and every
 * option carries the number of Issues it would leave on screen.
 */
export function FilterMenu({ filters }: { filters: readonly FilterDefinition[] }) {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState(0)
  const [query, setQuery] = useState('')
  const selected = filters[category] ?? filters[0]
  const options = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase()
    const all = selected?.options ?? []
    return needle ? all.filter((option) => option.label.toLocaleLowerCase().includes(needle)) : all
  }, [query, selected])

  return (
    <>
      {filters
        .filter((filter) => filter.value)
        .map((filter) => (
          <span
            key={filter.label}
            className="flex h-7 items-center gap-1 overflow-hidden rounded-full border bg-card pl-2.5 text-[11.5px] shadow-xs transition-colors hover:border-ring/50"
          >
            <span className="text-muted-foreground">{filter.label}</span>
            <span className="max-w-40 truncate font-medium text-foreground">
              {filter.options.find((option) => option.value === filter.value)?.label ??
                filter.value}
            </span>
            <button
              type="button"
              aria-label={`Remover filtro ${filter.label}`}
              onClick={() => filter.onChange('')}
              className="flex h-full items-center px-2 text-muted-foreground transition-colors hover:bg-hover hover:text-foreground"
            >
              <X aria-hidden className="size-3" />
            </button>
          </span>
        ))}

      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="outline"
            size="xs"
            className="h-7 rounded-full border-dashed px-2.5 text-[11.5px] text-muted-foreground shadow-none hover:border-primary hover:text-primary"
          >
            <ListFilter aria-hidden />
            Filtro
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="flex w-auto gap-0 p-0">
          <div className="w-[142px] border-r p-1.5">
            {filters.map((filter, index) => (
              <button
                type="button"
                key={filter.label}
                onClick={() => {
                  setCategory(index)
                  setQuery('')
                }}
                className={cn(
                  'flex h-7 w-full items-center justify-between rounded-md px-2 text-left text-xs transition-colors',
                  category === index
                    ? 'bg-secondary font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-hover hover:text-foreground',
                )}
              >
                {filter.label}
                {filter.value ? <span className="size-1.5 rounded-full bg-primary" /> : null}
              </button>
            ))}
          </div>
          <div className="flex w-[236px] flex-col">
            <div className="relative flex items-center border-b p-1.5">
              <Search
                aria-hidden
                className="pointer-events-none absolute left-3.5 size-3 text-muted-foreground"
              />
              <Input
                aria-label={`Buscar em ${selected?.label ?? 'filtros'}`}
                placeholder="Filtrar…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                className="h-7 border-0 bg-transparent pl-6 text-xs shadow-none focus-visible:ring-0"
              />
            </div>
            <div className="max-h-[264px] overflow-y-auto p-1.5">
              {options.map((option) => {
                const active = selected?.value === option.value
                return (
                  <button
                    type="button"
                    key={option.value}
                    aria-pressed={active}
                    onClick={() => {
                      selected?.onChange(active ? '' : option.value)
                      setOpen(false)
                      setQuery('')
                    }}
                    className="flex min-h-7 w-full items-center gap-2 rounded-md px-2 py-1 text-left text-xs transition-colors hover:bg-hover"
                  >
                    <span className="flex size-3 flex-none items-center justify-center text-primary">
                      {active ? <Check className="size-3" strokeWidth={3} /> : null}
                    </span>
                    {option.adornment}
                    <span className="min-w-0 flex-1 truncate">{option.label}</span>
                    {option.count === undefined ? null : (
                      <span className="flex-none font-mono text-[10px] tabular-nums text-muted-foreground">
                        {option.count}
                      </span>
                    )}
                  </button>
                )
              })}
              {!options.length && (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                  Nenhuma opção disponível.
                </p>
              )}
            </div>
          </div>
        </PopoverContent>
      </Popover>
    </>
  )
}
