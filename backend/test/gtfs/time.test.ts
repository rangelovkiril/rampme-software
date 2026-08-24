import { describe, expect, test } from 'bun:test'
import { computeScheduledEtaMinutes, normalizeGtfsHour, parseGtfsTime } from '../../src/gtfs/time'

/**
 * Unix seconds for a given Europe/Sofia local wall-clock time, resolved via an
 * Intl round-trip so it's correct regardless of DST (time.ts always reads the
 * `Europe/Sofia` zone, independent of the machine running the tests).
 */
function sofiaEpochSeconds(y: number, m: number, d: number, hh: number, mm: number): number {
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
  return Math.floor(guess / 1000)
}

describe('parseGtfsTime', () => {
  test('parses a normal HH:MM(:SS) time', () => {
    expect(parseGtfsTime('08:15')).toEqual({ hours: 8, minutes: 15, totalMinutes: 495 })
  })

  test('parses a GTFS time >= 24:00 without wrapping', () => {
    expect(parseGtfsTime('26:52')).toEqual({ hours: 26, minutes: 52, totalMinutes: 1612 })
  })
})

describe('normalizeGtfsHour', () => {
  test('leaves a normal time unchanged', () => {
    expect(normalizeGtfsHour('08:15')).toBe('08:15')
  })

  test('wraps a GTFS 24+ hour time into the next day', () => {
    expect(normalizeGtfsHour('26:52')).toBe('02:52')
  })
})

describe('computeScheduledEtaMinutes', () => {
  test('returns the plain diff for a same-day future stop', () => {
    const nowSec = sofiaEpochSeconds(2024, 1, 15, 10, 0) // currentMinutes = 600
    const totalGtfsMinutes = 630 // 10:30
    expect(computeScheduledEtaMinutes(totalGtfsMinutes, nowSec)).toBe(30)
  })

  test('returns null for a slightly-past stop within PAST_GRACE_MINUTES', () => {
    const nowSec = sofiaEpochSeconds(2024, 1, 15, 10, 0) // currentMinutes = 600
    const totalGtfsMinutes = 597 // 09:57, 3 minutes ago
    expect(computeScheduledEtaMinutes(totalGtfsMinutes, nowSec)).toBeNull()
  })

  test('wraps a near-midnight stop past WRAP_THRESHOLD_MINUTES (now 23:58, scheduled 00:07)', () => {
    const nowSec = sofiaEpochSeconds(2024, 1, 15, 23, 58) // currentMinutes = 1438
    const totalGtfsMinutes = 7 // 00:07
    expect(computeScheduledEtaMinutes(totalGtfsMinutes, nowSec)).toBe(9)
  })

  test('returns null for a stale previous-day stop seen after midnight', () => {
    const nowSec = sofiaEpochSeconds(2024, 1, 15, 0, 10) // currentMinutes = 10
    const totalGtfsMinutes = 1430 // 23:50, from before midnight — large positive diff
    expect(computeScheduledEtaMinutes(totalGtfsMinutes, nowSec)).toBeNull()
  })
})
