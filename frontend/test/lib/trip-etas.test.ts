import { describe, expect, test } from 'bun:test'
import type { TripEtaUpdate } from '@backend/schemas'
import { applyEtaUpdates } from '@/lib/trip-etas'

function eta(stop_id: string, over: Partial<TripEtaUpdate> = {}): TripEtaUpdate {
  return {
    stop_id,
    eta_minutes: 4,
    status: 'on_time',
    expected_time: '09:12',
    delay_minutes: 0,
    realtime: true,
    ...over,
  }
}

const stops: Array<{
  stop_id: string
  eta_minutes: number | null
  status: TripEtaUpdate['status']
  realtime: boolean
}> = [
  { stop_id: 'A', eta_minutes: 10, status: 'scheduled', realtime: false },
  { stop_id: 'B', eta_minutes: 20, status: 'scheduled', realtime: false },
]

describe('applyEtaUpdates', () => {
  test('applies an update to the matching stop', () => {
    const [a] = applyEtaUpdates(stops, [eta('A', { eta_minutes: 2, status: 'delay' })])
    expect(a.eta_minutes).toBe(2)
    expect(a.status).toBe('delay')
    expect(a.realtime).toBe(true)
  })

  test('leaves stops the batch does not mention untouched', () => {
    const [, b] = applyEtaUpdates(stops, [eta('A')])
    expect(b.eta_minutes).toBe(20)
    expect(b.status).toBe('scheduled')
  })

  test('ignores updates for stops not on the trip', () => {
    expect(applyEtaUpdates(stops, [eta('ZZZ')])).toEqual(stops)
  })

  test('preserves stop order', () => {
    const result = applyEtaUpdates(stops, [eta('B'), eta('A')])
    expect(result.map((s) => s.stop_id)).toEqual(['A', 'B'])
  })

  test('returns a new array rather than mutating the input', () => {
    const result = applyEtaUpdates(stops, [eta('A')])
    expect(result).not.toBe(stops)
    expect(stops[0].eta_minutes).toBe(10)
  })
})
