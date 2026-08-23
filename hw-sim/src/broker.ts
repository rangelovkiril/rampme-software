/**
 * broker.ts — the in-process MQTT broker + transport wiring.
 *
 * hw-sim is both the broker and the simulated hardware: `Aedes` handles the wire
 * protocol, and every `ramp/{vehicle_id}/cmd` publish is fed straight into
 * `simulator.ts` without a loopback client connection. State transitions are sent
 * back out via `aedes.publish()`, which is likewise not a client round-trip.
 */

import { createServer, type Server } from 'node:net'
import { Value } from '@sinclair/typebox/value'
import { Aedes } from 'aedes'
import { consola } from 'consola'
import { CommandSchema, type StatePublisher, stateTopic, vehicleFromCmdTopic } from './protocol'
import { handleCommand } from './simulator'

const log = consola.withTag('mqtt-broker')

export interface Broker {
  aedes: Aedes
  server: Server
  publish: StatePublisher
}

export async function startBroker(port: number): Promise<Broker> {
  const aedes = await Aedes.createBroker()
  const server = createServer(aedes.handle)

  const publish: StatePublisher = (vehicleId, state, reason) => {
    const payload = Buffer.from(JSON.stringify(reason ? { state, reason } : { state }))
    aedes.publish(
      {
        cmd: 'publish',
        topic: stateTopic(vehicleId),
        payload,
        qos: 1,
        retain: true,
        dup: false,
      },
      (err) => {
        if (err) log.error(`publish failed for ${vehicleId}:`, err)
      },
    )
    log.info(`→ ${vehicleId} state=${state}${reason ? ` (${reason})` : ''}`)
  }

  aedes.on('publish', (packet, client) => {
    if (!client) return // our own state publishes loop back through this event too
    const vehicleId = vehicleFromCmdTopic(packet.topic)
    if (!vehicleId) return

    let payload: unknown
    try {
      payload = JSON.parse(packet.payload.toString())
    } catch {
      log.error(`invalid JSON on ${packet.topic}`)
      return
    }
    if (!Value.Check(CommandSchema, payload)) {
      log.error(`invalid command payload on ${packet.topic}:`, payload)
      return
    }

    log.info(`← ${vehicleId} ${payload.action}`)
    handleCommand(vehicleId, payload, publish)
  })

  aedes.on('clientError', (client, err) => log.warn(`client ${client.id} error:`, err.message))

  return new Promise((resolve) => {
    server.listen(port, () => {
      const address = server.address()
      const boundPort = typeof address === 'object' && address ? address.port : port
      log.success(`MQTT broker listening on :${boundPort}`)
      resolve({ aedes, server, publish })
    })
  })
}
