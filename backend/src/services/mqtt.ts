/**
 * mqtt.ts — MQTT client for the RampMe backend.
 *
 * Connects to HiveMQ Cloud (or any MQTT broker), exposes pattern-based
 * subscriptions with per-handler parsers, and a publish helper.
 */

import { consola } from 'consola'
import mqtt from 'mqtt'

const log = consola.withTag('mqtt')

export type Parser<T> = (raw: Buffer) => T
type Handler<T> = (topic: string, payload: T) => void

interface Sub {
  regex: RegExp
  parse: Parser<unknown>
  handler: Handler<unknown>
}

export const jsonParse: Parser<unknown> = (buf) => JSON.parse(buf.toString())

const toRegex = (p: string) => {
  const segments = p.split('/')
  const trailingHash = segments[segments.length - 1] === '#'
  const base = (trailingHash ? segments.slice(0, -1) : segments)
    .map((s) => (s === '+' ? '[^/]+' : s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
    .join('/')
  return new RegExp(`^${base}${trailingHash ? '(?:$|/.*)' : ''}$`)
}

export class MQTTHub {
  private subs: Sub[] = []

  constructor(private client: mqtt.MqttClient) {
    client.on('message', (topic: string, buf: Buffer) => {
      for (const sub of this.subs) {
        if (!sub.regex.test(topic)) continue
        try {
          sub.handler(topic, sub.parse(buf))
        } catch (e) {
          log.error(`handler error on ${topic}:`, e)
        }
      }
    })

    client.on('connect', () => log.success('connected'))
    client.on('reconnect', () => log.warn('reconnecting'))
    // Explicit param type: the mqtt package's published .d.ts has broken internal
    // re-export paths (e.g. 'mqtt/build/lib/clientent' instead of '.../client'),
    // so tsc can't resolve MqttClient's 'error' event overload on its own.
    client.on('error', (e: Error) => log.error('error:', e.message))
  }

  on<T = Buffer>(pattern: string, handler: Handler<T>): () => void
  on<T>(pattern: string, parse: Parser<T>, handler: Handler<T>): () => void
  on(
    pattern: string,
    parserOrHandler: Parser<unknown> | Handler<unknown>,
    maybeHandler?: Handler<unknown>,
  ): () => void {
    const parse = maybeHandler ? (parserOrHandler as Parser<unknown>) : (b: Buffer) => b
    const handler = maybeHandler ?? (parserOrHandler as Handler<unknown>)

    const sub: Sub = { regex: toRegex(pattern), parse, handler }
    this.subs.push(sub)
    this.client.subscribe(pattern, (err: Error | null) => {
      if (err) log.error(`subscribe ${pattern} failed:`, err.message)
      else log.info(`subscribed to ${pattern}`)
    })

    return () => {
      const i = this.subs.indexOf(sub)
      if (i >= 0) this.subs.splice(i, 1)
      if (!this.subs.some((s) => s.regex.source === sub.regex.source)) {
        this.client.unsubscribe(pattern)
      }
    }
  }

  publish(topic: string, payload: unknown, opts?: { retain?: boolean }): void {
    const buf = typeof payload === 'string' ? payload : JSON.stringify(payload)
    this.client.publish(topic, buf, {
      qos: 2,
      retain: opts?.retain ?? false,
    })
  }

  async disconnect(): Promise<void> {
    await this.client.endAsync()
  }
}

let hub: MQTTHub | null = null

export async function initMqtt(url: string, opts?: mqtt.IClientOptions): Promise<MQTTHub> {
  const client = await mqtt.connectAsync(url, {
    reconnectPeriod: 5000,
    connectTimeout: 10_000,
    ...opts,
  })
  hub = new MQTTHub(client)
  return hub
}

export function getMqtt(): MQTTHub {
  if (!hub) throw new Error('MQTT not initialized — call initMqtt() first')
  return hub
}
