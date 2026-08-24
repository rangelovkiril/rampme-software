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
 *
 * Deploy-tracking state (which vehicle is mid-deploy, pending ack timeouts) is
 * scoped per RampBridge instance via createRampBridge() rather than module-level,
 * so a test can build an isolated instance over a fake MQTT client with a short
 * timeout, instead of sharing global state and real timers with every other test.
 */

import { type Static, Type } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'
import { consola } from 'consola'
import { getRampDb, type RampReservation } from '../../db/ramp'
import type { Parser } from '../mqtt'
import { jsonParse } from '../mqtt'
import { rampBroadcaster } from './broadcaster'

const log = consola.withTag('ramp-mqtt')

const DEPLOY_TIMEOUT_MS = parseInt(process.env.DEPLOY_TIMEOUT_MS ?? '20000', 10)

function cmdTopic(vehicleId: string): string {
  return `ramp/${vehicleId}/cmd`
}

const HardwareStateSchema = Type.Object({
  state: Type.Union([
    Type.Literal('idle'),
    Type.Literal('deploying'),
    Type.Literal('deployed'),
    Type.Literal('retracting'),
    Type.Literal('done'),
    Type.Literal('error'),
  ]),
  reason: Type.Optional(Type.String()),
})

type HardwareState = Static<typeof HardwareStateSchema>

/** The slice of MQTTHub's public API bridge.ts actually needs, so tests can pass a fake instead of a real broker connection. */
export interface RampMqtt {
  publish(topic: string, payload: unknown, opts?: { retain?: boolean }): void
  on<T>(pattern: string, parse: Parser<T>, handler: (topic: string, payload: T) => void): () => void
}

export interface RampBridge {
  /** Published when a new reservation is created for this vehicle. */
  publishNewReservation(r: RampReservation): void
  /** Published when a reservation is cancelled by the user. */
  publishCancelReservation(r: RampReservation): void
  /**
   * Published when GPS proximity detects the bus at a stop with pending
   * reservations. Starts a deploy-ack timeout — if hardware never sends
   * "deploying"/"deployed" the reservations are expired.
   */
  publishDeploy(vehicleId: string): void
  markDeployTriggered(vehicleId: string, stopId: string): void
  wasDeployTriggered(vehicleId: string, stopId: string): boolean
  isDeployInFlight(vehicleId: string): boolean
  clearDeployTrigger(vehicleId: string): void
  subscribeToHardwareStates(): void
  /** Re-publish all active reservations so hardware has fresh state. */
  resyncAllReservations(): void
}

/**
 * Builds an independent RampBridge over the given MQTT client. Production
 * wires a single instance via initRampBridge()/getRampBridge(); tests call
 * this directly with a fake RampMqtt and a short timeoutMs for isolated,
 * fast tests instead of the real DEPLOY_TIMEOUT_MS and a shared MQTT hub.
 */
