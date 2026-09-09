import { describe, expect, test } from 'bun:test'
import { getVehicleAccessibility } from '../../lib/vehicle-accessibility'

describe('vehicle equipment wording', () => {
  test('an active reservation still describes equipment, not deployment readiness', () => {
    expect(getVehicleAccessibility('working').text).toBe('С рампа')
    expect(getVehicleAccessibility('in_use').text).toBe('С рампа')
  })

  test('confirmed absence differs from unknown and missing data', () => {
    expect(getVehicleAccessibility('no_ramp').text).toBe('Без рампа')
    for (const status of ['unknown', undefined, null] as const) {
      expect(getVehicleAccessibility(status).text).toBe('Достъпност неизвестна')
    }
  })
})
