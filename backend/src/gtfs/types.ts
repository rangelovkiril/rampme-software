export interface Stop {
  stop_id: string
  stop_code: string
  stop_name: string
  stop_lat: number
  stop_lon: number
}

export interface Route {
  route_id: string
  route_short_name: string
  route_long_name: string
  route_type: number // 0=tram, 1=metro, 3=bus, 11=trolleybus
}

export interface Trip {
  trip_id: string
  route_id: string
  service_id: string
  trip_headsign: string
  shape_id: string
  wheelchair_accessible: 0 | 1 | 2
}

export interface ShapePoint {
  shape_id: string
  lat: number
  lng: number
  sequence: number
}

export interface StopTime {
  trip_id: string
  arrival_time: string
  stop_id: string
  stop_sequence: number
}

export interface CalendarDate {
  service_id: string
  date: string // YYYYMMDD
  exception_type: number // 1=added, 2=removed
}

// Decoded GTFS-RT protobuf JSON shapes (protobufjs .toJSON() output — field
// names are camelCase, 64-bit int/timestamp fields may come back as strings).
// Only the fields this codebase actually reads are declared; `header` and
// `alert` are part of the wire format but unused here, so omitted.

export interface GtfsRtPosition {
  latitude: number
  longitude: number
  bearing?: number
  speed?: number
}

export interface GtfsRtTripDescriptor {
  tripId?: string
  routeId?: string
  startTime?: string
  startDate?: string
  directionId?: number
}

export interface GtfsRtVehicleDescriptor {
  id?: string
  label?: string
  licensePlate?: string
}

export interface GtfsRtStopTimeEvent {
  delay?: number
  time?: string | number
}

export interface GtfsRtStopTimeUpdate {
  stopSequence?: number
  stopId?: string
  arrival?: GtfsRtStopTimeEvent
  departure?: GtfsRtStopTimeEvent
}

export interface GtfsRtTripUpdate {
  trip?: GtfsRtTripDescriptor
  vehicle?: GtfsRtVehicleDescriptor
  stopTimeUpdate?: GtfsRtStopTimeUpdate[]
  timestamp?: string | number
}

export interface GtfsRtVehiclePosition {
  trip?: GtfsRtTripDescriptor
  vehicle?: GtfsRtVehicleDescriptor
  position?: GtfsRtPosition
  currentStopSequence?: number
  timestamp?: string | number
}

export interface GtfsRtFeedEntity {
  id: string
  tripUpdate?: GtfsRtTripUpdate
  vehicle?: GtfsRtVehiclePosition
}

export interface GtfsRtFeedMessage {
  entity?: GtfsRtFeedEntity[]
}

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
export type VehicleAccessibilityType = 'BUS' | 'TRAM' | 'TROLLEY'

export type VehicleAccessibilityTable = Record<
  VehicleAccessibilityType,
  Record<string, boolean> // inventory number → ramp-equipped
>
