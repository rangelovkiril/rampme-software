import { Database } from 'bun:sqlite'
import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { config } from '../config'

const dbPath = resolve(config.rampDbPath)
mkdirSync(dirname(dbPath), { recursive: true })

const db = new Database(dbPath, { create: true })
db.run('PRAGMA journal_mode = WAL')
db.run('PRAGMA busy_timeout = 3000')

db.run(`
  CREATE TABLE IF NOT EXISTS ramp_reservations (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id  TEXT    NOT NULL,
    vehicle_id  TEXT    NOT NULL,
    stop_id     TEXT    NOT NULL,
    type        TEXT    NOT NULL CHECK(type IN ('board', 'alight')),
    status      TEXT    NOT NULL DEFAULT 'pending'
                        CHECK(status IN ('pending', 'active', 'done', 'cancelled', 'expired')),
    created_at  INTEGER NOT NULL DEFAULT (unixepoch()),
    resolved_at INTEGER
  )
`)

db.run('CREATE INDEX IF NOT EXISTS idx_ramp_veh  ON ramp_reservations(vehicle_id, status)')
db.run('CREATE INDEX IF NOT EXISTS idx_ramp_ses  ON ramp_reservations(session_id, status)')
db.run('CREATE INDEX IF NOT EXISTS idx_ramp_stat ON ramp_reservations(status)')

// ── prepared statements ──────────────────────────────────────────────────

const stmts = {
  insert: db.prepare(`
    INSERT INTO ramp_reservations (session_id, vehicle_id, stop_id, type)
    VALUES ($session_id, $vehicle_id, $stop_id, $type)
  `),
  cancel: db.prepare(`
    UPDATE ramp_reservations
    SET status = 'cancelled', resolved_at = unixepoch()
    WHERE id = $id AND session_id = $session_id AND status IN ('pending', 'active')
  `),
  sessionActive: db.prepare(`
    SELECT * FROM ramp_reservations
    WHERE session_id = $session_id AND status IN ('pending','active')
    ORDER BY created_at DESC
  `),
  vehicleActive: db.prepare(`
    SELECT * FROM ramp_reservations
    WHERE vehicle_id = $vehicle_id AND status IN ('pending','active')
    ORDER BY created_at DESC
  `),
  allPending: db.prepare(
    `SELECT * FROM ramp_reservations WHERE status IN ('pending','active')`,
  ),
  setStatus: db.prepare(`
    UPDATE ramp_reservations
    SET status = $status,
        resolved_at = CASE WHEN $status IN ('done','expired','cancelled') THEN unixepoch() ELSE resolved_at END
    WHERE id = $id
  `),
  sessionCount: db.prepare(`
    SELECT COUNT(*) as cnt FROM ramp_reservations
    WHERE session_id = $session_id AND status IN ('pending','active')
  `),
  duplicate: db.prepare(`
    SELECT id FROM ramp_reservations
    WHERE session_id = $sid AND vehicle_id = $vid AND stop_id = $stop
      AND type = $type AND status = 'pending'
  `),
  getById: db.prepare('SELECT * FROM ramp_reservations WHERE id = $id'),
  cleanup: db.prepare(
    'DELETE FROM ramp_reservations WHERE created_at < unixepoch() - 86400',
  ),
}

// ── types ────────────────────────────────────────────────────────────────

export interface RampReservation {
  id: number
  session_id: string
  vehicle_id: string
  stop_id: string
  type: 'board' | 'alight'
  status: 'pending' | 'active' | 'done' | 'cancelled' | 'expired'
  created_at: number
  resolved_at: number | null
}

// ── public API ───────────────────────────────────────────────────────────

const MAX_ACTIVE = 2

export function createReservation(
  sessionId: string,
  vehicleId: string,
  stopId: string,
  type: 'board' | 'alight',
): RampReservation | { error: string } {
  const { cnt } = stmts.sessionCount.get({ $session_id: sessionId }) as { cnt: number }
  if (cnt >= MAX_ACTIVE) return { error: `Max ${MAX_ACTIVE} active reservations` }

  if (stmts.duplicate.get({ $sid: sessionId, $vid: vehicleId, $stop: stopId, $type: type })) {
    return { error: 'Already reserved' }
  }

  const r = stmts.insert.run({
    $session_id: sessionId,
    $vehicle_id: vehicleId,
    $stop_id: stopId,
    $type: type,
  })
  return stmts.getById.get({ $id: r.lastInsertRowid }) as RampReservation
}

export function cancelReservation(id: number, sessionId: string): boolean {
  return stmts.cancel.run({ $id: id, $session_id: sessionId }).changes > 0
}

export function getSessionReservations(sessionId: string): RampReservation[] {
  return stmts.sessionActive.all({ $session_id: sessionId }) as RampReservation[]
}

export function getVehicleReservations(vehicleId: string): RampReservation[] {
  return stmts.vehicleActive.all({ $vehicle_id: vehicleId }) as RampReservation[]
}

export function getAllActiveReservations(): RampReservation[] {
  return stmts.allPending.all() as RampReservation[]
}

export function setReservationStatus(id: number, status: RampReservation['status']): void {
  stmts.setStatus.run({ $id: id, $status: status })
}

export function cleanupOldReservations(): number {
  return stmts.cleanup.run().changes
}

cleanupOldReservations()
