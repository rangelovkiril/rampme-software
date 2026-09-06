import { consola } from 'consola'
import type { VehicleAccessibilityTable, VehicleAccessibilityType } from './types'

const log = consola.withTag('accessibility')

const EMPTY_TABLE: VehicleAccessibilityTable = { BUS: {}, TRAM: {}, TROLLEY: {} }

// Matches the GTFS route-id prefix scheme this feed already uses (see
// backend/AGENTS.md's GTFS-RT section): A=bus, TM=tram, TB=trolleybus. Live
// vehicle.id values carry the same prefix (confirmed against a live capture
// during ramp-vehicle-accessibility's exploration).
const PREFIX_TYPE: Record<string, VehicleAccessibilityType> = {
  A: 'BUS',
  TM: 'TRAM',
  TB: 'TROLLEY',
}

const VEHICLE_ID_RE = /^([A-Za-z]+)(\d+)$/

async function loadTable(path: string): Promise<VehicleAccessibilityTable> {
  const file = Bun.file(path)
  if (!(await file.exists())) {
    log.warn(`No accessibility dataset at ${path} yet — every vehicle resolves as unknown`)
    return EMPTY_TABLE
  }
  try {
    return (await file.json()) as VehicleAccessibilityTable
  } catch (e) {
    log.error(`Failed to parse accessibility dataset at ${path}, keeping last good table:`, e)
    throw e
  }
}

export interface AccessibilityResolver {
  /** null = unresolved (unknown), never a stand-in for "not ramp-equipped". */
  resolve(vehicleId: string): boolean | null
  stop(): void
}

/**
 * Builds an independent resolver over its own reload timer. Production wires
 * a single instance via initAccessibility()/getAccessibility(); tests call
 * this directly with a temp file and a short interval instead of the
 * production singleton, mirroring createRampDb()/createRampBridge().
 */
export function createAccessibilityResolver(
  dataPath: string,
  refreshMs: number,
): AccessibilityResolver {
  let table: VehicleAccessibilityTable = EMPTY_TABLE

  const reload = async () => {
    try {
      table = await loadTable(dataPath)
    } catch {
      // loadTable already logged; keep serving the last good table rather
      // than blanking accessibility out over a transient read/parse error.
    }
  }

  // Fire the initial load in the background — callers get an unknown-only
  // resolver until it resolves, same fallback as a genuinely missing file.
  reload()
  const timer = setInterval(reload, refreshMs)

  function resolve(vehicleId: string): boolean | null {
    const match = VEHICLE_ID_RE.exec(vehicleId)
    if (!match) return null
    const [, prefix, inventory] = match
    const type = PREFIX_TYPE[prefix]
    if (!type) return null
    return table[type][inventory] ?? null
  }

  function stop(): void {
    clearInterval(timer)
  }

  return { resolve, stop }
}

let resolver: AccessibilityResolver | null = null

export function initAccessibility(dataPath: string, refreshMs: number): AccessibilityResolver {
  resolver = createAccessibilityResolver(dataPath, refreshMs)
  return resolver
}

export function getAccessibility(): AccessibilityResolver {
  if (!resolver)
    throw new Error('Accessibility resolver not initialized — call initAccessibility() first')
  return resolver
}
