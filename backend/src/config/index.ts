function positiveInt(name: string, envValue: string | undefined, fallback: number): number {
  if (envValue === undefined) return fallback
  const n = Number(envValue)
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer, got ${JSON.stringify(envValue)}`)
  }
  return n
}

function port(name: string, envValue: string | undefined, fallback: number): number {
  const n = positiveInt(name, envValue, fallback)
  if (n > 65535) {
    throw new Error(`${name} must be a valid TCP port (1-65535), got ${JSON.stringify(envValue)}`)
  }
  return n
}

export const config = {
  port: port('PORT', process.env.PORT, 3000),

  /** IANA zone every GTFS wall-clock time is interpreted in. */
  tz: process.env.TZ ?? 'Europe/Sofia',

  gtfs: {
    staticUrl: process.env.GTFS_STATIC_URL ?? 'https://gtfs.sofiatraffic.bg/api/v1/static',
    realtimeBaseUrl: process.env.GTFS_RT_BASE_URL ?? 'https://gtfs.sofiatraffic.bg/api/v1',
    refreshInterval: positiveInt(
      'GTFS_REFRESH_INTERVAL',
      process.env.GTFS_REFRESH_INTERVAL,
      24 * 60 * 60 * 1000,
    ),
    staleThresholdMs: positiveInt(
      'GTFS_RT_STALE_THRESHOLD_MS',
      process.env.GTFS_RT_STALE_THRESHOLD_MS,
      15_000,
    ),
  },

  rampDbPath: process.env.RAMP_DB_PATH ?? './data/ramp.db',

  /** How often resolved reservations older than 24h are swept from the table. */
  rampCleanupIntervalMs: positiveInt(
    'RAMP_CLEANUP_INTERVAL_MS',
    process.env.RAMP_CLEANUP_INTERVAL_MS,
    60 * 60 * 1000,
  ),

  rampAccessibility: {
    dataPath: process.env.RAMP_ACCESSIBILITY_DATA_PATH ?? './data/vehicle-accessibility.json',
    refreshMs: positiveInt(
      'RAMP_ACCESSIBILITY_REFRESH_MS',
      process.env.RAMP_ACCESSIBILITY_REFRESH_MS,
      60 * 60 * 1000,
    ),
  },

  mqtt: {
    url: process.env.MQTT_URL,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    clientId: process.env.MQTT_CLIENT_ID ?? 'rampme-backend',
    /** How long the bridge waits for a `deploying` state before giving up. */
    deployTimeoutMs: positiveInt('DEPLOY_TIMEOUT_MS', process.env.DEPLOY_TIMEOUT_MS, 20_000),
  },
} as const
