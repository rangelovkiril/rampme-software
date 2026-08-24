import { describe, expect, test } from 'bun:test'
import type { CalendarDate, GtfsData, StopTime, Trip } from '../../../src/gtfs/types'
import type { ArrivalResult } from '../../../src/services/transit/arrivals'
import {
  collectScheduledArrivals,
  deduplicateAndSort,
} from '../../../src/services/transit/arrivals'

/**
 * Date object for a given Europe/Sofia local wall-clock time, resolved via an
 * Intl round-trip so it's correct regardless of DST (gtfs/time.ts always reads
 * the `Europe/Sofia` zone, independent of the machine running the tests).
 */
function sofiaDate(y: number, m: number, d: number, hh: number, mm: number): Date {
  const target = Date.UTC(y, m - 1, d, hh, mm, 0)
  let guess = target
  for (let i = 0; i < 3; i++) {
    const parts = new Intl.DateTimeFormat('en', {
      timeZone: 'Europe/Sofia',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    }).formatToParts(new Date(guess))
    const get = (type: string) => Number(parts.find((p) => p.type === type)!.value)
    const gotUtc = Date.UTC(
      get('year'),
      get('month') - 1,
      get('day'),
      get('hour') % 24,
      get('minute'),
      get('second'),
    )
    guess += target - gotUtc
  }
  return new Date(guess)
}

function trip(trip_id: string, service_id: string): Trip {
  return {
    trip_id,
    route_id: 'r1',
    service_id,
    trip_headsign: '',
    direction_id: 0,
    shape_id: '',
    wheelchair_accessible: 0,
  }
}

function stopTime(trip_id: string, stop_id: string, arrival_time: string): StopTime {
  return { trip_id, arrival_time, departure_time: arrival_time, stop_id, stop_sequence: 1 }
}

function gtfsData(opts: {
  trips?: Trip[]
  stopTimesByStop?: Map<string, StopTime[]>
  calendarDates?: CalendarDate[]
}): GtfsData {
  return {
    stops: new Map(),
    stopsByCode: new Map(),
    routes: new Map(),
    trips: new Map((opts.trips ?? []).map((t) => [t.trip_id, t])),
    tripsByRoute: new Map(),
    stopTimes: [],
    stopTimesByStop: opts.stopTimesByStop ?? new Map(),
    stopTimesByTrip: new Map(),
    stopIdsByRoute: new Map(),
    calendarDates: opts.calendarDates ?? [],
    shapes: new Map(),
    shapesByRoute: new Map(),
  }
}

describe('collectScheduledArrivals', () => {
  test('includes a same-day scheduled arrival within the active service', () => {
    const now = sofiaDate(2024, 1, 15, 10, 0) // currentTime 10:00:00
    const data = gtfsData({
      trips: [trip('t1', 'svc-today')],
      stopTimesByStop: new Map([['stopA', [stopTime('t1', 'stopA', '10:30:00')]]]),
    })

    const result = collectScheduledArrivals(data, ['stopA'], new Set(['svc-today']), now)

    expect(result).toEqual([{ trip_id: 't1', arrival_time: '10:30:00', stop_id: 'stopA' }])
  })

  test("includes an after-midnight arrival from yesterday's service via fromYesterdayService", () => {
    const now = sofiaDate(2024, 1, 15, 0, 10) // currentTime 00:10:00, currentMinutes = 10
    const data = gtfsData({
      trips: [trip('t2', 'svc-yesterday')],
      stopTimesByStop: new Map([['stopA', [stopTime('t2', 'stopA', '24:15:00')]]]), // totalMinutes 1455 >= 10 + 1440
      calendarDates: [{ service_id: 'svc-yesterday', date: '20240114', exception_type: 1 }],
    })

    // svc-yesterday isn't active today — only reachable via yesterdayServices, computed internally from calendarDates.
    const result = collectScheduledArrivals(data, ['stopA'], new Set(), now)

    expect(result).toEqual([
      { trip_id: 't2', arrival_time: '24:15:00', stop_id: 'stopA', fromYesterdayService: true },
    ])
  })

  test('includes arrivals at a sibling stop_id', () => {
    const now = sofiaDate(2024, 1, 15, 10, 0)
    const data = gtfsData({
      trips: [trip('t3', 'svc-today')],
      stopTimesByStop: new Map([['TB2795', [stopTime('t3', 'TB2795', '10:20:00')]]]),
    })

    const result = collectScheduledArrivals(data, ['A2795', 'TB2795'], new Set(['svc-today']), now)

    expect(result).toEqual([{ trip_id: 't3', arrival_time: '10:20:00', stop_id: 'TB2795' }])
  })

  test('excludes a trip whose service_id is inactive on both today and yesterday', () => {
    const now = sofiaDate(2024, 1, 15, 10, 0)
    const data = gtfsData({
      trips: [trip('t4', 'svc-none')],
      stopTimesByStop: new Map([['stopA', [stopTime('t4', 'stopA', '10:30:00')]]]),
    })

    const result = collectScheduledArrivals(data, ['stopA'], new Set(['svc-today']), now)

    expect(result).toEqual([])
  })
})

function arrival(id: string, eta_minutes: number): ArrivalResult {
  return {
    id,
    vehicle_id: null,
    route_short_name: null,
    route_type: null,
    headsign: null,
    route_id: null,
    scheduled_time: null,
    expected_time: null,
    eta_minutes,
    realtime: false,
    has_ramp: false,
  }
}

describe('deduplicateAndSort', () => {
  test('collapses duplicate ids to the first occurrence', () => {
    const result = deduplicateAndSort([arrival('dup', 50), arrival('dup', 5)], 10)

    expect(result).toEqual([arrival('dup', 50)])
  })

  test('sorts results by eta_minutes ascending', () => {
    const result = deduplicateAndSort([arrival('c', 30), arrival('a', 5), arrival('b', 15)], 10)

    expect(result.map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  test('limit truncates the results', () => {
    const result = deduplicateAndSort([arrival('a', 1), arrival('b', 2), arrival('c', 3)], 2)

    expect(result.map((r) => r.id)).toEqual(['a', 'b'])
  })
})
