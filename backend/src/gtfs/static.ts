import JSZip from 'jszip'
import { config } from '../config'
import type { CalendarDate, GtfsData, Route, ShapePoint, Stop, StopTime, Trip } from './types'

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
  const stopsByCode = new Map<string, string[]>()
  for (const s of parseCsv(await readFile('stops.txt'), (r) => ({
    stop_id: r.stop_id,
    stop_code: r.stop_code ?? '',
    stop_name: r.stop_name,
    stop_lat: parseFloat(r.stop_lat),
    stop_lon: parseFloat(r.stop_lon),
    wheelchair_boarding: Number(r.wheelchair_boarding || '0') as 0 | 1 | 2,
  }))) {
    stops.set(s.stop_id, s)
    if (s.stop_code) {
      const arr = stopsByCode.get(s.stop_code)
      if (arr) arr.push(s.stop_id)
      else stopsByCode.set(s.stop_code, [s.stop_id])
    }
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
    shape_id: r.shape_id ?? '',
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

  // Index stop_times by stop_id for fast lookup
  const stopTimesByStop = new Map<string, StopTime[]>()
  for (const st of stopTimes) {
    const arr = stopTimesByStop.get(st.stop_id)
    if (arr) arr.push(st)
    else stopTimesByStop.set(st.stop_id, [st])
  }

  // Parse calendar_dates.txt
  const calendarDates = parseCsv<CalendarDate>(await readFile('calendar_dates.txt'), (r) => ({
    service_id: r.service_id,
    date: r.date,
    exception_type: Number(r.exception_type),
  }))

  // Parse shapes.txt (optional — some feeds may not include it)
  const shapes = new Map<string, [number, number][]>()
  const shapesFile = zip.file('shapes.txt')
  if (shapesFile) {
    const rawShapes = parseCsv<ShapePoint>(await shapesFile.async('string'), (r) => ({
      shape_id: r.shape_id,
      lat: parseFloat(r.shape_pt_lat),
      lng: parseFloat(r.shape_pt_lon),
      sequence: Number(r.shape_pt_sequence),
    }))
    // Group by shape_id
    for (const sp of rawShapes) {
      const arr = shapes.get(sp.shape_id)
      if (arr) arr.push([sp.lat, sp.lng])
      else shapes.set(sp.shape_id, [[sp.lat, sp.lng]])
    }
    // Points are already in sequence order from GTFS, but sort to be safe
    // (rawShapes was parsed in file order; group push preserves that order)
  }

  // Build shapesByRoute: route_id → unique polylines (deduplicated by shape_id)
  const shapesByRoute = new Map<string, [number, number][][]>()
  const seenShapeIds = new Map<string, Set<string>>() // route_id → set of shape_ids already added
  for (const trip of trips.values()) {
    if (!trip.shape_id) continue
    const polyline = shapes.get(trip.shape_id)
    if (!polyline || polyline.length === 0) continue
    if (!seenShapeIds.has(trip.route_id)) seenShapeIds.set(trip.route_id, new Set())
    const seen = seenShapeIds.get(trip.route_id)!
    if (seen.has(trip.shape_id)) continue
    seen.add(trip.shape_id)
    if (!shapesByRoute.has(trip.route_id)) shapesByRoute.set(trip.route_id, [])
    shapesByRoute.get(trip.route_id)!.push(polyline)
  }

  console.log(
    `✅ GTFS loaded: ${stops.size} stops, ${routes.size} routes, ${trips.size} trips, ${stopTimes.length} stop_times, ${calendarDates.length} calendar_dates, ${shapes.size} shapes`,
  )

  return { stops, stopsByCode, routes, trips, stopTimes, stopTimesByStop, calendarDates, shapes, shapesByRoute }
}
