import type { TripEtaUpdate } from '@/lib/types'

/**
 * Applies live ETA updates onto a trip's stops. Stops the update batch does not
 * mention keep their scheduled values, so a partial batch never blanks the rest
 * of the trip.
 */
export function applyEtaUpdates<T extends { stop_id: string }>(
  stops: T[],
  etas: TripEtaUpdate[],
): T[] {
  const byStopId = new Map(etas.map((e) => [e.stop_id, e]))
  return stops.map((s) => {
    const update = byStopId.get(s.stop_id)
    return update ? { ...s, ...update } : s
  })
}
