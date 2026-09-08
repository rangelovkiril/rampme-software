import { type Static, Type } from '@sinclair/typebox'

// GTFS static rows, parsed from a third-party ZIP. Declared as TypeBox so the
// parse can reject a row that does not match instead of returning it: a
// mis-parsed stop used to reach clients with NaN coordinates. Field names keep
// GTFS's own snake_case; the wire shapes in schemas/ are what map them.

export const StopSchema = Type.Object({
  stop_id: Type.String({ minLength: 1 }),
  stop_code: Type.String(),
  stop_name: Type.String(),
  stop_lat: Type.Number({ minimum: -90, maximum: 90 }),
  stop_lon: Type.Number({ minimum: -180, maximum: 180 }),
})

export const RouteSchema = Type.Object({
  route_id: Type.String({ minLength: 1 }),
  route_short_name: Type.String(),
  route_long_name: Type.String(),
  /** Already normalized to the base types Sofia uses: 0=tram, 1=metro, 3=bus, 11=trolleybus. */
  route_type: Type.Number(),
})

export const TripSchema = Type.Object({
  trip_id: Type.String({ minLength: 1 }),
  route_id: Type.String({ minLength: 1 }),
  service_id: Type.String({ minLength: 1 }),
  trip_headsign: Type.String(),
  shape_id: Type.String(),
  wheelchair_accessible: Type.Union([Type.Literal(0), Type.Literal(1), Type.Literal(2)]),
})

export const ShapePointSchema = Type.Object({
  shape_id: Type.String({ minLength: 1 }),
  lat: Type.Number({ minimum: -90, maximum: 90 }),
  lng: Type.Number({ minimum: -180, maximum: 180 }),
  sequence: Type.Number(),
})

export const StopTimeSchema = Type.Object({
  trip_id: Type.String({ minLength: 1 }),
  /** May exceed 24:00 for a trip continuing past midnight on the same service day. */
  arrival_time: Type.String({ pattern: '^\\d{1,2}:\\d{2}:\\d{2}$' }),
  stop_id: Type.String({ minLength: 1 }),
  stop_sequence: Type.Number(),
})

export const CalendarDateSchema = Type.Object({
  service_id: Type.String({ minLength: 1 }),
  date: Type.String({ pattern: '^\\d{8}$' }),
  /** 1=added, 2=removed. */
  exception_type: Type.Union([Type.Literal(1), Type.Literal(2)]),
})

export type Stop = Static<typeof StopSchema>
export type Route = Static<typeof RouteSchema>
export type Trip = Static<typeof TripSchema>
export type ShapePoint = Static<typeof ShapePointSchema>
export type StopTime = Static<typeof StopTimeSchema>
export type CalendarDate = Static<typeof CalendarDateSchema>

// Decoded GTFS-RT protobuf JSON shapes (protobufjs .toJSON() output — field
// names are camelCase, 64-bit int/timestamp fields may come back as strings).
// Only the fields this codebase actually reads are declared; `header` and
// `alert` are part of the wire format but unused here, so omitted.
//
// Declared as TypeBox rather than interfaces because /realtime/trip-updates
// passes the decoded feed through verbatim and needs a response schema for it.
// The types below are derived, so the shape has one definition. Nothing
// validates these per tick: protobuf decoding already guarantees the shape,
// and the feed is on a hot path.

export const GtfsRtPositionSchema = Type.Object({
  latitude: Type.Number(),
  longitude: Type.Number(),
  bearing: Type.Optional(Type.Number()),
  speed: Type.Optional(Type.Number()),
})

export const GtfsRtTripDescriptorSchema = Type.Object({
  tripId: Type.Optional(Type.String()),
  routeId: Type.Optional(Type.String()),
  startTime: Type.Optional(Type.String()),
  startDate: Type.Optional(Type.String()),
  directionId: Type.Optional(Type.Number()),
})

export const GtfsRtVehicleDescriptorSchema = Type.Object({
  id: Type.Optional(Type.String()),
  label: Type.Optional(Type.String()),
  licensePlate: Type.Optional(Type.String()),
})

/** protobufjs widens 64-bit fields to strings, so both forms are accepted. */
const Int64 = Type.Union([Type.String(), Type.Number()])

export const GtfsRtStopTimeEventSchema = Type.Object({
  delay: Type.Optional(Type.Number()),
  time: Type.Optional(Int64),
})

