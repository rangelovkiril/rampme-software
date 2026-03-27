export interface Stop {
  stop_id: string
  stop_code?: string
  stop_name: string
  stop_lat: number
  stop_lon: number
  wheelchair_boarding?: number
}

export interface Vehicle {
  id: string
  tripId: string
  lat: number
  lng: number
  bearing: number | null
  speed: number | null
  route_id: string | null
  route_short_name: string | null
  route_type: number | null
  headsign: string | null
  ramp_status: 'unknown' | 'working' | 'in_use'
  ramp_reservations: Array<{
    id: number
    stop_id: string
    type: 'board' | 'alight'
    status: 'pending' | 'active'
  }>
}

export interface StopArrival {
  id: string
  vehicle_id: string | null
  route_short_name: string | null
  route_type: number | null
  headsign: string | null
  route_id: string | null
  scheduled_time: string | null
  expected_time: string | null
  eta_minutes: number
  realtime: boolean
  has_ramp: boolean
}

export interface Route {
  route_id: string
  route_short_name: string
  route_long_name: string
  route_type: number
}

export interface TripData {
  vehicle_id: string
  route_short_name: string | null
  route_type: number | null
  headsign: string | null
  stops: Array<{
    stop_id: string
    stop_name: string
    stop_sequence: number
    status: 'departed' | 'delay' | 'on_time' | 'scheduled'
    scheduled_time: string | null
    expected_time: string | null
    eta_minutes: number | null
    delay_minutes: number
    realtime: boolean
  }>
}
