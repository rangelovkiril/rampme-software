export const config = {
  /** Server */
  port: Number(process.env.PORT ?? 3000),

  /** GTFS upstream */
  gtfs: {
    staticUrl: process.env.GTFS_STATIC_URL ?? "https://gtfs.sofiatraffic.bg/api/v1/static",
    realtimeBaseUrl: process.env.GTFS_RT_BASE_URL ?? "https://gtfs.sofiatraffic.bg/api/v1",
    /** How often to re-fetch the static GTFS ZIP (ms) */
    refreshInterval: Number(process.env.GTFS_REFRESH_INTERVAL ?? 24 * 60 * 60 * 1000),
  },

  /** Protobuf */
  protoPath: process.env.PROTO_PATH ?? "proto/gtfs-realtime.proto",
} as const;
