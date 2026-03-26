interface CacheEntry<T> {
  data: T
  fetchedAt: number
}

/**
 * Creates a time-to-live cache wrapper that serves cached values and coalesces concurrent fetches.
 *
 * @param ttlMs - Time-to-live in milliseconds after which a cached value is considered expired
 * @returns A function that accepts a `fetcher` and returns the cached value if fresh; otherwise it starts (or joins) a fetch and returns the fetched value. Concurrent callers while a fetch is in progress receive the same in-flight result.
 */
export function createCache<T>(ttlMs: number) {
  let entry: CacheEntry<T> | null = null
  let inflight: Promise<T> | null = null // 👈 добавено

  return async (fetcher: () => Promise<T>): Promise<T> => {
    if (entry && Date.now() - entry.fetchedAt < ttlMs) return entry.data

    // Ако вече има текуща заявка, изчакай нея вместо да правиш нова
    if (inflight) return inflight // 👈 добавено

    inflight = fetcher()
      .then((data) => {
        entry = { data, fetchedAt: Date.now() }
        inflight = null
        return data
      })
      .catch((err) => {
        inflight = null // При грешка — позволи retry
        throw err
      })

    return inflight
  }
}
