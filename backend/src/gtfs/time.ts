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
