import type { GtfsData } from '../gtfs/types'

let gtfs: GtfsData | undefined

export function getGtfs(): GtfsData | undefined {
  return gtfs
}

export function setGtfs(data: GtfsData) {
  gtfs = data
}
