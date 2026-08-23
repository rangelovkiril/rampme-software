/**
 * protocol.ts — the ramp MQTT protocol subset hw-sim implements.
 *
 * Deliberately duplicated from `backend/src/services/ramp/bridge.ts` rather than shared
 * as a package (see design.md) — the protocol is small, stable, and documented in the
 * wiki as the cross-repo contract; keep the two definitions in sync by hand if it changes.
 */

import { type Static, Type } from '@sinclair/typebox'

export const CommandSchema = Type.Union([
  Type.Object({ action: Type.Literal('new_reservation'), id: Type.Number() }),
  Type.Object({ action: Type.Literal('cancel_reservation'), id: Type.Number() }),
  Type.Object({ action: Type.Literal('deploy') }),
])

export type Command = Static<typeof CommandSchema>

export type HwState = 'deploying' | 'deployed' | 'done' | 'error'

export type StatePublisher = (vehicleId: string, state: HwState, reason?: string) => void

export const PROFILES = ['happy', 'no-ack', 'error'] as const
export type Profile = (typeof PROFILES)[number]
export const DEFAULT_PROFILE: Profile = 'happy'

export function cmdTopic(vehicleId: string): string {
  return `ramp/${vehicleId}/cmd`
}

export function stateTopic(vehicleId: string): string {
  return `ramp/${vehicleId}/state`
}

const CMD_TOPIC_RE = /^ramp\/([^/]+)\/cmd$/

/** Returns the vehicle ID for a `ramp/{vehicle_id}/cmd` topic, or null for anything else. */
export function vehicleFromCmdTopic(topic: string): string | null {
  return CMD_TOPIC_RE.exec(topic)?.[1] ?? null
}
