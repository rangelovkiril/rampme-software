import { type Static, Type } from '@sinclair/typebox'
import { GtfsRtFeedMessageSchema } from '../gtfs/types'

/**
 * Every request and response shape the API speaks, declared once. The
 * TypeScript types below are derived from these schemas rather than written
 * alongside them, so a shape cannot drift from its own validation, its
 * OpenAPI description, or the types the frontend derives through Eden.
 *
 * Plain TypeBox, with no Elysia or database import, so the frontend can pull
 * these in at runtime to validate SSE payloads — Eden covers HTTP but not
 * EventSource. Registration as Elysia models and the GTFS/SQLite mapping
 * functions live in ./index.ts, which the frontend never imports.
 *
 * These are wire shapes. Types that mirror an external schema keep that
 * schema's spelling and stay where they are: `Stop`/`Route`/`Trip`/
 * `StopTime`/`CalendarDate` in gtfs/types.ts are GTFS columns, and
 * `RampReservation` in db/ramp.ts holds SQLite column names.
 */

/** Elysia's t.Nullable, in plain TypeBox: the value or an explicit null. */
const Nullable = <T extends Parameters<typeof Type.Union>[0][number]>(schema: T) =>
  Type.Union([schema, Type.Null()])

export const ErrorSchema = Type.Object({ error: Type.String() })

export const StopSchema = Type.Object({
  id: Type.String(),
  code: Type.String(),
  name: Type.String(),
  lat: Type.Number(),
  lon: Type.Number(),
})

export const RouteSchema = Type.Object({
  id: Type.String(),
  shortName: Type.String(),
  longName: Type.String(),
  type: Type.Number(),
})

export const RouteDetailSchema = Type.Composite([
  RouteSchema,
  Type.Object({
    trips: Type.Number(),
    stops: Type.Array(StopSchema),
  }),
])

export const RouteShapeSchema = Type.Object({
  routeType: Type.Number(),
  polylines: Type.Array(Type.Array(Type.Tuple([Type.Number(), Type.Number()]))),
})

export const RouteShapesSchema = Type.Record(Type.String(), RouteShapeSchema)

export const RampStatusSchema = Type.Union([
  Type.Literal('unknown'),
  Type.Literal('no_ramp'),
  Type.Literal('working'),
  Type.Literal('in_use'),
])

export const VehicleSchema = Type.Object({
  id: Type.String(),
  tripId: Type.String(),
  lat: Type.Number(),
  lng: Type.Number(),
  bearing: Nullable(Type.Number()),
  speed: Nullable(Type.Number()),
  routeId: Nullable(Type.String()),
  routeShortName: Nullable(Type.String()),
  routeType: Nullable(Type.Number()),
  headsign: Nullable(Type.String()),
  label: Nullable(Type.String()),
  rampStatus: RampStatusSchema,
})

export const VehiclesSchema = Type.Object({
  vehicles: Type.Array(VehicleSchema),
  meta: Type.Object({ stale: Type.Boolean() }),
})

export const ArrivalSchema = Type.Object({
  id: Type.String(),
  vehicleId: Nullable(Type.String()),
  routeShortName: Nullable(Type.String()),
  routeType: Nullable(Type.Number()),
  headsign: Nullable(Type.String()),
  routeId: Nullable(Type.String()),
  scheduledTime: Nullable(Type.String()),
  expectedTime: Nullable(Type.String()),
  etaMinutes: Type.Number(),
  realtime: Type.Boolean(),
  hasRamp: Type.Boolean(),
})

export const TripStopStatusSchema = Type.Union([
  Type.Literal('departed'),
  Type.Literal('delay'),
  Type.Literal('on_time'),
  Type.Literal('scheduled'),
])

export const TripStopSchema = Type.Object({
  stopId: Type.String(),
  stopName: Type.String(),
  stopSequence: Type.Number(),
  scheduledTime: Type.String(),
  expectedTime: Nullable(Type.String()),
  etaMinutes: Nullable(Type.Number()),
  status: TripStopStatusSchema,
  delayMinutes: Type.Number(),
  realtime: Type.Boolean(),
})

export const TripDetailSchema = Type.Object({
  vehicleId: Type.String(),
  tripId: Type.String(),
  routeId: Type.String(),
  routeShortName: Nullable(Type.String()),
  routeType: Nullable(Type.Number()),
  headsign: Nullable(Type.String()),
  stops: Type.Array(TripStopSchema),
})

export const TripEtaSchema = Type.Object({
  stopId: Type.String(),
  etaMinutes: Nullable(Type.Number()),
  status: TripStopStatusSchema,
  expectedTime: Nullable(Type.String()),
  delayMinutes: Type.Number(),
  realtime: Type.Boolean(),
})

export const ReservationSchema = Type.Object({
  id: Type.Number(),
  vehicleId: Type.String(),
  stopId: Type.String(),
  type: Type.Union([Type.Literal('board'), Type.Literal('alight')]),
  status: Type.Union([
    Type.Literal('pending'),
    Type.Literal('active'),
    Type.Literal('done'),
    Type.Literal('cancelled'),
    Type.Literal('expired'),
  ]),
  createdAt: Type.Number(),
  resolvedAt: Nullable(Type.Number()),
})

export const ReserveBodySchema = Type.Object({
  vehicleId: Type.String({ minLength: 1 }),
  stopId: Type.String({ minLength: 1 }),
  type: Type.Union([Type.Literal('board'), Type.Literal('alight')]),
})

export const CancelledSchema = Type.Object({ ok: Type.Boolean() })

/** Filters accepted by both /realtime/vehicles and its SSE stream. */
export const VehicleFilterQuerySchema = Type.Object({
  routeId: Type.Optional(Type.String()),
  routeType: Type.Optional(Type.String()),
  hasRamp: Type.Optional(Type.String()),
})

/** Decoded GTFS-RT, passed through verbatim by /realtime/trip-updates. The
 * shape is defined once in gtfs/types.ts, alongside the types derived from it. */
export const TripUpdatesSchema = GtfsRtFeedMessageSchema

/** Payload shapes for the four SSE streams, checked by makeSseStream on send. */
export const VehiclesStreamSchema = Type.Array(VehicleSchema)
export const ArrivalsStreamSchema = Type.Array(ArrivalSchema)
export const TripEtasStreamSchema = Type.Array(TripEtaSchema)
export const ReservationsStreamSchema = Type.Array(ReservationSchema)

export type ApiError = Static<typeof ErrorSchema>
export type StopResponse = Static<typeof StopSchema>
export type RouteResponse = Static<typeof RouteSchema>
export type RouteDetailResponse = Static<typeof RouteDetailSchema>
export type RouteShapesResponse = Static<typeof RouteShapesSchema>
export type RampStatus = Static<typeof RampStatusSchema>
export type EnrichedVehicle = Static<typeof VehicleSchema>
export type VehiclesResponse = Static<typeof VehiclesSchema>
export type ArrivalResult = Static<typeof ArrivalSchema>
export type TripStopResult = Static<typeof TripStopSchema>
export type TripDetailResult = Static<typeof TripDetailSchema>
export type TripEtaUpdate = Static<typeof TripEtaSchema>
export type ReservationResponse = Static<typeof ReservationSchema>
export type ReserveBody = Static<typeof ReserveBodySchema>
export type VehicleFilterQuery = Static<typeof VehicleFilterQuerySchema>
