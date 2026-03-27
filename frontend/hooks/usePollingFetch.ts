'use client'

import { useCallback, useEffect, useRef, useState } from 'react'

interface UsePollingFetchOptions<T> {
  url: string | null
  intervalMs: number
  transform?: (data: unknown) => T
}

interface UsePollingFetchResult<T> {
  data: T | null
  loading: boolean
  error: string | null
  refetch: () => void
}

/**
 * Fetches JSON from `url` on mount and re-fetches every `intervalMs`.
 * Returns `{ data, loading, error, refetch }`.
 *
 * Pass `url: null` to disable fetching (resets state).
 */
export function usePollingFetch<T>({
  url,
  intervalMs,
  transform,
}: UsePollingFetchOptions<T>): UsePollingFetchResult<T> {
  const [data, setData] = useState<T | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const isInitialRef = useRef(true)

  const fetchData = useCallback(async () => {
    if (!url) return

    const isInitial = isInitialRef.current
    if (isInitial) {
      setLoading(true)
      isInitialRef.current = false
    }

    try {
      const res = await fetch(url)
      if (!res.ok) {
        if (isInitial) setError(`Request failed: ${res.status}`)
        return
      }
      const raw = await res.json()
      const result = transform ? transform(raw) : (raw as T)
      setData(result)
      setError(null)
    } catch {
      if (isInitial) {
        setError('Could not load data.')
        setData(null)
      }
    } finally {
      if (isInitial) setLoading(false)
    }
  }, [url, transform])

  useEffect(() => {
    if (!url) {
      setData(null)
      setLoading(false)
      setError(null)
      isInitialRef.current = true
      return
    }

    isInitialRef.current = true
    fetchData()
    const id = setInterval(fetchData, intervalMs)
    return () => clearInterval(id)
  }, [url, intervalMs, fetchData])

  return { data, loading, error, refetch: fetchData }
}
