import type { Static, TSchema } from '@sinclair/typebox'
import { TypeCompiler } from '@sinclair/typebox/compiler'
import { consola } from 'consola'
import JSZip from 'jszip'
import { config } from '../config'
import {
  CalendarDateSchema,
  type GtfsData,
  type Route,
  RouteSchema,
  ShapePointSchema,
  type Stop,
  StopSchema,
  type StopTime,
  StopTimeSchema,
  type Trip,
  TripSchema,
} from './types'

/**
 * Splits one CSV line, honouring RFC 4180 quoting: a comma inside a quoted
 * field is data, and a doubled quote inside one is a literal quote. Sofia's
 * feed relies on this — 234 rows of trips.txt and 6 of stops.txt carry a
 * comma inside a quoted name, and splitting on bare commas shifts every
 * column after it.
 */
export function splitCsvLine(line: string): string[] {
  const values: string[] = []
  let field = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuotes) {
      if (c === '"') {
        if (line[i + 1] === '"') {
          field += '"'
          i++
        } else {
          inQuotes = false
        }
      } else {
        field += c
      }
    } else if (c === '"') {
      inQuotes = true
    } else if (c === ',') {
      values.push(field.trim())
      field = ''
    } else {
      field += c
    }
  }
  values.push(field.trim())
  return values
}

/**
 * Parses a CSV file into rows that match `schema`. The feed is third-party, so
 * a row that does not match is dropped and counted rather than thrown on: one
 * malformed row must not cost the whole feed, and a row that silently kept its
 * mis-parsed values used to reach clients as NaN coordinates.
 */
function parseRows<S extends TSchema>(
  file: string,
  raw: string,
  schema: S,
  transform: (row: Record<string, string>) => unknown,
): Static<S>[] {
  const check = TypeCompiler.Compile(schema)
  const rows: Static<S>[] = []
  let dropped = 0

  for (const row of parseCsv(raw, transform)) {
    if (check.Check(row)) rows.push(row)
    else dropped++
  }

  if (dropped > 0) {
    consola.warn(`${file}: dropped ${dropped} row(s) that did not match the expected shape`)
  }
  return rows
}

function parseCsv<T>(raw: string, transform: (row: Record<string, string>) => T): T[] {
  const lines = raw.trim().split('\n')
  const header = splitCsvLine(lines[0].replace(/^\uFEFF/, ''))
  const results: T[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = splitCsvLine(lines[i])
    const row: Record<string, string> = {}
    for (let j = 0; j < header.length; j++) {
      row[header[j]] = values[j] ?? ''
    }
    results.push(transform(row))
  }

  return results
}

/** Map extended GTFS route_type values to the base types used in Sofia (0=tram, 1=metro, 3=bus, 11=trolleybus) */
function normalizeRouteType(raw: number): number {
  if ([0, 1, 3, 11].includes(raw)) return raw
  if (raw >= 700 && raw < 800) return 3 // Bus variants → bus
  if (raw >= 200 && raw < 300) return 3 // Coach → bus
  if (raw >= 800 && raw < 900) return 11 // Trolleybus variants → trolleybus
  if (raw >= 900 && raw < 1000) return 0 // Tram variants → tram
  if (raw >= 400 && raw < 500) return 1 // Metro/subway variants → metro
  return 3 // Default to bus for anything else in Sofia's context
}

/**
 * Parses a GTFS ZIP's bytes into in-memory GTFS collections. Pure aside from
 * reading the zip's own entries — no network — so tests can call it directly
 * against fixture bytes instead of a live fetch.
 */
