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

export function useStops(): { stops: StopResponse[]; loading: boolean } {
  const [stops, setStops] = useState<StopResponse[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let active = true
    loadStops().then((s) => {
      if (!active) return
      setStops(s)
      setLoading(false)
    })
    return () => {
      active = false
    }
  }, [])

  return { stops, loading }
}
