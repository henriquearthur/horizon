/**
 * A value that is expensive to read from the Provider.
 *
 * The cache does two things that keep GitLab calm: it serves a fresh-enough
 * value without calling out again, and it collapses concurrent callers onto a
 * single in-flight read instead of firing one fan-out per browser tab.
 */
export class TimedCache<T> {
  #value: { readonly data: T; readonly at: number } | undefined
  #inFlight: Promise<T> | undefined

  constructor(
    private readonly ttlMs: number,
    private readonly load: () => Promise<T>,
  ) {}

  /** The cached value, reloading it when stale or when `force` is set. */
  async get({ force = false }: { force?: boolean } = {}): Promise<T> {
    const fresh = this.#value && Date.now() - this.#value.at < this.ttlMs
    if (fresh && !force) return this.#value!.data
    if (this.#inFlight) return this.#inFlight
    const request = this.load()
      .then((data) => {
        this.#value = { data, at: Date.now() }
        return data
      })
      .catch((error: unknown) => {
        // A failed refresh must not erase a value the user can still use.
        if (this.#value) return this.#value.data
        throw error
      })
      .finally(() => {
        this.#inFlight = undefined
      })
    this.#inFlight = request
    return request
  }

  /** The cached value when there is one, without ever calling the Provider. */
  peek(): T | undefined {
    return this.#value?.data
  }

  invalidate(): void {
    this.#value = undefined
  }
}
