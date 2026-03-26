import { Database } from 'bun:sqlite'

export interface VehicleExtra {
  vehicle_id: string
  low_floor: boolean
}

let db: Database

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

export function getVehicleExtra(vehicleId: string): VehicleExtra | null {
  const row = getDb()
    .query<{ vehicle_id: string; low_floor: number }, string>(
      'SELECT vehicle_id, low_floor FROM vehicles WHERE vehicle_id = ?',
    )
    .get(vehicleId)

  if (!row) return null
  return { vehicle_id: row.vehicle_id, low_floor: Boolean(row.low_floor) }
}

/** За seed / тестове — вкарва или обновява запис */
export function upsertVehicle(vehicleId: string, lowFloor: boolean): void {
  getDb().run(
    'INSERT INTO vehicles (vehicle_id, low_floor) VALUES (?, ?) ON CONFLICT(vehicle_id) DO UPDATE SET low_floor = excluded.low_floor',
    [vehicleId, lowFloor ? 1 : 0],
  )
}
