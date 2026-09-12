import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import { chmod, mkdir, readFile, rename, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  normalizeScopeSelection,
  selectedGroups,
  selectedProjects,
  type ProviderGroup,
  type ProviderProject,
  type ProviderUser,
  type ScopeSelection,
} from '@horizon/domain'
export type { ScopeSelection } from '@horizon/domain'

export interface StoredConnection {
  readonly url: string
  readonly user: ProviderUser
}

interface DiskRecord {
  readonly url: string
  readonly token: string
  readonly user: ProviderUser
  readonly scope?: ScopeSelection
  readonly sessionHash?: string
}

const dataFile = process.env.HORIZON_DATA_FILE ?? join(process.cwd(), '.horizon', 'connection.json')

const encryptionKey = (): Buffer => {
  const configured = process.env.HORIZON_ENCRYPTION_KEY
  if (!configured || configured.length < 32)
    throw new Error('HORIZON_ENCRYPTION_KEY deve ter pelo menos 32 caracteres.')
  return createHash('sha256').update(configured).digest()
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

  async createSession(): Promise<string> {
    const record = await readRecord(this.filePath)
    if (!record) throw new Error('Configure uma Conexão antes de iniciar a sessão.')
    const session = randomBytes(32).toString('base64url')
    await writeRecord(this.filePath, { ...record, sessionHash: hashSession(session) })
    return session
  }

  async requireSession(session: string | undefined): Promise<void> {
    const record = await readRecord(this.filePath)
    if (!session || !record?.sessionHash || hashSession(session) !== record.sessionHash)
      throw new Error('Sessão inválida ou expirada.')
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
    const normalized = normalizeScopeSelection(scope)
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
    return {
      groups: selectedGroups(groups, scope),
      projects: selectedProjects(projects, scope),
    }
  }
}

const hashSession = (session: string): string => createHash('sha256').update(session).digest('hex')

export const connectionStore = new ConnectionStore()
