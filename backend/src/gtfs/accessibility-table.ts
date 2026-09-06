import type { VehicleAccessibilityTable, VehicleAccessibilityType } from './types'

// The literal trinmo.org uses for "currently in service" on a vehicle sighting.
// Sightings with any other status (retired, renumbered, preserved, ...) are
// historical and must not be used to resolve a live vehicle's accessibility —
// see openspec/changes/ramp-vehicle-accessibility's "No confident false
// positive from identity reuse" requirement.
export const IN_SERVICE_STATUS = 'В движение'

// One vehicle-in-a-photo record, already shape-validated from trinmo.org's
// per-model detail response (see scripts/refresh-accessibility.ts).
export interface AccessibilitySighting {
  inventory: string
  vehicleType: VehicleAccessibilityType
  statusName: string
  modelName: string
}

export interface ModelAccessibility {
  low_floor: boolean | null
}

/**
 * Joins crowd-sourced vehicle sightings against the curated model->low_floor
 * table to produce the reference dataset `gtfs/accessibility.ts` looks up at
 * runtime. Pure: no network, no filesystem — scripts/refresh-accessibility.ts
 * is the only caller that does I/O, so this stays directly testable.
 *
 * A sighting only contributes an entry when both its status is in-service and
 * its model resolves to a known boolean; an unknown model (low_floor: null,
 * e.g. a never-catalogued type) is skipped rather than guessed, so a missing
 * entry always means "unresolved", never "not ramp-equipped". Conflicting
 * sightings for the same (type, inventory) — e.g. duplicate photos of the same
 * vehicle — are resolved last-write-wins; they're expected to agree in
 * practice since they describe the same physical vehicle.
 */
export function buildAccessibilityTable(
  sightings: AccessibilitySighting[],
  modelAccessibility: Record<string, ModelAccessibility>,
): VehicleAccessibilityTable {
  const table: VehicleAccessibilityTable = { BUS: {}, TRAM: {}, TROLLEY: {} }

  for (const sighting of sightings) {
    if (sighting.statusName !== IN_SERVICE_STATUS) continue
    const lowFloor = modelAccessibility[sighting.modelName]?.low_floor
    if (typeof lowFloor !== 'boolean') continue
    table[sighting.vehicleType][sighting.inventory] = lowFloor
  }

  return table
}
