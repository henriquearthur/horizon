import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useEffect, useState, type FormEvent } from 'react'
import type { ProviderGroup, ProviderProject } from '@horizon/domain'
import { Button } from '~/components/ui/button'
import { getSetupCatalog, getSetupStatus, saveSetupScope } from '~/server/setup-functions'
import type { SetupCatalog, SetupStatus } from '~/server/setup'
import { useHorizonRuntime } from '~/runtime/runtime-provider'

/**
 * The Conexão comes from the environment, so `/setup` has one job left:
 * choosing the Escopo. When the environment is missing or the token does not
 * reach GitLab, it explains exactly what to fix instead of asking for a token.
 */
export const Route = createFileRoute('/setup')({
  loader: async (): Promise<{ status: SetupStatus; catalog?: SetupCatalog }> => {
    const status = await getSetupStatus()
    return { status }
  },
  component: SetupPage,
})

function SetupPage() {
  const { status } = Route.useLoaderData()
  const [catalog, setCatalog] = useState<SetupCatalog>()
  const [catalogError, setCatalogError] = useState<string>()
  const [catalogAttempt, setCatalogAttempt] = useState(0)
  useEffect(() => {
    if (!status.reachable) return
    void getSetupCatalog()
      .then(setCatalog)
      .catch((error) =>
        setCatalogError(
          error instanceof Error ? error.message : 'Não foi possível carregar grupos e projetos.',
        ),
      )
  }, [status.reachable, catalogAttempt])

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-xl rounded-xl border bg-card p-7 shadow-lg">
        <p className="mb-2 font-mono text-xs uppercase tracking-widest text-primary">
          Horizon · configuração
        </p>
        {!status.reachable ? (
          <Diagnostics
            status={status}
            onRetry={() => {
              setCatalogError(undefined)
              setCatalogAttempt((attempt) => attempt + 1)
            }}
          />
        ) : catalog ? (
          <ScopeForm catalog={catalog} host={status.host} />
        ) : catalogError ? (
          <Diagnostics
            status={{ ...status, error: catalogError }}
            onRetry={() => {
              setCatalogError(undefined)
              setCatalogAttempt((attempt) => attempt + 1)
            }}
          />
        ) : (
          <div role="status" className="space-y-3">
            <h1 className="text-2xl font-semibold">Carregando seu Escopo…</h1>
            <p className="text-sm text-muted-foreground">
              A conexão foi validada. Estamos buscando grupos e projetos em segundo plano.
            </p>
          </div>
        )}
      </div>
    </main>
  )
}

function Diagnostics({ status, onRetry }: { status: SetupStatus; onRetry?: () => void }) {
  const router = useRouter()
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Configure a Conexão no ambiente</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          A URL e o token do GitLab são lidos do <code className="font-mono">.env.local</code> do
          servidor. O token nunca chega ao navegador e não é cadastrado aqui.
        </p>
      </div>
      <pre className="overflow-x-auto rounded-lg border bg-muted/40 p-3 font-mono text-xs">
        {`${status.envVars.url}=https://gitlab.exemplo.com\n${status.envVars.token}=glpat-…`}
      </pre>
      {status.missing.length ? (
        <p role="alert" className="text-sm text-destructive">
          Faltando no ambiente: {status.missing.join(', ')}.
        </p>
      ) : null}
      {status.error ? (
        <p role="alert" className="text-sm text-destructive">
          {status.error}
        </p>
      ) : null}
      <p className="text-xs text-muted-foreground">
        Depois de editar o arquivo, reinicie o servidor do Horizon e recarregue esta página.
      </p>
      <Button
        onClick={() => {
          onRetry?.()
          void router.invalidate()
        }}
      >
        Verificar novamente
      </Button>
    </div>
  )
}

