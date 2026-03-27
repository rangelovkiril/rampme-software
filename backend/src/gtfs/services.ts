import { todayDateStr } from './time'
import type { CalendarDate } from './types'

/** Returns the set of service_ids active today (exception_type === 1) */
export function activeServiceIds(calendarDates: CalendarDate[], now = new Date()): Set<string> {
  const today = todayDateStr(now)
  return new Set(
    calendarDates
      .filter((cd) => cd.date === today && cd.exception_type === 1)
      .map((cd) => cd.service_id),
  )
}