export async function parseGtfsZip(buf: ArrayBuffer): Promise<GtfsData> {
  const zip = await JSZip.loadAsync(buf)

  async function readFile(name: string): Promise<string> {
    const file = zip.file(name)
    if (!file) throw new Error(`Missing ${name} in GTFS ZIP`)
    return file.async('string')
  }

  const stops = new Map<string, Stop>()
  const stopsByCode = new Map<string, string[]>()
  for (const s of parseRows('stops.txt', await readFile('stops.txt'), StopSchema, (r) => ({
    stop_id: r.stop_id,
    stop_code: r.stop_code ?? '',
    stop_name: r.stop_name,
    stop_lat: parseFloat(r.stop_lat),
    stop_lon: parseFloat(r.stop_lon),
  }))) {
    stops.set(s.stop_id, s)
    if (s.stop_code) {
      const arr = stopsByCode.get(s.stop_code)
      if (arr) arr.push(s.stop_id)
      else stopsByCode.set(s.stop_code, [s.stop_id])
    }
  }

  const routes = new Map<string, Route>()
  for (const r of parseRows('routes.txt', await readFile('routes.txt'), RouteSchema, (r) => ({
    route_id: r.route_id,
    route_short_name: r.route_short_name,
    route_long_name: r.route_long_name,
    route_type: normalizeRouteType(Number(r.route_type)),
  }))) {
    routes.set(r.route_id, r)
  }

  const trips = new Map<string, Trip>()
  const tripsByRoute = new Map<string, Trip[]>()
  for (const t of parseRows('trips.txt', await readFile('trips.txt'), TripSchema, (r) => ({
    trip_id: r.trip_id,
    route_id: r.route_id,
    service_id: r.service_id,
    trip_headsign: r.trip_headsign ?? '',
    shape_id: r.shape_id ?? '',
    wheelchair_accessible: Number(r.wheelchair_accessible || '0') as 0 | 1 | 2,
  }))) {
    trips.set(t.trip_id, t)
    const arr = tripsByRoute.get(t.route_id)
    if (arr) arr.push(t)
    else tripsByRoute.set(t.route_id, [t])
  }

  const stopTimes = parseRows(
    'stop_times.txt',
    await readFile('stop_times.txt'),
    StopTimeSchema,
    (r) => ({
      trip_id: r.trip_id,
      arrival_time: r.arrival_time,
      stop_id: r.stop_id,
      stop_sequence: Number(r.stop_sequence),
    }),
  )

  // Index stop_times by stop_id for fast lookup
  const stopTimesByStop = new Map<string, StopTime[]>()
  for (const st of stopTimes) {
    const arr = stopTimesByStop.get(st.stop_id)
    if (arr) arr.push(st)
    else stopTimesByStop.set(st.stop_id, [st])
  }

  // Index stop_times by trip_id for fast lookup, sorted by sequence
  const stopTimesByTrip = new Map<string, StopTime[]>()
  for (const st of stopTimes) {
    const arr = stopTimesByTrip.get(st.trip_id)
    if (arr) arr.push(st)
    else stopTimesByTrip.set(st.trip_id, [st])
  }
  for (const arr of stopTimesByTrip.values()) {
    arr.sort((a, b) => a.stop_sequence - b.stop_sequence)
  }

  // Index stop_ids served by each route, via its trips' stop_times
  const stopIdsByRoute = new Map<string, Set<string>>()
  for (const [routeId, routeTrips] of tripsByRoute) {
    const stopIds = new Set<string>()
    for (const trip of routeTrips) {
      const sts = stopTimesByTrip.get(trip.trip_id)
      if (!sts) continue
      for (const st of sts) stopIds.add(st.stop_id)
    }
    stopIdsByRoute.set(routeId, stopIds)
  }

  // Parse calendar_dates.txt
  const calendarDates = parseRows(
    'calendar_dates.txt',
    await readFile('calendar_dates.txt'),
    CalendarDateSchema,
    (r) => ({
      service_id: r.service_id,
      date: r.date,
      exception_type: Number(r.exception_type),
    }),
  )

  // Parse shapes.txt (optional — some feeds may not include it)
  const shapes = new Map<string, [number, number][]>()
  const shapesFile = zip.file('shapes.txt')
  if (shapesFile) {
    const rawShapes = parseRows(
      'shapes.txt',
      await shapesFile.async('string'),
      ShapePointSchema,
      (r) => ({
        shape_id: r.shape_id,
        lat: parseFloat(r.shape_pt_lat),
        lng: parseFloat(r.shape_pt_lon),
        sequence: Number(r.shape_pt_sequence),
      }),
    )
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

  consola.success(
    `GTFS loaded: ${stops.size} stops, ${routes.size} routes, ${trips.size} trips, ${stopTimes.length} stop_times, ${calendarDates.length} calendar_dates, ${shapes.size} shapes`,
  )

  return {
    stops,
    stopsByCode,
    routes,
    trips,
    tripsByRoute,
    stopTimesByStop,
    stopTimesByTrip,
    stopIdsByRoute,
    calendarDates,
    shapesByRoute,
  }
}

/**
 * Fetches a GTFS ZIP from the configured static URL and parses it via `parseGtfsZip()`.
 */
export async function fetchStaticGtfs(): Promise<GtfsData> {
  consola.start('Fetching static GTFS data...')
  const res = await fetch(config.gtfs.staticUrl)

  if (!res.ok) throw new Error(`GTFS static fetch failed: ${res.status}`)

  return parseGtfsZip(await res.arrayBuffer())
}
