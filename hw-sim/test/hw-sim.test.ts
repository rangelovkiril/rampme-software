import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import mqtt from 'mqtt'
import { type Broker, startBroker } from '../src/broker'
import { config } from '../src/config'
import { controlApp } from '../src/control'
import { cmdTopic, stateTopic } from '../src/protocol'
import { outstandingReservations } from '../src/simulator'

let broker: Broker
let client: mqtt.MqttClient
const received: { topic: string; payload: { state: string; reason?: string } }[] = []

beforeAll(async () => {
  broker = await startBroker(0)
  const address = broker.server.address()
  const port = typeof address === 'object' && address ? address.port : 0

  // No username/password — the simulator's MQTT interface must accept anonymous connections.
  client = await mqtt.connectAsync(`mqtt://127.0.0.1:${port}`)
  client.on('message', (topic, payload) => {
    received.push({ topic, payload: JSON.parse(payload.toString()) })
  })
  await client.subscribeAsync('ramp/+/state')
})

afterAll(async () => {
  await client.endAsync()
  await new Promise<void>((resolve) => broker.server.close(() => resolve()))
})

function statesFor(vehicleId: string) {
  return received.filter((m) => m.topic === stateTopic(vehicleId)).map((m) => m.payload)
}

async function waitForCount(vehicleId: string, count: number, timeoutMs = 2000) {
  const start = Date.now()
  while (Date.now() - start < timeoutMs && statesFor(vehicleId).length < count) {
    await new Promise((r) => setTimeout(r, 10))
  }
  return statesFor(vehicleId)
}

async function setProfile(vehicleId: string, profile: 'happy' | 'no-ack' | 'error') {
  const res = await controlApp.handle(
    new Request(`http://localhost/vehicles/${vehicleId}/profile`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ profile }),
    }),
  )
  expect(res.status).toBe(200)
}

test('accepts a connection with no username or password', () => {
  expect(client.connected).toBe(true)
})

test('new_reservation then cancel_reservation leaves no outstanding reservation', async () => {
  const vehicleId = 'veh-reservations'
  await client.publishAsync(
    cmdTopic(vehicleId),
    JSON.stringify({ action: 'new_reservation', id: 1 }),
  )
  await new Promise((r) => setTimeout(r, 50))
  expect(outstandingReservations(vehicleId)).toEqual([1])

  await client.publishAsync(
    cmdTopic(vehicleId),
    JSON.stringify({ action: 'cancel_reservation', id: 1 }),
  )
  await new Promise((r) => setTimeout(r, 50))
  expect(outstandingReservations(vehicleId)).toEqual([])
})

describe('deploy profiles', () => {
  test('default (happy-path) profile publishes deploying, deployed, done in order', async () => {
    const vehicleId = 'veh-happy'
    await client.publishAsync(cmdTopic(vehicleId), JSON.stringify({ action: 'deploy' }))
    const states = await waitForCount(vehicleId, 3)
    expect(states.map((s) => s.state)).toEqual(['deploying', 'deployed', 'done'])
  })

  test('no-ack profile publishes no state transition', async () => {
    const vehicleId = 'veh-no-ack'
    await setProfile(vehicleId, 'no-ack')
    await client.publishAsync(cmdTopic(vehicleId), JSON.stringify({ action: 'deploy' }))
    await new Promise((r) => setTimeout(r, config.deployStepDelayMs * 2 + 100))
    expect(statesFor(vehicleId)).toEqual([])
  })

  test('error profile publishes only an error state', async () => {
    const vehicleId = 'veh-error'
    await setProfile(vehicleId, 'error')
    await client.publishAsync(cmdTopic(vehicleId), JSON.stringify({ action: 'deploy' }))
    const states = await waitForCount(vehicleId, 1)
    await new Promise((r) => setTimeout(r, config.deployStepDelayMs * 2 + 100))
    expect(statesFor(vehicleId).map((s) => s.state)).toEqual(['error'])
  })
})

test('state messages are retained, so a late subscriber recovers the last state', async () => {
  const vehicleId = 'veh-retained'
  await client.publishAsync(cmdTopic(vehicleId), JSON.stringify({ action: 'deploy' }))
  await waitForCount(vehicleId, 3)

  const address = broker.server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  const lateClient = await mqtt.connectAsync(`mqtt://127.0.0.1:${port}`)
  try {
    const retained = await new Promise<{ state: string }>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('timed out waiting for retained state')),
        2000,
      )
      lateClient.on('error', reject)
      lateClient.on('message', (_topic, payload) => {
        clearTimeout(timer)
        resolve(JSON.parse(payload.toString()))
      })
      lateClient.subscribe(stateTopic(vehicleId), (err) => {
        if (err) reject(err)
      })
    })
    expect(retained.state).toBe('done')
  } finally {
    await lateClient.endAsync()
  }
})

test('a profile change is scoped to one vehicle', async () => {
  const vehicleA = 'veh-scope-a'
  const vehicleB = 'veh-scope-b'
  await setProfile(vehicleA, 'error')

  await client.publishAsync(cmdTopic(vehicleA), JSON.stringify({ action: 'deploy' }))
  await client.publishAsync(cmdTopic(vehicleB), JSON.stringify({ action: 'deploy' }))

  const statesA = await waitForCount(vehicleA, 1)
  const statesB = await waitForCount(vehicleB, 3)
  expect(statesA.map((s) => s.state)).toEqual(['error'])
  expect(statesB.map((s) => s.state)).toEqual(['deploying', 'deployed', 'done'])
})
