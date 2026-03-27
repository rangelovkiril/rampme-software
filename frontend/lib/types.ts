export interface Stop {
  stop_id: string
  stop_code?: string
  stop_name: string
  stop_lat: number
  stop_lon: number
  wheelchair_boarding?: 0 | 1 | 2
}

export interface Route {
  route_id: string
  route_short_name: string
  route_long_name: string
  route_type: number
}

export interface Vehicle {
  id: string
  tripId: string
  lat: number
  lng: number
  bearing: number | null
  speed: number
  route_id: string
  route_short_name: string
  route_type: number
  headsign: string
}

export interface StopArrival {
  id: string
  route_short_name: string | null
  route_type: number | null
  headsign: string | null
  route_id: string | null
  scheduled_time?: string | null
  expected_time?: string | null
  eta_minutes?: number
  realtime?: boolean
  has_ramp?: boolean
}

export interface TripStop {
  stop_id: string
  stop_name: string
  stop_sequence: number
  scheduled_time: string
  expected_time: string | null
  eta_minutes: number | null
  status: 'departed' | 'delay' | 'on_time' | 'scheduled'
  delay_minutes: number
}

export interface TripData {
  vehicle_id: string
  trip_id: string
  route_id: string
  route_short_name: string | null
  route_type: number | null
  headsign: string | null
  stops: TripStop[]
}

export interface SelectedRoute {
  routeId: string
  routeType: number
}
