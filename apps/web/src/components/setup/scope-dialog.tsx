import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { FolderTree, LoaderCircle } from 'lucide-react'
import { ScopePicker, type ScopeDraft } from './scope-picker'
import { Button } from '~/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '~/components/ui/dialog'
import { getSetupCatalog, saveSetupScope } from '~/server/setup-functions'
import type { SetupCatalog } from '~/server/setup'
import { useHorizonRuntime } from '~/runtime/runtime-provider'

export function ScopeDialog({
  open,
  onOpenChange,
}: {
  readonly open: boolean
  readonly onOpenChange: (open: boolean) => void
}) {
  const runtime = useHorizonRuntime()
  const [catalog, setCatalog] = useState<SetupCatalog>()
  const [scope, setScope] = useState<ScopeDraft>({ groups: [], projects: [] })
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const [catalogLoading, setCatalogLoading] = useState(false)
  const draftVersion = useRef(0)

  const loadCatalog = useCallback(async (force = false) => {
    const versionAtStart = draftVersion.current
    setCatalogLoading(true)
    setError(undefined)
    try {
      const next = await getSetupCatalog({ data: { force } })
      setCatalog(next)
      // A slow refresh must not erase choices made while the picker was usable.
      if (draftVersion.current === versionAtStart)
        setScope({ groups: [...next.scope.groups], projects: [...next.scope.projects] })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível carregar o Escopo.')
    } finally {
      setCatalogLoading(false)
    }
  }, [])

  // Warm the catalog as soon as the shell mounts. Opening the modal normally
  // reveals the Escopo immediately, without a loading page in between.
  useEffect(() => {
    void loadCatalog()
  }, [loadCatalog])

  // Opening the modal reuses the warm catalog: groups and projects move slowly
  // and re-reading them costs a dozen round trips on a large instance.
  useEffect(() => {
    if (open && !catalog) void loadCatalog()
  }, [open, catalog, loadCatalog])

  const save = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      const saved = await saveSetupScope({ data: { ...scope, followGroups: scope.groups } })
      setCatalog((current) => (current ? { ...current, scope: saved } : current))
      onOpenChange(false)
      // Saving the Escopo already dropped the cached Issues on the server, so
      // the Inbox reloads on its own. Waiting here would keep the modal on
      // "Salvando…" for as long as GitLab takes to read hundreds of projects.
      void runtime.refresh()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o Escopo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!busy) onOpenChange(next)
      }}
    >
      <DialogContent aria-busy={busy}>
        <form onSubmit={(event) => void save(event)} className="flex min-h-0 flex-1 flex-col">
          <header className="flex-none border-b px-6 pt-5 pb-4 pr-14">
            <div className="mb-1 flex items-center gap-2 text-primary">
              <FolderTree aria-hidden className="size-4" />
              <DialogTitle>Escopo</DialogTitle>
            </div>
            <DialogDescription>
              Grupos incluem automaticamente todos os subgrupos e novos repositórios.
            </DialogDescription>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
            {catalog ? (
              <div className="space-y-3">
                <ScopePicker
                  groups={catalog.groups}
                  projects={catalog.projects}
                  value={scope}
                  onChange={(next) => {
                    draftVersion.current += 1
                    setScope(next)
                  }}
                />
                {error ? (
                  <div className="flex items-center justify-between gap-3 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    <p role="alert">{error}</p>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      onClick={() => void loadCatalog(true)}
                    >
                      Tentar novamente
                    </Button>
                  </div>
                ) : null}
              </div>
            ) : error ? (
              <div className="rounded-xl bg-destructive/10 px-4 py-3 text-sm text-destructive">
                <p role="alert">{error}</p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void loadCatalog(true)}
                >
                  Tentar novamente
                </Button>
              </div>
            ) : (
              <div
                role="status"
                className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground"
              >
                <LoaderCircle aria-hidden className="size-4 animate-spin text-primary" />
                Carregando Escopo…
              </div>
            )}
          </div>

          <footer className="flex flex-none items-center justify-end gap-2 border-t bg-muted/25 px-6 py-3.5">
            {catalogLoading && catalog ? (
              <span
                role="status"
                className="mr-auto flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <LoaderCircle aria-hidden className="size-3.5 animate-spin text-primary" />
                Atualizando…
              </span>
            ) : null}
            <Button
              type="button"
              variant="ghost"
              onClick={() => onOpenChange(false)}
              disabled={busy}
            >
              Cancelar
            </Button>
            <Button
              type="submit"
              disabled={busy || !catalog || (!scope.groups.length && !scope.projects.length)}
            >
              {busy ? <LoaderCircle aria-hidden className="animate-spin" /> : null}
              {busy ? 'Salvando…' : 'Salvar Escopo'}
            </Button>
          </footer>
        </form>
      </DialogContent>
    </Dialog>
  )
}
