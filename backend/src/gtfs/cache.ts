interface CacheEntry<T> {
  data: T
  fetchedAt: number
}

export function createCache<T>(ttlMs: number) {
  let entry: CacheEntry<T> | null = null

  return async (fetcher: () => Promise<T>): Promise<T> => {
    if (entry && Date.now() - entry.fetchedAt < ttlMs) return entry.data
    entry = { data: await fetcher(), fetchedAt: Date.now() }
    return entry.data
  }
}
