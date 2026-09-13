import { useState } from 'react'
import { initiativeIdFromName, type Initiative } from '@horizon/domain'
import { FolderKanban, Trash2 } from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '~/components/ui/dialog'
import { Input } from '~/components/ui/input'
import { Textarea } from '~/components/ui/textarea'
import { persistInitiatives, readInitiatives, useInitiatives } from '~/db/use-initiatives'

/**
 * The Projeto catalog: a cross-repository objective that Issues from any group
 * can join. Membership is written on the Issue, in the detail panel; this
 * dialog only owns the names.
 */
export function InitiativeDialog({
  open,
  onOpenChange,
  discoveredIds = [],
  issueCountOf,
}: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
  readonly discoveredIds?: readonly string[]
  readonly issueCountOf?: (id: string) => number
}) {
  const initiatives = useInitiatives(discoveredIds)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [error, setError] = useState<string>()

  const create = () => {
    const trimmed = name.trim()
    const id = initiativeIdFromName(trimmed)
    if (!id) return setError('Dê ao Projeto um nome com letras ou números.')
    if (initiatives.some((initiative) => initiative.id === id))
      return setError('Já existe um Projeto com esse nome.')
    const now = new Date().toISOString()
    const created: Initiative = {
      id,
      name: trimmed,
      description: description.trim(),
      state: 'active',
      createdAt: now,
      updatedAt: now,
    }
    persistInitiatives([...readInitiatives(), created])
    setName('')
    setDescription('')
    setError(undefined)
  }

  const rename = (id: string, nextName: string) => {
    const stored = readInitiatives()
    const current = stored.find((initiative) => initiative.id === id)
    const now = new Date().toISOString()
    // A Projeto discovered through a label has no catalog entry yet; naming it
    // creates one, keeping the id the Issues already carry.
    persistInitiatives(
      current
        ? stored.map((initiative) =>
            initiative.id === id ? { ...initiative, name: nextName, updatedAt: now } : initiative,
          )
        : [
            ...stored,
            {
              id,
              name: nextName,
              description: '',
              state: 'active' as const,
              createdAt: now,
              updatedAt: now,
            },
          ],
    )
  }

  const remove = (id: string) =>
    persistInitiatives(readInitiatives().filter((initiative) => initiative.id !== id))

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-label="Projetos" className="w-[min(92vw,560px)]">
        <header className="border-b px-6 pt-6 pb-4">
          <DialogTitle className="flex items-center gap-2">
            <FolderKanban aria-hidden className="size-4 text-primary" />
            Projetos
          </DialogTitle>
          <DialogDescription className="mt-1">
            Um Projeto reúne issues de repositórios e grupos diferentes sob um mesmo objetivo.
          </DialogDescription>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
          <form
            className="mb-5 space-y-2"
            onSubmit={(event) => {
              event.preventDefault()
              create()
            }}
          >
            <Input
              aria-label="Nome do Projeto"
              placeholder="Nome do Projeto"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <Textarea
              aria-label="Descrição do Projeto"
              placeholder="Objetivo do Projeto (opcional)"
              className="min-h-16 text-[12.5px]"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
            {name.trim() ? (
              <p className="font-mono text-[10.5px] text-muted-foreground">
                label: horizon::initiative::{initiativeIdFromName(name)}
              </p>
            ) : null}
            {error ? (
              <p role="alert" className="text-xs text-destructive">
                {error}
              </p>
            ) : null}
            <Button type="submit" size="xs" disabled={!name.trim()}>
              Criar Projeto
            </Button>
          </form>

          {initiatives.length ? (
            <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border">
              {initiatives.map((initiative) => {
                const linked = issueCountOf?.(initiative.id) ?? 0
                return (
                  <li key={initiative.id} className="flex items-center gap-2 px-3 py-2">
                    <div className="min-w-0 flex-1">
                      <Input
                        aria-label={`Nome de ${initiative.name}`}
                        defaultValue={initiative.name}
                        onBlur={(event) => {
                          const next = event.target.value.trim()
                          if (next && next !== initiative.name) rename(initiative.id, next)
                        }}
                        className="h-7 border-0 bg-transparent px-0 text-[12.5px] shadow-none focus-visible:ring-0"
                      />
                      <p className="font-mono text-[10px] text-muted-foreground">{initiative.id}</p>
                    </div>
                    {issueCountOf ? (
                      <span className="flex-none font-mono text-[10.5px] tabular-nums text-muted-foreground">
                        {linked} issues
                      </span>
                    ) : null}
                    <Button
                      size="icon-xs"
                      variant="ghost"
                      aria-label={`Excluir ${initiative.name}`}
                      disabled={linked > 0}
                      title={
                        linked > 0
                          ? 'Desvincule as issues antes de excluir o Projeto.'
                          : 'Excluir Projeto'
                      }
                      className="text-muted-foreground hover:text-destructive"
                      onClick={() => remove(initiative.id)}
                    >
                      <Trash2 />
                    </Button>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p className="py-6 text-center text-[12.5px] text-muted-foreground">
              Nenhum Projeto ainda. Crie um acima e vincule issues pelo painel de detalhes.
            </p>
          )}
        </div>

        <footer className="flex justify-end border-t px-6 py-3">
          <Button size="xs" variant="secondary" onClick={() => onOpenChange(false)}>
            Fechar
          </Button>
        </footer>
      </DialogContent>
    </Dialog>
  )
}
