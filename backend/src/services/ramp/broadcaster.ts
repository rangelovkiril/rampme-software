import { Broadcaster } from '../broadcaster'

/**
 * Publishes whenever a ramp reservation changes state (created, cancelled,
 * or a hardware state transition), so `/ramp/session/stream` gets its own
 * channel instead of faking a GTFS realtime refresh to get a push out.
 */
export const rampBroadcaster = new Broadcaster<number>()