export function createRampBridge(mqtt: RampMqtt, timeoutMs = DEPLOY_TIMEOUT_MS): RampBridge {
  /** Tracks which vehicles we've already asked to deploy for a given stop. */
  const deployedFor = new Map<string, string>() // vehicleId → stopId
  const deployTimeouts = new Map<string, ReturnType<typeof setTimeout>>()
  const deployAcknowledged = new Set<string>()

  function clearDeployTimeout(vehicleId: string): void {
    const t = deployTimeouts.get(vehicleId)
    if (t) {
      clearTimeout(t)
      deployTimeouts.delete(vehicleId)
    }
  }

  function publishNewReservation(r: RampReservation): void {
    mqtt.publish(cmdTopic(r.vehicle_id), { action: 'new_reservation', id: r.id })
  }

  function publishCancelReservation(r: RampReservation): void {
    mqtt.publish(cmdTopic(r.vehicle_id), { action: 'cancel_reservation', id: r.id })
  }

  function markDeployTriggered(vehicleId: string, stopId: string): void {
    deployedFor.set(vehicleId, stopId)
  }

  function wasDeployTriggered(vehicleId: string, stopId: string): boolean {
    return deployedFor.get(vehicleId) === stopId
  }

  function isDeployInFlight(vehicleId: string): boolean {
    return deployedFor.has(vehicleId)
  }

  function clearDeployTrigger(vehicleId: string): void {
    deployedFor.delete(vehicleId)
    deployAcknowledged.delete(vehicleId)
  }

  function publishDeploy(vehicleId: string): void {
    mqtt.publish(cmdTopic(vehicleId), { action: 'deploy' })
    log.info(`→ ${vehicleId} deploy`)

    // Hardware already confirmed it's in a deploy cycle — don't restart the timeout.
    if (deployAcknowledged.has(vehicleId)) return

    clearDeployTimeout(vehicleId)
    deployTimeouts.set(
      vehicleId,
      setTimeout(() => {
        deployTimeouts.delete(vehicleId)
        if (deployAcknowledged.has(vehicleId)) {
          // Acknowledgement arrived just before the timer fired (race condition).
          return
        }
        const stopId = deployedFor.get(vehicleId)
        const forStop = (r: { stop_id: string }) => !stopId || r.stop_id === stopId
        const pending = getRampDb()
          .getVehicleReservations(vehicleId)
          .filter((r) => r.status === 'pending' && forStop(r))
        for (const r of pending) getRampDb().setReservationStatus(r.id, 'expired')
        if (pending.length > 0) {
          log.warn(`deploy timeout for ${vehicleId} — expired ${pending.length} reservation(s)`)
        }
        clearDeployTrigger(vehicleId)
      }, timeoutMs),
    )
  }

  /**
   * Handle state updates from hardware. "done" means the ramp cycle finished
   * and all active reservations for this vehicle should be marked completed.
   */
  function handleHardwareState(vehicleId: string, payload: HardwareState): void {
    log.info(`← ${vehicleId} state=${payload.state}${payload.reason ? ` (${payload.reason})` : ''}`)

    // Only affect reservations for the stop that triggered this deploy cycle.
    const stopId = deployedFor.get(vehicleId)
    const forStop = (r: { stop_id: string }) => !stopId || r.stop_id === stopId

    if (payload.state === 'deploying' || payload.state === 'deployed') {
      // Hardware confirmed it's in motion — cancel the deploy-ack timeout and stop worrying.
      deployAcknowledged.add(vehicleId)
      clearDeployTimeout(vehicleId)
    }

    if (payload.state === 'deployed') {
      const active = getRampDb().getVehicleReservations(vehicleId)
      for (const r of active) {
        if (r.status === 'pending' && forStop(r)) getRampDb().setReservationStatus(r.id, 'active')
      }
      // Immediate SSE push so clients see boarding/alighting UI without waiting for next refresh.
      rampBroadcaster.publish(Date.now())
    }

    if (payload.state === 'done') {
      const active = getRampDb().getVehicleReservations(vehicleId)
      for (const r of active.filter(forStop)) {
        getRampDb().setReservationStatus(r.id, 'done')
      }
      clearDeployTrigger(vehicleId)
      // Immediate SSE push so clients see the completed ramp cycle without waiting for next refresh.
      rampBroadcaster.publish(Date.now())
    }

    if (payload.state === 'error') {
      const active = getRampDb().getVehicleReservations(vehicleId)
      for (const r of active.filter(forStop)) {
        getRampDb().setReservationStatus(r.id, 'expired')
      }
      clearDeployTrigger(vehicleId)
      // Immediate SSE push so clients don't sit staring at a reservation that already failed.
      rampBroadcaster.publish(Date.now())
    }

    if (payload.state === 'idle') {
      deployAcknowledged.delete(vehicleId)
    }
  }

  function subscribeToHardwareStates(): void {
    mqtt.on('ramp/+/state', jsonParse, (topic, payload) => {
      const vehicleId = topic.split('/')[1]
      if (!vehicleId) return
      if (!Value.Check(HardwareStateSchema, payload)) {
        log.error(`invalid state payload from ${vehicleId}:`, payload)
        return
      }
      handleHardwareState(vehicleId, payload)
    })
  }

  function resyncAllReservations(): void {
    const active = getRampDb().getAllActiveReservations()
    for (const r of active) {
      publishNewReservation(r)
    }
    if (active.length > 0) {
      log.info(`resynced ${active.length} active reservation(s)`)
    }
  }

  return {
    publishNewReservation,
    publishCancelReservation,
    publishDeploy,
    markDeployTriggered,
    wasDeployTriggered,
    isDeployInFlight,
    clearDeployTrigger,
    subscribeToHardwareStates,
    resyncAllReservations,
  }
}

let bridge: RampBridge | null = null

/** Wires the singleton RampBridge used in production over the real MQTT hub. */
export function initRampBridge(mqtt: RampMqtt, timeoutMs = DEPLOY_TIMEOUT_MS): RampBridge {
  bridge = createRampBridge(mqtt, timeoutMs)
  return bridge
}

export function getRampBridge(): RampBridge {
  if (!bridge) throw new Error('Ramp bridge not initialized — call initRampBridge() first')
  return bridge
}
