interface CacheEntry<T> {
  data: T
  fetchedAt: number
}

export function createCache<T>(ttlMs: number) {
  let entry: CacheEntry<T> | null = null
  let inflight: Promise<T> | null = null

  return async (fetcher: () => Promise<T>): Promise<T> => {
    if (entry && Date.now() - entry.fetchedAt < ttlMs) return entry.data

    // Deduplicate concurrent requests: reuse the in-flight promise if one exists
    if (inflight) return inflight

    inflight = fetcher()
      .then((data) => {
        entry = { data, fetchedAt: Date.now() }
        inflight = null
        return data
      })
      .catch((err) => {
        inflight = null
        throw err
      })

    return inflight
  }
}
