import { describe, expect, it } from 'bun:test'
import JSZip from 'jszip'
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

describe('parseGtfsZip row validation', () => {
  /** A minimal feed, so a single deliberately malformed row is the only variable. */
  async function zipOf(overrides: Record<string, string>): Promise<ArrayBuffer> {
    const files: Record<string, string> = {
      'stops.txt': 'stop_id,stop_code,stop_name,stop_lat,stop_lon\nS1,1,Alpha,42.7,23.3\n',
      'routes.txt': 'route_id,route_short_name,route_long_name,route_type\nR1,1,One,3\n',
      'trips.txt':
        'trip_id,route_id,service_id,trip_headsign,shape_id,wheelchair_accessible\nT1,R1,SVC,Head,SH1,1\n',
      'stop_times.txt': 'trip_id,arrival_time,stop_id,stop_sequence\nT1,08:00:00,S1,1\n',
      'calendar_dates.txt': 'service_id,date,exception_type\nSVC,20260101,1\n',
      ...overrides,
    }
    const zip = new JSZip()
    for (const [name, body] of Object.entries(files)) zip.file(name, body)
    const buf = await zip.generateAsync({ type: 'arraybuffer' })
    return buf
  }

  it('drops a stop whose coordinates did not parse, instead of shipping NaN', async () => {
    const gtfs = await parseGtfsZip(
      await zipOf({
        'stops.txt':
          'stop_id,stop_code,stop_name,stop_lat,stop_lon\nS1,1,Alpha,42.7,23.3\nS2,2,Broken,,23.3\n',
      }),
    )

    expect(gtfs.stops.size).toBe(1)
    expect(gtfs.stops.has('S1')).toBe(true)
    expect(gtfs.stops.has('S2')).toBe(false)
  })

  it('drops a stop with an out-of-range coordinate', async () => {
    const gtfs = await parseGtfsZip(
      await zipOf({
        'stops.txt':
          'stop_id,stop_code,stop_name,stop_lat,stop_lon\nS1,1,Alpha,42.7,23.3\nS2,2,Wrong,999,23.3\n',
      }),
    )

    expect([...gtfs.stops.keys()]).toEqual(['S1'])
  })

  it('drops a stop_time whose arrival_time is not a GTFS time', async () => {
    const gtfs = await parseGtfsZip(
      await zipOf({
        'stop_times.txt':
          'trip_id,arrival_time,stop_id,stop_sequence\nT1,08:00:00,S1,1\nT1,soon,S1,2\n',
      }),
    )

    expect([...gtfs.stopTimesByTrip.values()].flat()).toHaveLength(1)
  })

  it('keeps a 24+ hour arrival_time, which is valid GTFS', async () => {
    const gtfs = await parseGtfsZip(
      await zipOf({
        'stop_times.txt': 'trip_id,arrival_time,stop_id,stop_sequence\nT1,25:15:00,S1,1\n',
      }),
    )

    expect(gtfs.stopTimesByTrip.get('T1')?.[0].arrival_time).toBe('25:15:00')
  })

  it('drops a calendar_date with an unusable exception_type', async () => {
    const gtfs = await parseGtfsZip(
      await zipOf({
        'calendar_dates.txt': 'service_id,date,exception_type\nSVC,20260101,1\nSVC,20260102,9\n',
      }),
    )

    expect(gtfs.calendarDates).toHaveLength(1)
  })

  it('one malformed row does not cost the rest of the feed', async () => {
    const gtfs = await parseGtfsZip(
      await zipOf({
        'stops.txt':
          'stop_id,stop_code,stop_name,stop_lat,stop_lon\nS1,1,Alpha,42.7,23.3\nS2,2,Broken,,23.3\n',
      }),
    )

    expect(gtfs.routes.size).toBe(1)
    expect(gtfs.trips.size).toBe(1)
    expect(gtfs.calendarDates).toHaveLength(1)
  })
})
