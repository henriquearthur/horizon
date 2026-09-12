import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'

/**
 * Horizon is self-hosted and single-tenant: the Conexão is part of the
 * deployment, not of the user's session. URL and token come from the
 * environment (`.env.local` in development) and never travel to the browser.
 */
export interface GitLabCredentials {
  readonly url: string
  readonly token: string
}

export const GITLAB_URL_VAR = 'HORIZON_GITLAB_URL'
export const GITLAB_TOKEN_VAR = 'HORIZON_GITLAB_TOKEN'

/** Parses `KEY=value` lines; quotes are optional and `#` starts a comment. */
export const parseEnvFile = (content: string): Record<string, string> => {
  const values: Record<string, string> = {}
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#')) continue
    const separator = line.indexOf('=')
    if (separator <= 0) continue
    const key = line
      .slice(0, separator)
      .trim()
      .replace(/^export\s+/, '')
    let value = line.slice(separator + 1).trim()
    if (
      (value.startsWith('"') && value.endsWith('"') && value.length > 1) ||
      (value.startsWith("'") && value.endsWith("'") && value.length > 1)
    )
      value = value.slice(1, -1)
    else value = value.split(' #')[0]!.trim()
    if (key) values[key] = value
  }
  return values
}

const ENV_FILES = ['.env.local', '.env'] as const

/**
 * Loads the env files once, walking up from the working directory so the app
 * finds them whether it runs from the repository root or from `apps/web`.
 * Real environment variables always win over the files.
 */
let loaded = false
export const loadEnvFiles = (from = process.cwd()): void => {
  if (loaded) return
  loaded = true
  for (let directory = resolve(from), depth = 0; depth < 6; depth += 1) {
    for (const name of ENV_FILES) {
      let content: string
      try {
        content = readFileSync(join(directory, name), 'utf8')
      } catch {
        continue
      }
      for (const [key, value] of Object.entries(parseEnvFile(content)))
        if (process.env[key] === undefined) process.env[key] = value
    }
    const parent = dirname(directory)
    if (parent === directory) break
    directory = parent
  }
}

const readVar = (name: string): string | undefined => {
  loadEnvFiles()
  const value = process.env[name]?.trim()
  return value ? value : undefined
}

export interface ConfigDiagnostics {
  readonly configured: boolean
  /** Environment variables the deployment still has to provide. */
  readonly missing: readonly string[]
  /** Why a provided URL was rejected, when that is the problem. */
  readonly invalidUrl?: string
  readonly host?: string
}

export const gitlabDiagnostics = (): ConfigDiagnostics => {
  const url = readVar(GITLAB_URL_VAR)
  const token = readVar(GITLAB_TOKEN_VAR)
  const missing = [...(url ? [] : [GITLAB_URL_VAR]), ...(token ? [] : [GITLAB_TOKEN_VAR])]
  if (missing.length) return { configured: false, missing }
  let parsed: URL
  try {
    parsed = new URL(url!)
  } catch {
    return { configured: false, missing: [], invalidUrl: `${GITLAB_URL_VAR} não é uma URL válida.` }
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:')
    return {
      configured: false,
      missing: [],
      invalidUrl: `${GITLAB_URL_VAR} deve usar HTTP ou HTTPS.`,
    }
  return { configured: true, missing: [], host: parsed.host }
}

/** The Conexão credentials, or `undefined` when the deployment is unconfigured. */
export const gitlabCredentials = (): GitLabCredentials | undefined => {
  if (!gitlabDiagnostics().configured) return undefined
  return { url: readVar(GITLAB_URL_VAR)!, token: readVar(GITLAB_TOKEN_VAR)! }
}

/** Reads a positive integer setting, falling back to the given default. */
export const numberSetting = (name: string, fallback: number): number => {
  const value = Number(readVar(name))
  return Number.isFinite(value) && value >= 0 ? value : fallback
}
