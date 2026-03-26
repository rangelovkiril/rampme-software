interface CacheEntry<T> {
  data: T;
  fetchedAt: number;
}

export function createCache<T>(ttlMs: number) {
  let entry: CacheEntry<T> | null = null;
  let inflight: Promise<T> | null = null; // 👈 добавено

  return async (fetcher: () => Promise<T>): Promise<T> => {
    if (entry && Date.now() - entry.fetchedAt < ttlMs) return entry.data;

    // Ако вече има текуща заявка, изчакай нея вместо да правиш нова
    if (inflight) return inflight; // 👈 добавено

    inflight = fetcher()
      .then((data) => {
        entry = { data, fetchedAt: Date.now() };
        inflight = null;
        return data;
      })
      .catch((err) => {
        inflight = null; // При грешка — позволи retry
        throw err;
      });

    return inflight;
  };
}
