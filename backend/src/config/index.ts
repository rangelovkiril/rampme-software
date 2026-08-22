export const config = {
  port: Number(process.env.PORT ?? 3000),

  gtfs: {
    staticUrl: process.env.GTFS_STATIC_URL ?? 'https://gtfs.sofiatraffic.bg/api/v1/static',
    realtimeBaseUrl: process.env.GTFS_RT_BASE_URL ?? 'https://gtfs.sofiatraffic.bg/api/v1',
    refreshInterval: Number(process.env.GTFS_REFRESH_INTERVAL ?? 24 * 60 * 60 * 1000),
    staleThresholdMs: Number(process.env.GTFS_RT_STALE_THRESHOLD_MS ?? 15_000),
  },

  protoPath: process.env.PROTO_PATH ?? 'proto/gtfs-realtime.proto',

  mockRamp: process.env.MOCK_RAMP === 'true',

  rampDbPath: process.env.RAMP_DB_PATH ?? './data/ramp.db',

  mqtt: {
    url: process.env.MQTT_URL,
    username: process.env.MQTT_USERNAME,
    password: process.env.MQTT_PASSWORD,
    clientId: process.env.MQTT_CLIENT_ID ?? 'rampme-backend',
  },
} as const
