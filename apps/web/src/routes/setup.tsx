import { createFileRoute, useNavigate, useRouter } from '@tanstack/react-router'
import { useState, type FormEvent } from 'react'
import { ScopePicker, type ScopeDraft } from '~/components/setup/scope-picker'
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
    return {
      status,
      ...(status.reachable ? { catalog: await getSetupCatalog() } : {}),
    }
  },
  component: SetupPage,
})

function SetupPage() {
  const { status, catalog } = Route.useLoaderData()

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-xl rounded-xl border bg-card p-7 shadow-lg">
        <p className="mb-2 font-mono text-xs uppercase tracking-widest text-primary">
          Horizon · configuração
        </p>
        {!status.reachable ? (
          <Diagnostics status={status} onRetry={() => {}} />
        ) : catalog ? (
          <ScopeForm catalog={catalog} host={status.host} />
        ) : (
          <p role="alert" className="text-sm text-destructive">
            Não foi possível carregar o Escopo.
          </p>
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
  const [scope, setScope] = useState<ScopeDraft>({
    groups: [...catalog.scope.groups],
    projects: [...catalog.scope.projects],
  })
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)
  const save = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      await saveSetupScope({ data: { ...scope, followGroups: scope.groups } })
      await runtime.refresh({ force: true })
      await navigate({ to: '/', search: { view: 'general', mode: 'list' } })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o Escopo.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <form onSubmit={(event) => void save(event)} className="space-y-5">
      <h1 className="text-2xl font-semibold">Configure seu Escopo</h1>
      <p className="text-sm text-muted-foreground">{host}</p>
      <ScopePicker
        groups={catalog.groups}
        projects={catalog.projects}
        value={scope}
        onChange={setScope}
      />
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
      <Button type="submit" disabled={busy || (!scope.groups.length && !scope.projects.length)}>
        {busy ? 'Salvando…' : 'Salvar e abrir Inbox'}
      </Button>
    </form>
  )
}
