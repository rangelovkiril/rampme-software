/** Today's date as YYYYMMDD string (GTFS calendar format) */
export function todayDateStr(now = new Date()): string {
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
}

/** Current time as HH:MM:SS */
export function nowHHMMSS(now = new Date()): string {
  return `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}:${String(now.getSeconds()).padStart(2, '0')}`
}

/** Current minutes since midnight */
export function nowTotalMinutes(now = new Date()): number {
  return now.getHours() * 60 + now.getMinutes()
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

/** Format a unix timestamp to HH:MM */
export function unixToHHMM(unix: number): string {
  const d = new Date(unix * 1000)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}
