export const config = {
  port: Number(process.env.PORT ?? 3000),

  gtfs: {
    staticUrl:
      process.env.GTFS_STATIC_URL ??
      "https://gtfs.sofiatraffic.bg/api/v1/static",
    realtimeBaseUrl:
      process.env.GTFS_RT_BASE_URL ?? "https://gtfs.sofiatraffic.bg/api/v1",
    refreshInterval: Number(
      process.env.GTFS_REFRESH_INTERVAL ?? 24 * 60 * 60 * 1000,
    ),
  },

  protoPath: process.env.PROTO_PATH ?? "proto/gtfs-realtime.proto",

  // When MOCK_RAMP=true, ~50% of vehicles are treated as ramp-equipped (stable per process run).
  mockRamp: process.env.MOCK_RAMP === "true",

  rampDbPath: process.env.RAMP_DB_PATH ?? "./data/ramp.db",
} as const;
