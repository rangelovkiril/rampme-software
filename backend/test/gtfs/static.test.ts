import { describe, expect, it } from 'bun:test'
import { parseGtfsZip, splitCsvLine } from '../../src/gtfs/static'

const fixturePath = `${import.meta.dir}/../fixtures/gtfs-static.zip`

describe('parseGtfsZip', () => {
  it('parses stops, routes, trips, and stop_times into the expected counts', async () => {
    const buf = await Bun.file(fixturePath).arrayBuffer()
    const gtfs = await parseGtfsZip(buf)

    expect(gtfs.stops.size).toBe(2)
    expect(gtfs.routes.size).toBe(2)
    expect(gtfs.trips.size).toBe(2)
    expect([...gtfs.stopTimesByTrip.values()].flat()).toHaveLength(3)
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

describe('splitCsvLine', () => {
  it('splits a plain line on commas', () => {
    expect(splitCsvLine('A0328,0328,BUL,42.7,23.3')).toEqual([
      'A0328',
      '0328',
      'BUL',
      '42.7',
      '23.3',
    ])
  })

  it('keeps a comma inside a quoted field, so later columns do not shift', () => {
    // Real shape from Sofia's stops.txt: a quoted stop_name containing a comma.
    expect(splitCsvLine('A0650,0650,"Ж.К. ЛЮЛИН-1, бл. 5",42.729,23.245')).toEqual([
      'A0650',
      '0650',
      'Ж.К. ЛЮЛИН-1, бл. 5',
      '42.729',
      '23.245',
    ])
  })

  it('unescapes a doubled quote inside a quoted field', () => {
    expect(splitCsvLine('a,"say ""hi""",b')).toEqual(['a', 'say "hi"', 'b'])
  })

  it('keeps empty fields in position', () => {
    expect(splitCsvLine('a,,c,')).toEqual(['a', '', 'c', ''])
  })

  it('trims each field, matching how every other row was already parsed', () => {
    expect(splitCsvLine('  a , " b " ')).toEqual(['a', 'b'])
  })
})
