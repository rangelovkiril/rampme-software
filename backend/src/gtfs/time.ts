const TZ = process.env.TZ ?? 'Europe/Sofia'

function localParts(now: Date) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).formatToParts(now)
  const get = (type: string) => Number(parts.find((p) => p.type === type)!.value)
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hours: get('hour'),
    minutes: get('minute'),
    seconds: get('second'),
  }
}

/** Today's date as YYYYMMDD string (GTFS calendar format) */
export function todayDateStr(now = new Date()): string {
  const { year, month, day } = localParts(now)
  return `${year}${String(month).padStart(2, '0')}${String(day).padStart(2, '0')}`
}

/** Current time as HH:MM:SS */
export function nowHHMMSS(now = new Date()): string {
  const { hours, minutes, seconds } = localParts(now)
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

/** Current minutes since midnight */
export function nowTotalMinutes(now = new Date()): number {
  const { hours, minutes } = localParts(now)
  return hours * 60 + minutes
}

/** Parse a GTFS time string (may be ≥24h) into { hours, minutes, totalMinutes } */
export function parseGtfsTime(time: string): {
  hours: number
  minutes: number
  totalMinutes: number
} {
  const [h, m] = time.split(':').map(Number)
  return { hours: h, minutes: m, totalMinutes: h * 60 + m }
}

/** Normalize GTFS 24+ hour times (e.g. "26:52" → "02:52") */
export function normalizeGtfsHour(time: string): string {
  const { hours, minutes } = parseGtfsTime(time)
  return `${String(hours % 24).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

/** Format a unix timestamp to HH:MM in the configured timezone */
export function unixToHHMM(unix: number): string {
  const { hours, minutes } = localParts(new Date(unix * 1000))
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`
}

const PAST_GRACE_MINUTES = 5
const WRAP_THRESHOLD_MINUTES = 12 * 60
const MAX_REASONABLE_FALLBACK_ETA_MINUTES = 6 * 60

/**
 * ETA in minutes for a scheduled (non-realtime) GTFS stop time, handling the
 * midnight wrap: a same-day diff far in the past (e.g. 23:58 now, 00:07
 * scheduled) is reinterpreted as a next-day arrival. Returns null when the
 * stop should be considered already passed rather than shown with an eta.
 */
export function computeScheduledEtaMinutes(
  totalGtfsMinutes: number,
  nowSec: number,
): number | null {
  const currentMinutes = nowTotalMinutes(new Date(nowSec * 1000))
  const day = 24 * 60
  const rawDiff = totalGtfsMinutes - currentMinutes

  // Normal same-day future stop.
  if (rawDiff >= 0 && rawDiff <= MAX_REASONABLE_FALLBACK_ETA_MINUTES) {
    return rawDiff
  }

  // Slightly past stop should be considered departed, not wrapped to +24h.
  if (rawDiff < 0 && rawDiff >= -PAST_GRACE_MINUTES) {
    return null
  }

  // Large negative diff likely means near-midnight wrap (e.g. 23:58 -> 00:07).
  if (rawDiff < -WRAP_THRESHOLD_MINUTES) {
    const wrapped = rawDiff + day
    if (wrapped >= 0 && wrapped <= MAX_REASONABLE_FALLBACK_ETA_MINUTES) {
      return wrapped
    }
    return null
  }

  // Large positive diff is usually a previous-day stop seen after midnight.
  if (rawDiff > WRAP_THRESHOLD_MINUTES) {
    return null
  }

  return rawDiff >= 0 ? rawDiff : null
}
