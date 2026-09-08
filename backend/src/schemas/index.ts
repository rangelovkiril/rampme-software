import { Elysia, t } from 'elysia'

/**
 * Every request and response shape the API speaks, declared once. The
 * TypeScript types below are derived from these schemas rather than written
 * alongside them, so a shape cannot drift from its own validation, its
 * OpenAPI description, or the types the frontend derives through Eden.
 *
 * These are wire shapes. Types that mirror an external schema keep that
 * schema's spelling and stay where they are: `Stop`/`Route`/`Trip`/
 * `StopTime`/`CalendarDate` in gtfs/types.ts are GTFS columns, and
 * `RampReservation` in db/ramp.ts holds SQLite column names. The
 * translation happens once, in the mapping functions each route uses.
 */

export const ErrorSchema = t.Object({ error: t.String() })

export const StopSchema = t.Object({
  stop_id: t.String(),
  stop_code: t.String(),
  stop_name: t.String(),
  stop_lat: t.Number(),
  stop_lon: t.Number(),
})

export const RouteSchema = t.Object({
  route_id: t.String(),
  route_short_name: t.String(),
  route_long_name: t.String(),
  route_type: t.Number(),
})

export const RouteDetailSchema = t.Composite([
  RouteSchema,
  t.Object({
    trips: t.Number(),
    stops: t.Array(StopSchema),
  }),
])

export const RouteShapeSchema = t.Object({
  route_type: t.Number(),
  polylines: t.Array(t.Array(t.Tuple([t.Number(), t.Number()]))),
})

export const RouteShapesSchema = t.Record(t.String(), RouteShapeSchema)

export const RampStatusSchema = t.Union([
  t.Literal('unknown'),
  t.Literal('no_ramp'),
  t.Literal('working'),
  t.Literal('in_use'),
])

export const VehicleSchema = t.Object({
  id: t.String(),
  tripId: t.String(),
  lat: t.Number(),
  lng: t.Number(),
  bearing: t.Nullable(t.Number()),
  speed: t.Nullable(t.Number()),
  route_id: t.Nullable(t.String()),
  route_short_name: t.Nullable(t.String()),
  route_type: t.Nullable(t.Number()),
  headsign: t.Nullable(t.String()),
  label: t.Nullable(t.String()),
  ramp_status: RampStatusSchema,
})

export const VehiclesSchema = t.Object({
  vehicles: t.Array(VehicleSchema),
  meta: t.Object({ stale: t.Boolean() }),
})

export const ArrivalSchema = t.Object({
  id: t.String(),
  vehicle_id: t.Nullable(t.String()),
  route_short_name: t.Nullable(t.String()),
  route_type: t.Nullable(t.Number()),
  headsign: t.Nullable(t.String()),
  route_id: t.Nullable(t.String()),
  scheduled_time: t.Nullable(t.String()),
  expected_time: t.Nullable(t.String()),
  eta_minutes: t.Number(),
  realtime: t.Boolean(),
  has_ramp: t.Boolean(),
})

export const TripStopStatusSchema = t.Union([
  t.Literal('departed'),
  t.Literal('delay'),
  t.Literal('on_time'),
  t.Literal('scheduled'),
])

export const TripStopSchema = t.Object({
  stop_id: t.String(),
  stop_name: t.String(),
  stop_sequence: t.Number(),
  scheduled_time: t.String(),
  expected_time: t.Nullable(t.String()),
  eta_minutes: t.Nullable(t.Number()),
  status: TripStopStatusSchema,
  delay_minutes: t.Number(),
  realtime: t.Boolean(),
})

export const TripDetailSchema = t.Object({
  vehicle_id: t.String(),
  trip_id: t.String(),
  route_id: t.String(),
  route_short_name: t.Nullable(t.String()),
  route_type: t.Nullable(t.Number()),
  headsign: t.Nullable(t.String()),
  stops: t.Array(TripStopSchema),
})

export const TripEtaSchema = t.Object({
  stop_id: t.String(),
  eta_minutes: t.Nullable(t.Number()),
  status: TripStopStatusSchema,
  expected_time: t.Nullable(t.String()),
  delay_minutes: t.Number(),
  realtime: t.Boolean(),
})

export const ReservationSchema = t.Object({
  id: t.Number(),
  vehicle_id: t.String(),
  stop_id: t.String(),
  type: t.Union([t.Literal('board'), t.Literal('alight')]),
  status: t.Union([
    t.Literal('pending'),
    t.Literal('active'),
    t.Literal('done'),
    t.Literal('cancelled'),
    t.Literal('expired'),
  ]),
  created_at: t.Number(),
  resolved_at: t.Nullable(t.Number()),
})

