import type { GtfsData } from '../gtfs/types'

let gtfs: GtfsData | undefined

export function getGtfs(): GtfsData | undefined {
  return gtfs
}

export function setGtfs(data: GtfsData) {
  gtfs = data
}

export function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
