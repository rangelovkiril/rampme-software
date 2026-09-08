import { describe, expect, test } from 'bun:test'
import { config } from '../../../src/config'
import { computeDelayMinutes } from '../../../src/services/transit/trip-details'

// config.tz is captured when config/index.ts is first imported, so shifting the
// process timezone afterwards makes the two diverge. That divergence is the
// normal case in production: the container sets no TZ, so its local zone is UTC
// while config.tz stays Europe/Sofia.
const originalTz = process.env.TZ
process.env.TZ = config.tz === 'UTC' ? 'America/New_York' : 'UTC'

/** Minutes since midnight of an instant, read in the given IANA zone. */
function minutesSinceMidnightIn(tz: string, unixSec: number): number {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date(unixSec * 1000))
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value)
  return get('hour') * 60 + get('minute')
}

describe('computeDelayMinutes', () => {
  test('reads the prediction in config.tz, not the process timezone', () => {
    // 2026-06-15T09:07:00Z. Its wall clock differs between the two zones.
    const predArrival = Math.floor(Date.parse('2026-06-15T09:07:00Z') / 1000)

    const inConfigTz = minutesSinceMidnightIn(config.tz, predArrival)
    const inProcessTz =
      new Date(predArrival * 1000).getHours() * 60 + new Date(predArrival * 1000).getMinutes()
    // Guard the premise: the two zones really do disagree here.
    expect(inProcessTz).not.toBe(inConfigTz)

    // Scheduled five minutes before the prediction, expressed in config.tz.
    const scheduled = inConfigTz - 5
    expect(computeDelayMinutes(predArrival, scheduled)).toBe(5)
  })

  test('is zero when the prediction matches the schedule', () => {
    const predArrival = Math.floor(Date.parse('2026-06-15T09:07:00Z') / 1000)
    const scheduled = minutesSinceMidnightIn(config.tz, predArrival)
    expect(computeDelayMinutes(predArrival, scheduled)).toBe(0)
  })

  test('reports a negative delay for an early prediction', () => {
    const predArrival = Math.floor(Date.parse('2026-06-15T09:07:00Z') / 1000)
    const scheduled = minutesSinceMidnightIn(config.tz, predArrival) + 3
    expect(computeDelayMinutes(predArrival, scheduled)).toBe(-3)
  })

  test('projects a GTFS 24+ hour time onto the day the prediction falls on', () => {
    // 00:20 local, scheduled as "24:15" on the previous service day.
    const midnightish = Math.floor(Date.parse('2026-06-15T09:07:00Z') / 1000)
    const local = minutesSinceMidnightIn(config.tz, midnightish)
    // 24:15 expressed in GTFS minutes is 1455; near a same-day local time it
    // projects back a day rather than reading as a 24-hour delay.
    expect(computeDelayMinutes(midnightish, 24 * 60 + local)).toBe(0)
  })
})

process.env.TZ = originalTz
