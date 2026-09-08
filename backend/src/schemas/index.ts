import { Elysia, t } from 'elysia'
import type { RampReservation } from '../db/ramp'
import type { Route, Stop } from '../gtfs/types'
import {
  ArrivalSchema,
  CancelledSchema,
  ErrorSchema,
  type ReservationResponse,
  ReservationSchema,
  ReserveBodySchema,
  RouteDetailSchema,
  type RouteResponse,
  RouteSchema,
  RouteShapesSchema,
  type StopResponse,
  StopSchema,
  TripDetailSchema,
  TripUpdatesSchema,
  VehicleFilterQuerySchema,
  VehiclesSchema,
} from './shapes'

export * from './shapes'

/**
 * The mapping boundary. GTFS rows and SQLite rows keep the spelling of the
 * schema they come from; these turn them into the camelCase the API speaks, in
 * one place per shape rather than at each route.
 */
export function toStopResponse(stop: Stop): StopResponse {
  return {
    id: stop.stop_id,
    code: stop.stop_code,
    name: stop.stop_name,
    lat: stop.stop_lat,
    lon: stop.stop_lon,
  }
}

export function toRouteResponse(route: Route): RouteResponse {
  return {
    id: route.route_id,
    shortName: route.route_short_name,
    longName: route.route_long_name,
    type: route.route_type,
  }
}

export function toReservationResponse(r: RampReservation): ReservationResponse {
  return {
    id: r.id,
    vehicleId: r.vehicle_id,
    stopId: r.stop_id,
    type: r.type,
    status: r.status,
    createdAt: r.created_at,
    resolvedAt: r.resolved_at,
  }
}

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
