export interface Stop {
  stop_id: string
  stop_code: string
  stop_name: string
  stop_lat: number
  stop_lon: number
  wheelchair_boarding: 0 | 1 | 2 // 0=no info, 1=accessible, 2=not accessible
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
  direction_id: number
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
  departure_time: string
  stop_id: string
  stop_sequence: number
}

export interface CalendarDate {
  service_id: string
  date: string // YYYYMMDD
  exception_type: number // 1=added, 2=removed
}

export interface GtfsData {
  stops: Map<string, Stop>
  stopsByCode: Map<string, string[]> // stop_code → [stop_id, ...]
  routes: Map<string, Route>
  trips: Map<string, Trip>
  stopTimes: StopTime[]
  stopTimesByStop: Map<string, StopTime[]> // stop_id → stop_times (indexed)
  stopTimesByTrip: Map<string, StopTime[]> // trip_id → stop_times sorted by sequence
  calendarDates: CalendarDate[]
  shapes: Map<string, [number, number][]> // shape_id → sorted [[lat, lng], ...]
  shapesByRoute: Map<string, [number, number][][]> // route_id → array of polylines
}
