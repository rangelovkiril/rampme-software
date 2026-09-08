import { type Static, Type } from '@sinclair/typebox'
import { Value } from '@sinclair/typebox/value'
import { consola } from 'consola'

/**
 * Every environment variable the backend reads, declared once with its default
 * and its bounds. `Value.Convert` turns the string the environment hands us into
 * the declared type, and `Value.Errors` reports everything wrong at once, so a
 * malformed value fails at startup with the variable named instead of becoming
 * `NaN` and surfacing much later as a nonsensical interval or a dead port.
 *
 * Numbers are declared with `multipleOf: 1` rather than as integers, because
 * conversion to an integer silently truncates: `PORT=3.5` would become 3.
 */
const MILLISECONDS = { minimum: 1, multipleOf: 1 } as const

const EnvSchema = Type.Object({
  PORT: Type.Number({ minimum: 1, maximum: 65_535, multipleOf: 1, default: 3000 }),

  /** IANA zone every GTFS wall-clock time is interpreted in. */
  TZ: Type.String({ minLength: 1, default: 'Europe/Sofia' }),

  GTFS_STATIC_URL: Type.String({
    minLength: 1,
    default: 'https://gtfs.sofiatraffic.bg/api/v1/static',
  }),
  GTFS_RT_BASE_URL: Type.String({ minLength: 1, default: 'https://gtfs.sofiatraffic.bg/api/v1' }),
  GTFS_REFRESH_INTERVAL: Type.Number({ ...MILLISECONDS, default: 24 * 60 * 60 * 1000 }),
  GTFS_RT_STALE_THRESHOLD_MS: Type.Number({ ...MILLISECONDS, default: 15_000 }),

  RAMP_DB_PATH: Type.String({ minLength: 1, default: './data/ramp.db' }),
  /** How often resolved reservations older than 24h are swept from the table. */
  RAMP_CLEANUP_INTERVAL_MS: Type.Number({ ...MILLISECONDS, default: 60 * 60 * 1000 }),
  RAMP_ACCESSIBILITY_DATA_PATH: Type.String({
    minLength: 1,
    default: './data/vehicle-accessibility.json',
  }),
  RAMP_ACCESSIBILITY_REFRESH_MS: Type.Number({ ...MILLISECONDS, default: 60 * 60 * 1000 }),
  /** How long the bridge waits for a `deploying` state before giving up. */
  DEPLOY_TIMEOUT_MS: Type.Number({ ...MILLISECONDS, default: 20_000 }),

  // Absent means no broker: MQTT and the ramp hardware path are skipped entirely.
  MQTT_URL: Type.Optional(Type.String({ minLength: 1 })),
  MQTT_USERNAME: Type.Optional(Type.String()),
  MQTT_PASSWORD: Type.Optional(Type.String()),
  MQTT_CLIENT_ID: Type.String({ minLength: 1, default: 'rampme-backend' }),
})

function readEnv(): Static<typeof EnvSchema> {
  const env = Value.Convert(EnvSchema, Value.Default(EnvSchema, { ...process.env }))
  const errors = [...Value.Errors(EnvSchema, env)]

  if (errors.length > 0) {
    for (const e of errors) {
      consola.error(`${e.path.replace(/^\//, '')}: ${e.message} (got ${JSON.stringify(e.value)})`)
    }
    consola.fatal(`Invalid environment: ${errors.length} problem(s). Refusing to start.`)
    process.exit(1)
  }

  return env as Static<typeof EnvSchema>
}

const env = readEnv()

export const config = {
  port: env.PORT,
  tz: env.TZ,

  gtfs: {
    staticUrl: env.GTFS_STATIC_URL,
    realtimeBaseUrl: env.GTFS_RT_BASE_URL,
    refreshInterval: env.GTFS_REFRESH_INTERVAL,
    staleThresholdMs: env.GTFS_RT_STALE_THRESHOLD_MS,
  },

  ramp: {
    dbPath: env.RAMP_DB_PATH,
    cleanupIntervalMs: env.RAMP_CLEANUP_INTERVAL_MS,
    deployTimeoutMs: env.DEPLOY_TIMEOUT_MS,
    accessibility: {
      dataPath: env.RAMP_ACCESSIBILITY_DATA_PATH,
      refreshMs: env.RAMP_ACCESSIBILITY_REFRESH_MS,
    },
  },

  /** `null` when no broker is configured, so the skip is a type-level branch. */
  mqtt: env.MQTT_URL
    ? {
        url: env.MQTT_URL,
        username: env.MQTT_USERNAME,
        password: env.MQTT_PASSWORD,
        clientId: env.MQTT_CLIENT_ID,
      }
    : null,
} as const
