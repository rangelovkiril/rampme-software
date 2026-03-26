export interface Stop {
  stop_id: string
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
  wheelchair_accessible: 0 | 1 | 2
}

export interface StopTime {
  trip_id: string
  arrival_time: string
  departure_time: string
  stop_id: string
  stop_sequence: number
}

export interface GtfsData {
  stops: Map<string, Stop>
  routes: Map<string, Route>
  trips: Map<string, Trip>
  stopTimes: StopTime[]
}
