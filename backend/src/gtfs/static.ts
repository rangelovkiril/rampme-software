import JSZip from 'jszip'
import { config } from '../config'
import type { GtfsData, Route, Stop, Trip } from './types'

/**
 * Parses a CSV string and maps each data row to a value using header fields as object keys.
 *
 * @param raw - CSV content as a string; the first line is treated as the header row
 * @param transform - Callback that receives a `Record<string, string>` where keys are header names and values are the corresponding cell text for a row
 * @returns An array of `T` values produced by applying `transform` to each CSV data row
 */
function parseCsv<T>(raw: string, transform: (row: Record<string, string>) => T): T[] {
  const lines = raw.trim().split('\n')
  const header = lines[0]
    .replace(/^\uFEFF/, '')
    .split(',')
    .map((h) => h.trim())
  const results: T[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map((v) => v.trim().replace(/^"|"$/g, ''))
    const row: Record<string, string> = {}
    for (let j = 0; j < header.length; j++) {
      row[header[j]] = values[j] ?? ''
    }
    results.push(transform(row))
  }

  return results
}

/**
 * Fetches a GTFS ZIP from the configured static URL, parses required CSV files, and constructs in-memory GTFS collections.
 *
 * @returns A `GtfsData` object containing:
 *  - `stops`: Map of `stop_id` → Stop
 *  - `routes`: Map of `route_id` → Route
 *  - `trips`: Map of `trip_id` → Trip
 *  - `stopTimes`: Array of stop time records
 *
 * @throws Error if the HTTP fetch response is not OK (message includes the response status).
 * @throws Error if an expected GTFS file (e.g., `stops.txt`, `routes.txt`, `trips.txt`, `stop_times.txt`) is missing from the ZIP.
 */
export async function fetchStaticGtfs(): Promise<GtfsData> {
  console.log('⏳ Fetching static GTFS data...')
  const res = await fetch(config.gtfs.staticUrl)

  if (!res.ok) throw new Error(`GTFS static fetch failed: ${res.status}`)

  const zip = await JSZip.loadAsync(await res.arrayBuffer())

  async function readFile(name: string): Promise<string> {
    const file = zip.file(name)
    if (!file) throw new Error(`Missing ${name} in GTFS ZIP`)
    return file.async('string')
  }

  const stops = new Map<string, Stop>()
  for (const s of parseCsv(await readFile('stops.txt'), (r) => ({
    stop_id: r.stop_id,
    stop_name: r.stop_name,
    stop_lat: parseFloat(r.stop_lat),
    stop_lon: parseFloat(r.stop_lon),
    wheelchair_boarding: Number(r.wheelchair_boarding || '0') as 0 | 1 | 2,
  }))) {
    stops.set(s.stop_id, s)
  }

  const routes = new Map<string, Route>()
  for (const r of parseCsv(await readFile('routes.txt'), (r) => ({
    route_id: r.route_id,
    route_short_name: r.route_short_name,
    route_long_name: r.route_long_name,
    route_type: Number(r.route_type),
  }))) {
    routes.set(r.route_id, r)
  }

  const trips = new Map<string, Trip>()
  for (const t of parseCsv(await readFile('trips.txt'), (r) => ({
    trip_id: r.trip_id,
    route_id: r.route_id,
    service_id: r.service_id,
    trip_headsign: r.trip_headsign ?? '',
    direction_id: Number(r.direction_id || '0'),
    wheelchair_accessible: Number(r.wheelchair_accessible || '0') as 0 | 1 | 2,
  }))) {
    trips.set(t.trip_id, t)
  }

  const stopTimes = parseCsv(await readFile('stop_times.txt'), (r) => ({
    trip_id: r.trip_id,
    arrival_time: r.arrival_time,
    departure_time: r.departure_time,
    stop_id: r.stop_id,
    stop_sequence: Number(r.stop_sequence),
  }))

  console.log(
    `✅ GTFS loaded: ${stops.size} stops, ${routes.size} routes, ${trips.size} trips, ${stopTimes.length} stop_times`,
  )

  return { stops, routes, trips, stopTimes }
}
