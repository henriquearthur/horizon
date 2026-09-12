import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import type { ProviderGroup, ProviderProject, ProviderUser } from '@horizon/domain'

export interface StoredConnection {
  readonly url: string
  readonly user: ProviderUser
}

export interface ScopeSelection {
  readonly groups: readonly string[]
  readonly projects: readonly number[]
  readonly followGroups: readonly string[]
}

interface DiskRecord {
  readonly url: string
  readonly token: string
  readonly user: ProviderUser
  readonly scope?: ScopeSelection
}

const dataFile = process.env.HORIZON_DATA_FILE ?? join(process.cwd(), '.horizon', 'connection.json')

const encryptionKey = (): Buffer => {
  const configured = process.env.HORIZON_ENCRYPTION_KEY
  // A development fallback keeps first-run setup usable. Production deployments
  // should always set this value so restarting the server retains the secret.
  return createHash('sha256')
    .update(configured || 'horizon-development-key')
    .digest()
}

const encrypt = (value: string): string => {
  const iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(), iv)
  const encrypted = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()])
  return [
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    encrypted.toString('base64url'),
  ].join('.')
}

const decrypt = (value: string): string => {
  const [ivText, tagText, encryptedText] = value.split('.')
  if (!ivText || !tagText || !encryptedText) throw new Error('Credencial armazenada inválida.')
  const decipher = createDecipheriv(
    'aes-256-gcm',
    encryptionKey(),
    Buffer.from(ivText, 'base64url'),
  )
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'))
  return Buffer.concat([
    decipher.update(Buffer.from(encryptedText, 'base64url')),
    decipher.final(),
  ]).toString('utf8')
}

const readRecord = async (filePath: string): Promise<DiskRecord | undefined> => {
  try {
    return JSON.parse(await readFile(filePath, 'utf8')) as DiskRecord
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined
    throw error
  }
}

const writeRecord = async (filePath: string, record: DiskRecord): Promise<void> => {
  await mkdir(dirname(filePath), { recursive: true })
  const temporary = `${filePath}.${process.pid}.tmp`
  await writeFile(temporary, JSON.stringify(record), { mode: 0o600 })
  await chmod(temporary, 0o600)
  await rename(temporary, filePath)
}

/** Server-only repository. Token-bearing records never cross the browser boundary. */
export class ConnectionStore {
  constructor(private readonly filePath = dataFile) {}

  async getConnection(): Promise<StoredConnection | undefined> {
    const record = await readRecord(this.filePath)
    return record ? { url: record.url, user: record.user } : undefined
  }

  async getCredentials(): Promise<{ readonly url: string; readonly token: string } | undefined> {
    const record = await readRecord(this.filePath)
    return record ? { url: record.url, token: decrypt(record.token) } : undefined
  }

  async saveConnection(url: string, token: string, user: ProviderUser): Promise<StoredConnection> {
    const previous = await readRecord(this.filePath)
    await writeRecord(this.filePath, {
      url,
      token: encrypt(token),
      user,
      ...(previous?.scope ? { scope: previous.scope } : {}),
    })
    return { url, user }
  }

  async getScope(): Promise<ScopeSelection> {
    const record = await readRecord(this.filePath)
    return record?.scope ?? { groups: [], projects: [], followGroups: [] }
  }

  async saveScope(scope: ScopeSelection): Promise<ScopeSelection> {
    const record = await readRecord(this.filePath)
    if (!record) throw new Error('Configure uma Conexão antes de salvar o Escopo.')
    const normalized: ScopeSelection = {
      groups: [...new Set(scope.groups)].filter(Boolean),
      projects: [...new Set(scope.projects)].filter((id) => Number.isInteger(id)),
      followGroups: [...new Set(scope.followGroups)].filter((path) => scope.groups.includes(path)),
    }
    await writeRecord(this.filePath, { ...record, scope: normalized })
    return normalized
  }

  /** Resolve selected groups and projects into sidebar records. */
  async resolveScope(
    groups: readonly ProviderGroup[],
    projects: readonly ProviderProject[],
  ): Promise<{
    readonly groups: readonly ProviderGroup[]
    readonly projects: readonly ProviderProject[]
  }> {
    const scope = await this.getScope()
    const selectedGroups = groups.filter((group) => scope.groups.includes(group.fullPath))
    const selectedProjects = projects.filter(
      (project) =>
        scope.projects.includes(project.id) ||
        (project.groupPath !== undefined &&
          scope.followGroups.some(
            (group) => project.groupPath === group || project.groupPath.startsWith(`${group}/`),
          )),
    )
    return { groups: selectedGroups, projects: selectedProjects }
  }
}

export const connectionStore = new ConnectionStore()
