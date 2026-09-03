import { describe, expect, it } from 'bun:test'
import { parseGtfsZip } from '../../src/gtfs/static'

const fixturePath = `${import.meta.dir}/../fixtures/gtfs-static.zip`

describe('parseGtfsZip', () => {
  it('parses stops, routes, trips, and stop_times into the expected counts', async () => {
    const buf = await Bun.file(fixturePath).arrayBuffer()
    const gtfs = await parseGtfsZip(buf)

    expect(gtfs.stops.size).toBe(2)
    expect(gtfs.routes.size).toBe(2)
    expect(gtfs.trips.size).toBe(2)
    expect(gtfs.stopTimes).toHaveLength(3)
    expect(gtfs.calendarDates).toHaveLength(1)
  })

  it('normalizes an extended route_type (900, tram range) to the base tram type (0)', async () => {
    const buf = await Bun.file(fixturePath).arrayBuffer()
    const gtfs = await parseGtfsZip(buf)

    expect(gtfs.routes.get('R1')?.route_type).toBe(3) // already a base type, unchanged
    expect(gtfs.routes.get('R2')?.route_type).toBe(0) // 900 (extended tram) -> 0
  })

  it('keeps a GTFS 24+ hour stop_time as-is (no wraparound during parsing)', async () => {
    const buf = await Bun.file(fixturePath).arrayBuffer()
    const gtfs = await parseGtfsZip(buf)

    const t2Times = gtfs.stopTimesByTrip.get('T2')
    expect(t2Times).toHaveLength(1)
    expect(t2Times?.[0].arrival_time).toBe('25:15:00')
    expect(t2Times?.[0].stop_id).toBe('S1')
  })

  it('indexes stop_times by stop and by trip, and stop_ids served by each route', async () => {
    const buf = await Bun.file(fixturePath).arrayBuffer()
    const gtfs = await parseGtfsZip(buf)

    expect(gtfs.stopTimesByStop.get('S1')).toHaveLength(2) // T1's first stop + T2's stop
    expect(gtfs.stopTimesByTrip.get('T1')).toHaveLength(2)
    expect(gtfs.stopIdsByRoute.get('R1')).toEqual(new Set(['S1', 'S2']))
  })
})
