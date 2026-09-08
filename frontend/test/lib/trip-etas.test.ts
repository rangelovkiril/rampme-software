import { describe, expect, test } from 'bun:test'
import type { TripEtaUpdate } from '@backend/schemas'
import { applyEtaUpdates } from '@/lib/trip-etas'

function eta(stopId: string, over: Partial<TripEtaUpdate> = {}): TripEtaUpdate {
  return {
    stopId,
    etaMinutes: 4,
    status: 'on_time',
    expectedTime: '09:12',
    delayMinutes: 0,
    realtime: true,
    ...over,
  }
}

const stops: Array<{
  stopId: string
  etaMinutes: number | null
  status: TripEtaUpdate['status']
  realtime: boolean
}> = [
  { stopId: 'A', etaMinutes: 10, status: 'scheduled', realtime: false },
  { stopId: 'B', etaMinutes: 20, status: 'scheduled', realtime: false },
]

describe('applyEtaUpdates', () => {
  test('applies an update to the matching stop', () => {
    const [a] = applyEtaUpdates(stops, [eta('A', { etaMinutes: 2, status: 'delay' })])
    expect(a.etaMinutes).toBe(2)
    expect(a.status).toBe('delay')
    expect(a.realtime).toBe(true)
  })

  test('leaves stops the batch does not mention untouched', () => {
    const [, b] = applyEtaUpdates(stops, [eta('A')])
    expect(b.etaMinutes).toBe(20)
    expect(b.status).toBe('scheduled')
  })

  test('ignores updates for stops not on the trip', () => {
    expect(applyEtaUpdates(stops, [eta('ZZZ')])).toEqual(stops)
  })

  test('preserves stop order', () => {
    const result = applyEtaUpdates(stops, [eta('B'), eta('A')])
    expect(result.map((s) => s.stopId)).toEqual(['A', 'B'])
  })

  test('returns a new array rather than mutating the input', () => {
    const result = applyEtaUpdates(stops, [eta('A')])
    expect(result).not.toBe(stops)
    expect(stops[0].etaMinutes).toBe(10)
  })
})
