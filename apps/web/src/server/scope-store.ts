import { mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { emptyScopeSelection, normalizeScopeSelection, type ScopeSelection } from '@horizon/domain'
export type { ScopeSelection } from '@horizon/domain'

interface DiskRecord {
  readonly scope?: ScopeSelection
}

const defaultFile = (): string =>
  process.env.HORIZON_DATA_FILE ?? join(process.cwd(), '.horizon', 'scope.json')

/**
 * Server-only repository for the Escopo. The Conexão itself lives in the
 * environment, so nothing secret is written to disk.
 */
export class ScopeStore {
  #cached: ScopeSelection | undefined

  constructor(private readonly filePath = defaultFile()) {}

  async getScope(): Promise<ScopeSelection> {
    if (this.#cached) return this.#cached
    let record: DiskRecord | undefined
    try {
      record = JSON.parse(await readFile(this.filePath, 'utf8')) as DiskRecord
    } catch (error) {
      // A missing or corrupt file simply means "no Escopo picked yet".
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
        console.warn('[horizon] não foi possível ler o Escopo salvo', error)
    }
    this.#cached = record?.scope ? normalizeScopeSelection(record.scope) : emptyScopeSelection()
    return this.#cached
  }

  async saveScope(scope: ScopeSelection): Promise<ScopeSelection> {
    const normalized = normalizeScopeSelection(scope)
    await mkdir(dirname(this.filePath), { recursive: true })
    const temporary = `${this.filePath}.${process.pid}.tmp`
    await writeFile(temporary, JSON.stringify({ scope: normalized }, null, 2), { mode: 0o600 })
    await rename(temporary, this.filePath)
    this.#cached = normalized
    return normalized
  }

  /** True when the user still has to pick projects in `/setup`. */
  async isEmpty(): Promise<boolean> {
    const scope = await this.getScope()
    return scope.projects.length === 0 && scope.groups.length === 0
  }
}

export const scopeStore = new ScopeStore()
