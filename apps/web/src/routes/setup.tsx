import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState, type FormEvent } from 'react'
import type { ProviderGroup, ProviderProject } from '@horizon/domain'
import { ArrowRight } from 'lucide-react'
import { HorizonMark } from '~/components/shell/horizon-mark'
import { ScopePicker, type ScopeDraft } from '~/components/setup/scope-picker'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import {
  connectGitLab,
  getConnection,
  getOnboardingCatalog,
  saveOnboardingScope,
} from '~/server/onboarding-functions'
import { useHorizonRuntime } from '~/runtime/runtime-provider'

export const Route = createFileRoute('/setup')({ component: SetupPage })

const emptyDraft: ScopeDraft = { groups: [], projects: [], followGroups: [] }

function SetupPage() {
  const navigate = useNavigate()
  const runtime = useHorizonRuntime()
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [groups, setGroups] = useState<readonly ProviderGroup[]>([])
  const [projects, setProjects] = useState<readonly ProviderProject[]>([])
  const [scope, setScope] = useState<ScopeDraft>(emptyDraft)
  const [step, setStep] = useState<'connection' | 'scope'>('connection')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  const loadCatalog = async () => {
    const catalog = await getOnboardingCatalog()
    setGroups(catalog.groups)
    setProjects(catalog.projects)
    setScope({
      groups: [...catalog.scope.groups],
      projects: [...catalog.scope.projects],
      followGroups: [...catalog.scope.followGroups],
    })
    setStep('scope')
  }

  useEffect(() => {
    void getConnection()
      .then(async (connection) => {
        if (!connection) return
        setUrl(connection.url)
        await loadCatalog()
      })
      .catch(() => undefined)
  }, [])

  const submitConnection = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      await connectGitLab({ data: { url, token } })
      await loadCatalog()
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível validar a Conexão.')
    } finally {
      setBusy(false)
    }
  }

  const submitScope = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      const projectsFromSelectedGroups = projects
        .filter((project) =>
          scope.groups.some(
            (group) => project.groupPath === group || project.groupPath?.startsWith(`${group}/`),
          ),
        )
        .map((project) => project.id)
      await saveOnboardingScope({
        data: {
          groups: [...scope.groups],
          projects: [...new Set([...scope.projects, ...projectsFromSelectedGroups])],
          followGroups: [...scope.followGroups],
        },
      })
      await runtime.refresh()
      await navigate({ to: '/' })
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível salvar o Escopo.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-background p-6">
      <div className="animate-rise w-full max-w-2xl rounded-2xl border bg-card p-8 shadow-lg">
        <div className="mb-6 flex items-center gap-3">
          <HorizonMark className="size-9 rounded-[10px] shadow-sm" />
          <div>
            <p className="font-mono text-[10px] tracking-[0.14em] text-primary uppercase">
              Configuração inicial
            </p>
            <p className="text-[15px] font-semibold tracking-tight">Horizon</p>
          </div>
          <div className="flex-1" />
          <Steps step={step} />
        </div>

        {step === 'connection' ? (
          <form onSubmit={submitConnection} className="space-y-5">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Conecte seu GitLab</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                A Conexão é armazenada no servidor. O token nunca volta para o navegador.
              </p>
            </div>
            <label className="block space-y-1.5 text-sm font-medium">
              URL do GitLab
              <Input
                required
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://gitlab.exemplo.com"
              />
            </label>
            <label className="block space-y-1.5 text-sm font-medium">
              Token de acesso
              <Input
                required
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="glpat-…"
              />
            </label>
            <Message error={error} />
            <Button disabled={busy} type="submit">
              {busy ? 'Validando…' : 'Validar Conexão'}
              <ArrowRight aria-hidden />
            </Button>
          </form>
        ) : (
          <form onSubmit={submitScope} className="space-y-5">
            <div>
              <h1 className="text-2xl font-semibold tracking-tight">Escolha seu Escopo</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Marque grupos inteiros ou projetos soltos. Acompanhar um grupo faz os projetos
                criados depois entrarem sozinhos.
              </p>
            </div>
            <ScopePicker groups={groups} projects={projects} value={scope} onChange={setScope} />
            <Message error={error} />
            <div className="flex items-center gap-2">
              <Button disabled={busy} type="submit">
                {busy ? 'Salvando…' : 'Salvar Escopo'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setStep('connection')}
                disabled={busy}
              >
                Trocar Conexão
              </Button>
            </div>
          </form>
        )}
      </div>
    </main>
  )
}

function Steps({ step }: { step: 'connection' | 'scope' }) {
  return (
    <ol className="flex items-center gap-2 text-[11px] text-muted-foreground">
      {(['connection', 'scope'] as const).map((value, index) => (
        <li key={value} className="flex items-center gap-2">
          <span
            className={
              step === value
                ? 'flex size-5 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground'
                : 'flex size-5 items-center justify-center rounded-full bg-muted text-[10px] font-semibold'
            }
          >
            {index + 1}
          </span>
          {value === 'connection' ? 'Conexão' : 'Escopo'}
        </li>
      ))}
    </ol>
  )
}

function Message({ error }: { error: string | undefined }) {
  return error ? (
    <p role="alert" className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
      {error}
    </p>
  ) : null
}
