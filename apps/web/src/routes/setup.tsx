import { createFileRoute, redirect, useRouter } from '@tanstack/react-router'
import { Button } from '~/components/ui/button'
import { getSetupStatus } from '~/server/setup-functions'
import type { SetupStatus } from '~/server/setup'

/**
 * The Conexão comes from the environment and the Escopo is picked in the
 * Escopo modal inside the app, so `/setup` has a single job left: explaining a
 * Conexão that does not work. A reachable GitLab goes straight to the Inbox.
 */
export const Route = createFileRoute('/setup')({
  loader: async (): Promise<{ status: SetupStatus }> => {
    const status = await getSetupStatus()
    if (status.reachable) throw redirect({ to: '/' })
    return { status }
  },
  component: SetupPage,
})

function SetupPage() {
  const { status } = Route.useLoaderData()
  const router = useRouter()

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="w-full max-w-xl rounded-xl border bg-card p-7 shadow-lg">
        <p className="mb-2 font-mono text-xs uppercase tracking-widest text-primary">
          Horizon · configuração
        </p>
        <div className="space-y-5">
          <div>
            <h1 className="text-2xl font-semibold">Configure a Conexão no ambiente</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              A URL e o token do GitLab são lidos do <code className="font-mono">.env.local</code>{' '}
              do servidor. O token nunca chega ao navegador e não é cadastrado aqui.
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
          <Button onClick={() => void router.invalidate()}>Verificar novamente</Button>
        </div>
      </div>
    </main>
  )
}
