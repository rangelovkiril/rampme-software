import { describe, expect, test } from 'bun:test'
import {
  type AccessibilitySighting,
  buildAccessibilityTable,
  type ModelAccessibility,
} from '../../src/gtfs/accessibility-table'

const modelAccessibility: Record<string, ModelAccessibility> = {
  ZK6126HGA: { low_floor: true },
  O405: { low_floor: false },
  'Unknown Model': { low_floor: null },
}

function sighting(overrides: Partial<AccessibilitySighting>): AccessibilitySighting {
  return {
    inventory: '2053',
    vehicleType: 'BUS',
    statusName: 'В движение',
    modelName: 'ZK6126HGA',
    ...overrides,
  }
}

describe('buildAccessibilityTable', () => {
  test('resolves an in-service vehicle to its model accessibility', () => {
    const table = buildAccessibilityTable([sighting({})], modelAccessibility)
    expect(table.BUS['2053']).toBe(true)
  })

  test('resolves a not-ramp-equipped model to false, not omitted', () => {
    const table = buildAccessibilityTable(
      [sighting({ inventory: '3669', modelName: 'O405' })],
      modelAccessibility,
    )
    expect(table.BUS['3669']).toBe(false)
  })

  test('ignores a sighting whose status is not in-service (retired/renumbered)', () => {
    const table = buildAccessibilityTable(
      [sighting({ statusName: 'Преномериран' })],
      modelAccessibility,
    )
    expect(table.BUS['2053']).toBeUndefined()
  })

  test('does not guess for a model with unknown accessibility (low_floor: null)', () => {
    const table = buildAccessibilityTable(
      [sighting({ modelName: 'Unknown Model' })],
      modelAccessibility,
    )
    expect(table.BUS['2053']).toBeUndefined()
  })

  test('does not guess for a model absent from the accessibility table', () => {
    const table = buildAccessibilityTable(
      [sighting({ modelName: 'Never Catalogued' })],
      modelAccessibility,
    )
    expect(table.BUS['2053']).toBeUndefined()
  })

  test('keeps types separate — same inventory number, different vehicle type', () => {
    const table = buildAccessibilityTable(
      [
        sighting({ inventory: '2053', vehicleType: 'BUS', modelName: 'ZK6126HGA' }),
        sighting({ inventory: '2053', vehicleType: 'TRAM', modelName: 'O405' }),
      ],
      modelAccessibility,
    )
    expect(table.BUS['2053']).toBe(true)
    expect(table.TRAM['2053']).toBe(false)
  })

  test('last-write-wins on conflicting sightings for the same (type, inventory)', () => {
    const table = buildAccessibilityTable(
      [sighting({ modelName: 'ZK6126HGA' }), sighting({ modelName: 'O405' })],
      modelAccessibility,
    )
    expect(table.BUS['2053']).toBe(false)
  })

  test('empty input produces an empty table for all three types', () => {
    const table = buildAccessibilityTable([], modelAccessibility)
    expect(table).toEqual({ BUS: {}, TRAM: {}, TROLLEY: {} })
  })
})
