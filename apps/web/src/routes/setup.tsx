import { createFileRoute, useNavigate } from '@tanstack/react-router'
import { useEffect, useState, type FormEvent } from 'react'
import type { ProviderGroup, ProviderProject } from '@horizon/domain'
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

function SetupPage() {
  const navigate = useNavigate()
  const runtime = useHorizonRuntime()
  const [url, setUrl] = useState('')
  const [token, setToken] = useState('')
  const [groups, setGroups] = useState<readonly ProviderGroup[]>([])
  const [projects, setProjects] = useState<readonly ProviderProject[]>([])
  const [selectedGroups, setSelectedGroups] = useState<string[]>([])
  const [selectedProjects, setSelectedProjects] = useState<number[]>([])
  const [followGroups, setFollowGroups] = useState<string[]>([])
  const [step, setStep] = useState<'connection' | 'scope'>('connection')
  const [error, setError] = useState<string>()
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    void getConnection()
      .then(async (connection) => {
        if (!connection) return
        setUrl(connection.url)
        const catalog = await getOnboardingCatalog()
        setGroups(catalog.groups)
        setProjects(catalog.projects)
        setSelectedGroups([...catalog.scope.groups])
        setSelectedProjects([...catalog.scope.projects])
        setFollowGroups([...catalog.scope.followGroups])
        setStep('scope')
      })
      .catch(() => undefined)
  }, [])

  const submitConnection = async (event: FormEvent) => {
    event.preventDefault()
    setBusy(true)
    setError(undefined)
    try {
      await connectGitLab({ data: { url, token } })
      const catalog = await getOnboardingCatalog()
      setGroups(catalog.groups)
      setProjects(catalog.projects)
      setSelectedGroups([...catalog.scope.groups])
      setSelectedProjects([...catalog.scope.projects])
      setFollowGroups([...catalog.scope.followGroups])
      setStep('scope')
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
          selectedGroups.some(
            (group) => project.groupPath === group || project.groupPath?.startsWith(`${group}/`),
          ),
        )
        .map((project) => project.id)
      await saveOnboardingScope({
        data: {
          groups: selectedGroups,
          projects: [...new Set([...selectedProjects, ...projectsFromSelectedGroups])],
          followGroups,
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
      <div className="w-full max-w-xl rounded-xl border bg-card p-7 shadow-lg">
        <p className="mb-2 font-mono text-xs uppercase tracking-widest text-primary">
          Horizon · configuração inicial
        </p>
        {step === 'connection' ? (
          <form onSubmit={submitConnection} className="space-y-5">
            <div>
              <h1 className="text-2xl font-semibold">Conecte seu GitLab</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                A Conexão é armazenada no servidor. O token nunca volta para o navegador.
              </p>
            </div>
            <label className="block text-sm font-medium">
              URL do GitLab
              <Input
                required
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                placeholder="https://gitlab.exemplo.com"
                className="mt-1"
              />
            </label>
            <label className="block text-sm font-medium">
              Token de acesso
              <Input
                required
                type="password"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                placeholder="glpat-…"
                className="mt-1"
              />
            </label>
            <Message error={error} />
            <Button disabled={busy} type="submit">
              {busy ? 'Validando…' : 'Validar Conexão'}
            </Button>
          </form>
        ) : (
          <form onSubmit={submitScope} className="space-y-5">
            <div>
              <h1 className="text-2xl font-semibold">Escolha seu Escopo</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                Selecione projetos individualmente ou acompanhe um grupo para incluir projetos
                futuros.
              </p>
            </div>
            <div className="max-h-80 space-y-2 overflow-y-auto">
              {groups.map((group) => (
                <div key={group.id} className="flex items-center gap-2 rounded-md border p-2">
                  <label className="flex min-w-0 flex-1 items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selectedGroups.includes(group.fullPath)}
                      onChange={(event) =>
                        setSelectedGroups((current) => {
                          if (event.target.checked) return [...current, group.fullPath]
                          setFollowGroups((followed) =>
                            followed.filter((path) => path !== group.fullPath),
                          )
                          return current.filter((path) => path !== group.fullPath)
                        })
                      }
                    />
                    <span className="truncate font-mono text-sm">{group.fullPath}</span>
                  </label>
                  <label className="flex items-center gap-1 text-xs text-muted-foreground">
                    <input
                      type="checkbox"
                      checked={followGroups.includes(group.fullPath)}
                      onChange={(event) => {
                        if (event.target.checked) {
                          setSelectedGroups((selected) =>
                            selected.includes(group.fullPath)
                              ? selected
                              : [...selected, group.fullPath],
                          )
                          setFollowGroups((current) => [...current, group.fullPath])
                        } else {
                          setFollowGroups((current) =>
                            current.filter((path) => path !== group.fullPath),
                          )
                        }
                      }}
                    />
                    incluir projetos futuros
                  </label>
                </div>
              ))}
              {projects.map((project) => (
                <label
                  key={project.id}
                  className="ml-5 flex items-center gap-2 rounded-md p-1 text-sm"
                >
                  <input
                    type="checkbox"
                    checked={selectedProjects.includes(project.id)}
                    onChange={(event) =>
                      setSelectedProjects((current) =>
                        event.target.checked
                          ? [...current, project.id]
                          : current.filter((id) => id !== project.id),
                      )
                    }
                  />
                  <span>
                    {project.namespace}/{project.path}
                  </span>
                </label>
              ))}
              {groups.length === 0 && projects.length === 0 ? (
                <p className="text-sm text-muted-foreground">Nenhum grupo ou projeto acessível.</p>
              ) : null}
            </div>
            <Message error={error} />
            <Button disabled={busy} type="submit">
              {busy ? 'Salvando…' : 'Salvar Escopo'}
            </Button>
          </form>
        )}
      </div>
    </main>
  )
}

function Message({ error }: { error: string | undefined }) {
  return error ? (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  ) : null
}
