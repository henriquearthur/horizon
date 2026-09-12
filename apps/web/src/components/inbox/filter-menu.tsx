import { useState } from 'react'
import { Popover } from 'radix-ui'

interface FilterDefinition {
  label: string
  value: string
  onChange: (value: string) => void
  options: readonly { value: string; label: string }[]
}

export function FilterMenu({ filters }: { filters: readonly FilterDefinition[] }) {
  const [open, setOpen] = useState(false)
  const [category, setCategory] = useState(0)
  const selected = filters[category]!
  return (
    <>
      {filters
        .filter((filter) => filter.value)
        .map((filter) => (
          <div
            key={filter.label}
            className="flex h-6 items-center overflow-hidden rounded-md border bg-card text-[11.5px]"
          >
            <span className="pr-1.5 pl-2 text-muted-foreground">{filter.label}</span>
            <span className="pr-1.5 font-medium">
              {filter.options.find((option) => option.value === filter.value)?.label ??
                filter.value}
            </span>
            <button
              type="button"
              aria-label={`Remover filtro ${filter.label}`}
              onClick={() => filter.onChange('')}
              className="h-full border-l px-1.5 text-muted-foreground hover:bg-muted"
            >
              ×
            </button>
          </div>
        ))}
      <Popover.Root open={open} onOpenChange={setOpen}>
        <Popover.Trigger className="h-6 shrink-0 rounded-md border border-dashed px-[9px] text-[11.5px] text-muted-foreground hover:border-primary hover:text-primary">
          + Filtro
        </Popover.Trigger>
        <Popover.Portal>
          <Popover.Content
            align="start"
            sideOffset={4}
            className="z-60 flex overflow-hidden rounded-[9px] border bg-popover shadow-lg"
          >
            <div className="w-[132px] border-r p-[5px]">
              {filters.map((filter, index) => (
                <button
                  type="button"
                  key={filter.label}
                  onClick={() => setCategory(index)}
                  className={`flex h-[26px] w-full items-center rounded-md px-2 text-left text-xs hover:bg-muted ${category === index ? 'bg-accent text-accent-foreground' : ''}`}
                >
                  {filter.label}
                </button>
              ))}
            </div>
            <div className="max-h-[264px] w-[206px] overflow-y-auto p-[5px]">
              {selected.options.map((option) => (
                <button
                  type="button"
                  key={option.value}
                  aria-pressed={selected.value === option.value}
                  onClick={() => {
                    selected.onChange(option.value)
                    setOpen(false)
                  }}
                  className="flex min-h-[26px] w-full items-center gap-[7px] rounded-md px-2 py-1 text-left text-xs hover:bg-muted"
                >
                  <span className="w-3 text-primary">
                    {selected.value === option.value ? '✓' : ''}
                  </span>
                  {option.label}
                </button>
              ))}
              {!selected.options.length && (
                <p className="p-2 text-xs text-muted-foreground">Nenhuma opção disponível.</p>
              )}
            </div>
          </Popover.Content>
        </Popover.Portal>
      </Popover.Root>
    </>
  )
}