export const GtfsRtStopTimeUpdateSchema = Type.Object({
  stopSequence: Type.Optional(Type.Number()),
  stopId: Type.Optional(Type.String()),
  arrival: Type.Optional(GtfsRtStopTimeEventSchema),
  departure: Type.Optional(GtfsRtStopTimeEventSchema),
})

export const GtfsRtTripUpdateSchema = Type.Object({
  trip: Type.Optional(GtfsRtTripDescriptorSchema),
  vehicle: Type.Optional(GtfsRtVehicleDescriptorSchema),
  stopTimeUpdate: Type.Optional(Type.Array(GtfsRtStopTimeUpdateSchema)),
  timestamp: Type.Optional(Int64),
})

export const GtfsRtVehiclePositionSchema = Type.Object({
  trip: Type.Optional(GtfsRtTripDescriptorSchema),
  vehicle: Type.Optional(GtfsRtVehicleDescriptorSchema),
  position: Type.Optional(GtfsRtPositionSchema),
  currentStopSequence: Type.Optional(Type.Number()),
  timestamp: Type.Optional(Int64),
})

export const GtfsRtFeedEntitySchema = Type.Object({
  id: Type.String(),
  tripUpdate: Type.Optional(GtfsRtTripUpdateSchema),
  vehicle: Type.Optional(GtfsRtVehiclePositionSchema),
})

export const GtfsRtFeedMessageSchema = Type.Object({
  entity: Type.Optional(Type.Array(GtfsRtFeedEntitySchema)),
})

export type GtfsRtPosition = Static<typeof GtfsRtPositionSchema>
export type GtfsRtTripDescriptor = Static<typeof GtfsRtTripDescriptorSchema>
export type GtfsRtVehicleDescriptor = Static<typeof GtfsRtVehicleDescriptorSchema>
export type GtfsRtStopTimeEvent = Static<typeof GtfsRtStopTimeEventSchema>
export type GtfsRtStopTimeUpdate = Static<typeof GtfsRtStopTimeUpdateSchema>
export type GtfsRtTripUpdate = Static<typeof GtfsRtTripUpdateSchema>
export type GtfsRtVehiclePosition = Static<typeof GtfsRtVehiclePositionSchema>
export type GtfsRtFeedEntity = Static<typeof GtfsRtFeedEntitySchema>
export type GtfsRtFeedMessage = Static<typeof GtfsRtFeedMessageSchema>

export interface GtfsData {
  stops: Map<string, Stop>
  stopsByCode: Map<string, string[]> // stop_code → [stop_id, ...]
  routes: Map<string, Route>
  trips: Map<string, Trip>
  tripsByRoute: Map<string, Trip[]> // route_id → trips
  stopTimesByStop: Map<string, StopTime[]> // stop_id → stop_times (indexed)
  stopTimesByTrip: Map<string, StopTime[]> // trip_id → stop_times sorted by sequence
  stopIdsByRoute: Map<string, Set<string>> // route_id → stop_ids served
  calendarDates: CalendarDate[]
  shapesByRoute: Map<string, [number, number][][]> // route_id → array of polylines
}

// Vehicle wheelchair-ramp accessibility (see openspec/specs/ramp/vehicle-accessibility).
// Produced out-of-band from trinmo.org's fleet registry by a script scheduled in the
// fleet repo, keyed by the GTFS route-type prefix scheme (A=bus, TM=tram, TB=trolleybus)
// and the vehicle's inventory number; consumed at runtime by `gtfs/accessibility.ts`.
// A vehicle type/inventory pair present here is always resolved (true/false); a
// missing pair means unresolved, reported as unknown — never a stand-in for "false".
//
// This file is written by a script in another repository and applied as a
// ConfigMap, so its shape is external input: it gets a schema and a runtime
// check, not a cast. Without one, a table missing a vehicle type made
// resolve() throw per vehicle, which took /realtime/vehicles down with it.
export const VehicleAccessibilityTypeSchema = Type.Union([
  Type.Literal('BUS'),
  Type.Literal('TRAM'),
  Type.Literal('TROLLEY'),
])

export const VehicleAccessibilityTableSchema = Type.Object({
  BUS: Type.Record(Type.String(), Type.Boolean()),
  TRAM: Type.Record(Type.String(), Type.Boolean()),
  TROLLEY: Type.Record(Type.String(), Type.Boolean()),
})

export type VehicleAccessibilityType = Static<typeof VehicleAccessibilityTypeSchema>
export type VehicleAccessibilityTable = Static<typeof VehicleAccessibilityTableSchema>