export const ReserveBodySchema = t.Object({
  vehicle_id: t.String({ minLength: 1 }),
  stop_id: t.String({ minLength: 1 }),
  type: t.Union([t.Literal('board'), t.Literal('alight')]),
})

export const CancelledSchema = t.Object({ ok: t.Boolean() })

/** Filters accepted by both /realtime/vehicles and its SSE stream. */
export const VehicleFilterQuerySchema = t.Object({
  route_id: t.Optional(t.String()),
  route_type: t.Optional(t.String()),
  has_ramp: t.Optional(t.String()),
})

/** Decoded GTFS-RT, passed through verbatim by /realtime/trip-updates. */
const RtTripDescriptorSchema = t.Object({
  tripId: t.Optional(t.String()),
  routeId: t.Optional(t.String()),
  startTime: t.Optional(t.String()),
  startDate: t.Optional(t.String()),
  directionId: t.Optional(t.Number()),
})

const RtVehicleDescriptorSchema = t.Object({
  id: t.Optional(t.String()),
  label: t.Optional(t.String()),
  licensePlate: t.Optional(t.String()),
})

const RtStopTimeEventSchema = t.Object({
  delay: t.Optional(t.Number()),
  time: t.Optional(t.Union([t.String(), t.Number()])),
})

export const TripUpdatesSchema = t.Object({
  entity: t.Optional(
    t.Array(
      t.Object({
        id: t.String(),
        tripUpdate: t.Optional(
          t.Object({
            trip: t.Optional(RtTripDescriptorSchema),
            vehicle: t.Optional(RtVehicleDescriptorSchema),
            stopTimeUpdate: t.Optional(
              t.Array(
                t.Object({
                  stopSequence: t.Optional(t.Number()),
                  stopId: t.Optional(t.String()),
                  arrival: t.Optional(RtStopTimeEventSchema),
                  departure: t.Optional(RtStopTimeEventSchema),
                }),
              ),
            ),
            timestamp: t.Optional(t.Union([t.String(), t.Number()])),
          }),
        ),
        vehicle: t.Optional(
          t.Object({
            trip: t.Optional(RtTripDescriptorSchema),
            vehicle: t.Optional(RtVehicleDescriptorSchema),
            position: t.Optional(
              t.Object({
                latitude: t.Number(),
                longitude: t.Number(),
                bearing: t.Optional(t.Number()),
                speed: t.Optional(t.Number()),
              }),
            ),
            currentStopSequence: t.Optional(t.Number()),
            timestamp: t.Optional(t.Union([t.String(), t.Number()])),
          }),
        ),
      }),
    ),
  ),
})

export type ApiError = typeof ErrorSchema.static
export type StopResponse = typeof StopSchema.static
export type RouteResponse = typeof RouteSchema.static
export type RouteDetailResponse = typeof RouteDetailSchema.static
export type RouteShapesResponse = typeof RouteShapesSchema.static
export type RampStatus = typeof RampStatusSchema.static
export type EnrichedVehicle = typeof VehicleSchema.static
export type VehiclesResponse = typeof VehiclesSchema.static
export type ArrivalResult = typeof ArrivalSchema.static
export type TripStopResult = typeof TripStopSchema.static
export type TripDetailResult = typeof TripDetailSchema.static
export type TripEtaUpdate = typeof TripEtaSchema.static
export type ReservationResponse = typeof ReservationSchema.static
export type ReserveBody = typeof ReserveBodySchema.static
export type VehicleFilterQuery = typeof VehicleFilterQuerySchema.static

/**
 * Registers every shape above by name, so routes reference `'Vehicles'`
 * rather than repeating a schema and `/docs` lists them as named models.
 */
export const models = new Elysia({ name: 'api-models' }).model({
  Error: ErrorSchema,
  Stop: StopSchema,
  Stops: t.Array(StopSchema),
  Route: RouteSchema,
  Routes: t.Array(RouteSchema),
  RouteDetail: RouteDetailSchema,
  RouteShapes: RouteShapesSchema,
  Vehicles: VehiclesSchema,
  Arrivals: t.Array(ArrivalSchema),
  TripDetail: TripDetailSchema,
  TripUpdates: TripUpdatesSchema,
  Reservation: ReservationSchema,
  Reservations: t.Array(ReservationSchema),
  ReserveBody: ReserveBodySchema,
  Cancelled: CancelledSchema,
  VehicleFilterQuery: VehicleFilterQuerySchema,
})
