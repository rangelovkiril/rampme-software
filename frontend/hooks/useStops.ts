'use client'

import type { StopResponse } from '@backend/schemas'
import { useEffect, useState } from 'react'
import { api } from '@/lib/api'

// StopsLayer and StopsPanel each used to fetch /stops independently, so a page
// load requested the full stop list twice. The promise is shared instead.
let stopsPromise: Promise<StopResponse[]> | null = null

function loadStops(): Promise<StopResponse[]> {
  stopsPromise ??= api.stops
    .get()
    .then(({ data }) => data ?? [])
    .catch(() => {
      // Let the next mount retry rather than caching the failure.
      stopsPromise = null
      return []
    })
  return stopsPromise
}

export function useStops(): {
  stops: StopResponse[]
  loading: boolean
  error: boolean
  retry: () => void
} {
  const [stops, setStops] = useState<StopResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)

  // The retry token deliberately re-runs the shared request after a failed load.
  // biome-ignore lint/correctness/useExhaustiveDependencies: retry token is the trigger.
  useEffect(() => {
    let active = true
    loadStops().then((s) => {
      if (!active) return
      setStops(s)
      setError(s.length === 0)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [attempt])

  return {
    stops,
    loading,
    error,
    retry: () => {
      stopsPromise = null
      setAttempt((value) => value + 1)
    },
  }
}