function ScopeForm({ catalog, host }: { catalog: SetupCatalog; host: string | undefined }) {
  const navigate = useNavigate()
  const runtime = useHorizonRuntime()
  const [selectedGroups, setSelectedGroups] = useState<readonly string[]>(catalog.scope.groups)
  const [selectedProjects, setSelectedProjects] = useState<readonly number[]>(
    catalog.scope.projects,
  )
  const [followGroups, setFollowGroups] = useState<readonly string[]>(catalog.scope.followGroups)
  const [filter, setFilter] = useState('')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const toggleGroup = (group: ProviderGroup, checked: boolean) => {
    setSelectedGroups((current) =>
      checked
        ? [...new Set([...current, group.fullPath])]
        : current.filter((path) => path !== group.fullPath),
    )
    if (!checked) setFollowGroups((current) => current.filter((path) => path !== group.fullPath))
  }

  const projectsOfGroup = (group: string): readonly number[] =>
    catalog.projects
      .filter(
        (project) => project.groupPath === group || project.groupPath?.startsWith(`${group}/`),
      )
      .map((project) => project.id)

  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      const fromGroups = selectedGroups.flatMap((group) => projectsOfGroup(group))
      const projects = [...new Set([...selectedProjects, ...fromGroups])]
      if (!projects.length && !followGroups.length)
        throw new Error('Selecione ao menos um projeto ou grupo para o Escopo.')
      await saveSetupScope({
        data: { groups: [...selectedGroups], projects, followGroups: [...followGroups] },
      })
      await runtime.refresh({ force: true })
      await navigate({ to: '/' })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o Escopo.')
    } finally {
      setBusy(false)
    }
  }

  const term = filter.trim().toLocaleLowerCase()
  const matches = (text: string) => !term || text.toLocaleLowerCase().includes(term)
  const groups = catalog.groups.filter((group) => matches(group.fullPath))
  const projects = catalog.projects.filter((project) =>
    matches(`${project.namespace}/${project.path}`),
  )

  return (
    <form onSubmit={submit} className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold">Escolha seu Escopo</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Conectado a <span className="font-mono">{host ?? 'GitLab'}</span>. Selecione projetos
          individualmente ou acompanhe um grupo para incluir projetos futuros.
        </p>
      </div>
      <input
        aria-label="Filtrar grupos e projetos"
        className="h-9 w-full rounded-md border bg-background px-3 text-sm"
        placeholder="Filtrar…"
        value={filter}
        onChange={(event) => setFilter(event.target.value)}
      />
      <div className="max-h-80 space-y-2 overflow-y-auto">
        {groups.map((group) => (
          <div key={group.id} className="flex items-center gap-2 rounded-md border p-2">
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <input
                type="checkbox"
                checked={selectedGroups.includes(group.fullPath)}
                onChange={(event) => toggleGroup(group, event.target.checked)}
              />
              <span className="truncate font-mono text-sm">{group.fullPath}</span>
            </label>
            <label className="flex items-center gap-1 text-xs text-muted-foreground">
              <input
                type="checkbox"
                checked={followGroups.includes(group.fullPath)}
                onChange={(event) => {
                  if (event.target.checked) {
                    toggleGroup(group, true)
                    setFollowGroups((current) => [...new Set([...current, group.fullPath])])
                  } else
                    setFollowGroups((current) => current.filter((path) => path !== group.fullPath))
                }}
              />
              incluir projetos futuros
            </label>
          </div>
        ))}
        {projects.map((project) => (
          <label key={project.id} className="ml-5 flex items-center gap-2 rounded-md p-1 text-sm">
            <input
              type="checkbox"
              checked={selectedProjects.includes(project.id)}
              onChange={(event) =>
                setSelectedProjects((current) =>
                  event.target.checked
                    ? [...new Set([...current, project.id])]
                    : current.filter((id) => id !== project.id),
                )
              }
            />
            <span>
              {project.namespace}/{project.path}
            </span>
          </label>
        ))}
        {!groups.length && !projects.length ? (
          <p className="text-sm text-muted-foreground">
            {catalog.groups.length || catalog.projects.length
              ? 'Nada corresponde ao filtro.'
              : 'Nenhum grupo ou projeto acessível com este token.'}
          </p>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <div className="flex items-center gap-2">
        <Button disabled={busy} type="submit">
          {busy ? 'Salvando…' : 'Salvar Escopo'}
        </Button>
        {!catalog.scope.projects.length && !catalog.scope.followGroups.length ? null : (
          <Button type="button" variant="ghost" onClick={() => void navigate({ to: '/' })}>
            Voltar para a Inbox
          </Button>
        )}
      </div>
    </form>
  )
}
