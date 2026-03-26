import { Database } from 'bun:sqlite'

export interface VehicleExtra {
  vehicle_id: string
  low_floor: boolean
}

let db: Database

/**
 * Returns the singleton Database instance, initializing and configuring it on first access.
 *
 * Initializes a SQLite database file (defaulting to "vehicles.db" or using `process.env.DB_PATH` when set)
 * and ensures a `vehicles` table exists with columns `vehicle_id` (TEXT PRIMARY KEY) and `low_floor` (INTEGER NOT NULL DEFAULT 0).
 *
 * @returns The module's cached `Database` instance connected to the configured SQLite file.
 */
function getDb(): Database {
  if (!db) {
    db = new Database(process.env.DB_PATH ?? 'vehicles.db')
    db.run(`
      CREATE TABLE IF NOT EXISTS vehicles (
        vehicle_id TEXT PRIMARY KEY,
        low_floor  INTEGER NOT NULL DEFAULT 0
      )
    `)
  }
  return db
}

/**
 * Fetches the extra data for a vehicle by its identifier.
 *
 * @param vehicleId - The vehicle identifier to look up
 * @returns The `VehicleExtra` for the matching vehicle, or `null` if no record exists
 */
export function getVehicleExtra(vehicleId: string): VehicleExtra | null {
  const row = getDb()
    .query<{ vehicle_id: string; low_floor: number }, string>(
      'SELECT vehicle_id, low_floor FROM vehicles WHERE vehicle_id = ?',
    )
    .get(vehicleId)

  if (!row) return null
  return { vehicle_id: row.vehicle_id, low_floor: Boolean(row.low_floor) }
}

/**
 * Insert or update a vehicle's extra attributes in the persistent store.
 *
 * Stores `low_floor` as `1` when `true` and `0` when `false`.
 *
 * @param vehicleId - The unique identifier of the vehicle
 * @param lowFloor - Whether the vehicle has a low floor
 */
export function upsertVehicle(vehicleId: string, lowFloor: boolean): void {
  getDb().run(
    'INSERT INTO vehicles (vehicle_id, low_floor) VALUES (?, ?) ON CONFLICT(vehicle_id) DO UPDATE SET low_floor = excluded.low_floor',
    [vehicleId, lowFloor ? 1 : 0],
  )
}
