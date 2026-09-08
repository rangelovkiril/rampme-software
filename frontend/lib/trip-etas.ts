import type { TripEtaUpdate } from '@backend/schemas'

/**
 * Applies live ETA updates onto a trip's stops. Stops the update batch does not
 * mention keep their scheduled values, so a partial batch never blanks the rest
 * of the trip.
 */
export function applyEtaUpdates<T extends { stopId: string }>(
  stops: T[],
  etas: TripEtaUpdate[],
): T[] {
  const byStopId = new Map(etas.map((e) => [e.stopId, e]))
  return stops.map((s) => {
    const update = byStopId.get(s.stopId)
    return update ? { ...s, ...update } : s
  })
}
