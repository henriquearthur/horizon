/** Horizon-owned metadata for a cross-repository initiative. */
export interface Initiative {
  readonly id: string
  readonly name: string
  readonly description: string
  readonly state: 'active' | 'archived'
  readonly createdAt: string
  readonly updatedAt: string
}

export type InitiativeInput = Pick<Initiative, 'name' | 'description' | 'state'>

/** Stable label used on GitLab issues.  Metadata never lives in the label. */
export const initiativeLabel = (id: string): string => `horizon::initiative::${id}`

const PREFIX = 'horizon::initiative::'

/** Returns the initiative id carried by a label, if it is valid. */
export const initiativeIdFromLabel = (label: string): string | undefined => {
  if (!label.startsWith(PREFIX)) return undefined
  const id = label.slice(PREFIX.length).trim()
  return id && /^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(id) ? id : undefined
}

/** Parses membership and rejects malformed or ambiguous Horizon labels. */
export const initiativeMembership = (labels: readonly string[]): string | undefined => {
  const ids = labels.map(initiativeIdFromLabel).filter((id): id is string => Boolean(id))
  if (ids.length > 1 && new Set(ids).size > 1)
    throw new Error('A Issue não pode pertencer a mais de uma Iniciativa.')
  return ids[0]
}

/**
 * A readable, stable id derived from the name. The id travels inside the label
 * on every Issue, so it has to survive a round trip through GitLab untouched.
 */
export const initiativeIdFromName = (name: string): string =>
  name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)

/** Every Projeto id the given labels mention, in the order they appear. */
export const initiativeIdsFromLabels = (labels: readonly string[]): readonly string[] => [
  ...new Set(labels.map(initiativeIdFromLabel).filter((id): id is string => Boolean(id))),
]

export interface InitiativeStore {
  list(): Promise<readonly Initiative[]>
  get(id: string): Promise<Initiative | undefined>
  put(initiative: Initiative): Promise<Initiative>
  remove(id: string): Promise<void>
}

/** Small persistent-catalog seam; production can provide a database-backed store. */
export class MemoryInitiativeStore implements InitiativeStore {
  #items = new Map<string, Initiative>()
  async list() {
    return [...this.#items.values()]
  }
  async get(id: string) {
    return this.#items.get(id)
  }
  async put(value: Initiative) {
    this.#items.set(value.id, value)
    return value
  }
  async remove(id: string) {
    this.#items.delete(id)
  }
}

export class InitiativeCatalog {
  constructor(private readonly store: InitiativeStore = new MemoryInitiativeStore()) {}
  list() {
    return this.store.list()
  }
  get(id: string) {
    return this.store.get(id)
  }
  async create(input: InitiativeInput, id = crypto.randomUUID()): Promise<Initiative> {
    const now = new Date().toISOString()
    return this.store.put({
      id,
      name: input.name.trim(),
      description: input.description.trim(),
      state: input.state,
      createdAt: now,
      updatedAt: now,
    })
  }
  async update(id: string, changes: Partial<InitiativeInput>): Promise<Initiative> {
    const current = await this.store.get(id)
    if (!current) throw new Error('Iniciativa não encontrada.')
    const next = {
      ...current,
      ...changes,
      ...(changes.name !== undefined ? { name: changes.name.trim() } : {}),
      ...(changes.description !== undefined ? { description: changes.description.trim() } : {}),
      updatedAt: new Date().toISOString(),
    }
    return this.store.put(next)
  }
  remove(id: string) {
    return this.store.remove(id)
  }
}
