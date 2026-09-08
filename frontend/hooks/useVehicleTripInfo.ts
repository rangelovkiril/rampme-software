'use client'

import type { TripDetailResult as TripData, TripEtaUpdate } from '@backend/schemas'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useSSE } from '@/hooks/useSSE'
import { api } from '@/lib/api'
import { applyEtaUpdates } from '@/lib/trip-etas'

export type TripStop = TripData['stops'][number]

export interface VehicleTripInfo {
  trip: TripData | null
  /** The same stops, keyed for callers that look one up by id. */
  stopsById: Record<string, TripStop>
  loading: boolean
  failed: boolean
}

/**
 * A vehicle's trip with its stop ETAs kept live over SSE. Pass null to clear.
 *
 * ETA updates can arrive before the trip structure does, so the latest batch is
 * held in a ref and replayed onto the trip the moment it loads.
 */
export function useVehicleTripInfo(
  vehicleId: string | null,
  onLoaded?: (routeId: string | null, routeType: number | null) => void,
): VehicleTripInfo {
  const [trip, setTrip] = useState<TripData | null>(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)
  const etaUpdatesRef = useRef<TripEtaUpdate[] | null>(null)
  const onLoadedRef = useRef(onLoaded)

  useEffect(() => {
    onLoadedRef.current = onLoaded
  }, [onLoaded])

  useEffect(() => {
    if (!vehicleId) {
      setTrip(null)
      setFailed(false)
      return
    }

    const controller = new AbortController()
    setLoading(true)
    setFailed(false)

    api.realtime
      .vehicles({ id: vehicleId })
      .trip.get({ fetch: { signal: controller.signal } })
      .then(({ data, error }) => {
        if (error) throw error
        if (!data) throw new Error('empty trip response')
        return data
      })
      .then((data) => {
        if (controller.signal.aborted) return
        const etas = etaUpdatesRef.current
        setTrip(etas ? { ...data, stops: applyEtaUpdates(data.stops, etas) } : data)
        setFailed(false)
        onLoadedRef.current?.(data.route_id ?? null, data.route_type ?? null)
      })
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    return () => controller.abort()
  }, [vehicleId])

  const etaUpdates = useSSE<TripEtaUpdate[]>(
    vehicleId ? `/realtime/vehicles/${encodeURIComponent(vehicleId)}/trip/etas` : null,
  )

  useEffect(() => {
    etaUpdatesRef.current = etaUpdates
    if (!etaUpdates) return
    setTrip((prev) => (prev ? { ...prev, stops: applyEtaUpdates(prev.stops, etaUpdates) } : prev))
  }, [etaUpdates])

  const stopsById = useMemo(() => {
    const byId: Record<string, TripStop> = {}
    for (const s of trip?.stops ?? []) byId[s.stop_id] = s
    return byId
  }, [trip])

  return { trip, stopsById, loading, failed }
}
