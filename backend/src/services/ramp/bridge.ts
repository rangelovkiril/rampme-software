/**
 * bridge.ts — Bridges reservations ↔ hardware over MQTT.
 *
 * Topic design (payload-based, no info duplicated in topic):
 *
 *   ramp/{vehicle_id}/cmd        (backend → hw, QoS 1)
 *     { action: "new_reservation",    id: <int> }
 *     { action: "cancel_reservation", id: <int> }
 *     { action: "deploy" }
 *
 *   ramp/{vehicle_id}/state      (hw → backend, retained, QoS 1)
 *     { state: "idle" | "deploying" | "deployed" | "retracting" | "done" | "error",
 *       reason?: string }
 *
 * Lifecycle:
 *   1. createReservation() → publish new_reservation cmd
 *   2. cancelReservation() → publish cancel_reservation cmd
 *   3. proximity detects bus at stop with pending reservations → publish deploy cmd
 *   4. hardware publishes state transitions; on "done" we mark reservations as done
 *   5. if no "deploying" within DEPLOY_TIMEOUT_MS after deploy cmd → expire reservations
 */

import {
  getAllActiveReservations,
  getVehicleReservations,
  type RampReservation,
  setReservationStatus,
} from '../../db/ramp'
import { getMqtt, jsonParse } from '../mqtt'

const DEPLOY_TIMEOUT_MS = parseInt(process.env.DEPLOY_TIMEOUT_MS ?? '20000', 10)

function cmdTopic(vehicleId: string): string {
  return `ramp/${vehicleId}/cmd`
}

/** Published when a new reservation is created for this vehicle. */
export function publishNewReservation(r: RampReservation): void {
  getMqtt().publish(cmdTopic(r.vehicle_id), {
    action: 'new_reservation',
    id: r.id,
  })
}

/** Published when a reservation is cancelled by the user. */
export function publishCancelReservation(r: RampReservation): void {
  getMqtt().publish(cmdTopic(r.vehicle_id), {
    action: 'cancel_reservation',
    id: r.id,
  })
}

/** Tracks which vehicles we've already asked to deploy for a given stop. */
const deployedFor = new Map<string, string>() // vehicleId → stopId

export function markDeployTriggered(vehicleId: string, stopId: string): void {
  deployedFor.set(vehicleId, stopId)
}

export function wasDeployTriggered(vehicleId: string, stopId: string): boolean {
  return deployedFor.get(vehicleId) === stopId
}

export function clearDeployTrigger(vehicleId: string): void {
  deployedFor.delete(vehicleId)
}

const deployTimeouts = new Map<string, ReturnType<typeof setTimeout>>()

function clearDeployTimeout(vehicleId: string): void {
  const t = deployTimeouts.get(vehicleId)
  if (t) {
    clearTimeout(t)
    deployTimeouts.delete(vehicleId)
  }
}

/**
 * Published when GPS proximity detects the bus at a stop with pending
 * reservations. Starts a timeout — if hardware doesn't acknowledge within
 * DEPLOY_TIMEOUT_MS the reservations are expired ("bus left without deploying").
 */
export function publishDeploy(vehicleId: string): void {
  getMqtt().publish(cmdTopic(vehicleId), { action: 'deploy' })
  console.log(`[ramp-mqtt] → ${vehicleId} deploy`)

  clearDeployTimeout(vehicleId)
  deployTimeouts.set(
    vehicleId,
    setTimeout(() => {
      deployTimeouts.delete(vehicleId)
      const stopId = deployedFor.get(vehicleId)
      const forStop = (r: { stop_id: string }) => !stopId || r.stop_id === stopId
      const pending = getVehicleReservations(vehicleId).filter(
        (r) => r.status === 'pending' && forStop(r),
      )
      for (const r of pending) setReservationStatus(r.id, 'expired')
      if (pending.length > 0) {
        console.log(
          `[ramp-mqtt] deploy timeout for ${vehicleId} — expired ${pending.length} reservation(s)`,
        )
      }
      clearDeployTrigger(vehicleId)
    }, DEPLOY_TIMEOUT_MS),
  )
}

interface HardwareState {
  state: 'idle' | 'deploying' | 'deployed' | 'retracting' | 'done' | 'error'
  reason?: string
}

/**
 * Handle state updates from hardware. "done" means the ramp cycle finished
 * and all active reservations for this vehicle should be marked completed.
 */
function handleHardwareState(vehicleId: string, payload: HardwareState): void {
  console.log(
    `[ramp-mqtt] ← ${vehicleId} state=${payload.state}${payload.reason ? ` (${payload.reason})` : ''}`,
  )

  // Any response from hardware means it's alive — cancel the "bus left" timeout.
  clearDeployTimeout(vehicleId)

  // Only affect reservations for the stop that triggered this deploy cycle.
  const stopId = deployedFor.get(vehicleId)
  const forStop = (r: { stop_id: string }) => !stopId || r.stop_id === stopId

  if (payload.state === 'deployed') {
    const active = getVehicleReservations(vehicleId)
    for (const r of active) {
      if (r.status === 'pending' && forStop(r)) setReservationStatus(r.id, 'active')
    }
  }

  if (payload.state === 'done') {
    const active = getVehicleReservations(vehicleId)
    for (const r of active.filter(forStop)) {
      setReservationStatus(r.id, 'done')
    }
    clearDeployTrigger(vehicleId)
  }

  if (payload.state === 'error') {
    const active = getVehicleReservations(vehicleId)
    for (const r of active.filter(forStop)) {
      setReservationStatus(r.id, 'expired')
    }
    clearDeployTrigger(vehicleId)
  }
}

export function subscribeToHardwareStates(): void {
  const mqtt = getMqtt()
  mqtt.on('ramp/+/state', jsonParse, (topic, payload) => {
    const vehicleId = topic.split('/')[1]
    if (!vehicleId) return
    handleHardwareState(vehicleId, payload as HardwareState)
  })
}

/** Re-publish all active reservations on startup so hardware has fresh state. */
export function resyncAllReservations(): void {
  const active = getAllActiveReservations()
  for (const r of active) {
    publishNewReservation(r)
  }
  if (active.length > 0) {
    console.log(`[ramp-mqtt] resynced ${active.length} active reservation(s)`)
  }
}
