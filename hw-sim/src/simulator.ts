/**
 * simulator.ts — per-vehicle hardware behavior: reservation tracking + deploy profiles.
 *
 * Mirrors what a real ramp module would do on `ramp/{vehicle_id}/cmd`, scriptable per
 * vehicle via `setProfile()` so failure/timeout paths are reproducible without hardware.
 */

import { consola } from 'consola'
import { config } from './config'
import { type Command, DEFAULT_PROFILE, type Profile, type StatePublisher } from './protocol'

const log = consola.withTag('hw-sim')

interface VehicleState {
  reservations: Set<number>
  profile: Profile
}

const vehicles = new Map<string, VehicleState>()

function vehicle(vehicleId: string): VehicleState {
  let v = vehicles.get(vehicleId)
  if (!v) {
    v = { reservations: new Set(), profile: DEFAULT_PROFILE }
    vehicles.set(vehicleId, v)
  }
  return v
}

export function setProfile(vehicleId: string, profile: Profile): void {
  vehicle(vehicleId).profile = profile
  log.info(`${vehicleId} profile -> ${profile}`)
}

export function getProfile(vehicleId: string): Profile {
  return vehicle(vehicleId).profile
}

export function outstandingReservations(vehicleId: string): number[] {
  return [...vehicle(vehicleId).reservations]
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function handleDeploy(vehicleId: string, publish: StatePublisher): Promise<void> {
  const profile = getProfile(vehicleId)

  if (profile === 'no-ack') {
    log.info(`${vehicleId} deploy — no-ack profile, publishing nothing`)
    return
  }

  if (profile === 'error') {
    publish(vehicleId, 'error', 'simulated hardware error')
    return
  }

  publish(vehicleId, 'deploying')
  await delay(config.deployStepDelayMs)
  publish(vehicleId, 'deployed')
  await delay(config.deployStepDelayMs)
  publish(vehicleId, 'done')
}

export function handleCommand(vehicleId: string, cmd: Command, publish: StatePublisher): void {
  switch (cmd.action) {
    case 'new_reservation':
      vehicle(vehicleId).reservations.add(cmd.id)
      break
    case 'cancel_reservation':
      vehicle(vehicleId).reservations.delete(cmd.id)
      break
    case 'deploy':
      void handleDeploy(vehicleId, publish)
      break
  }
}
