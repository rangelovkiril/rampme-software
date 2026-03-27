export const config = {
  port: Number(process.env.PORT ?? 3000),

  gtfs: {
    staticUrl: process.env.GTFS_STATIC_URL ?? 'https://gtfs.sofiatraffic.bg/api/v1/static',
    realtimeBaseUrl: process.env.GTFS_RT_BASE_URL ?? 'https://gtfs.sofiatraffic.bg/api/v1',
    /** How often to re-fetch the static GTFS ZIP (ms) */
    refreshInterval: Number(process.env.GTFS_REFRESH_INTERVAL ?? 24 * 60 * 60 * 1000),
  },

  protoPath: process.env.PROTO_PATH ?? 'proto/gtfs-realtime.proto',

  /**
   * Ramp availability mode:
   *   true  = every bus is treated as ramp-equipped (for testing)
   *   false = only buses with wheelchair_accessible=1 in GTFS data
   */
  rampAll: process.env.RAMP_ALL === 'true',
} as const
