'use client'

import L from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'

interface Vehicle {
  id: string
  lat: number
  lng: number
  bearing: number | null
  speed: number
  route_id: string
  route_short_name: string
  route_type: number
  headsign: string
}

// route_type: 0=tram, 1=metro, 3=bus, 11=trolleybus
const VEHICLE_STYLES: Record<number, { color: string; label: string }> = {
  0: {
    color: '#F7941D',
    label: 'Трамвай'
  },
  3: {
    color: '#BE1E2D',
    label: 'Автобус'
  },
  11: {
    color: '#27AAE1',
    label: 'Тролей'
  },
  1: {
    color: '#9B59B6',
    label: 'Метро'
  }
}

const DEFAULT_STYLE = VEHICLE_STYLES[3]
const MIN_ZOOM_FOR_VEHICLES = 10
const DETAIL_ZOOM_FOR_VEHICLES = 16

const POLL_INTERVAL = 5_000

/**
 * Create a detailed vehicle icon (route badge + rotated vehicle glyph) for close zoom levels.
 */
function vehicleIcon(bearing: number, routeType: number, routeName: string) {
  const style = VEHICLE_STYLES[routeType] ?? DEFAULT_STYLE
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%)">
      <div style="background:${style.color};color:#fff;font-family:Inter,sans-serif;font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px;white-space:nowrap;line-height:16px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,0.3)">${routeName}</div>
      <div style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;transform:rotate(${bearing}deg)">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="${style.color}" stroke="#fff" stroke-width="0.8">
          <path d="M5 11V7a7 7 0 0 1 14 0v4"/>
          <rect x="3" y="11" width="18" height="8" rx="2"/>
          <circle cx="7.5" cy="21.5" r="1.5"/>
          <circle cx="16.5" cy="21.5" r="1.5"/>
        </svg>
      </div>
    </div>`,
    iconSize: [40, 44],
    iconAnchor: [20, 22]
  })
}

/**
 * Syncs real-time vehicle data from /api/realtime/vehicles to Leaflet markers on the current map.
 *
 * Polls the backend at a fixed interval and creates, updates, or removes markers and popups to reflect the latest vehicle positions, headings, and route info. Attaches markers to an internal LayerGroup and stops polling / cleans up when the component unmounts.
 */
interface VehiclesLayerProps {
  onVehicleSelect?: (routeId: string, routeType: number) => void
}

export default function VehiclesLayer({ onVehicleSelect }: VehiclesLayerProps) {
  const map = useMap()
  const groupRef = useRef<L.LayerGroup | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true

    async function poll() {
      try {
        const res = await fetch('/api/realtime/vehicles')
        if (!res.ok) return
        const data = await res.json()
        if (!active) return
        if (Array.isArray(data)) {
          setVehicles(data)
        } else {
          setVehicles([])
        }
      } catch {
        // silently retry next interval
      }
    }

    poll()
    const id = setInterval(poll, POLL_INTERVAL)
    return () => {
      active = false
      clearInterval(id)
    }
  }, [])

  useEffect(() => {
    function update() {
      setRevision(r => r + 1)
    }
    map.on('zoomend', update)
    map.on('moveend', update)
    return () => {
      map.off('zoomend', update)
      map.off('moveend', update)
    }
  }, [map])

  useEffect(() => {
    if (!groupRef.current) {
      groupRef.current = L.layerGroup()
    }
    const group = groupRef.current
    group.clearLayers()

    const zoom = map.getZoom()
    if (zoom < MIN_ZOOM_FOR_VEHICLES || vehicles.length === 0) {
      group.remove()
      return
    }

    const bounds = map.getBounds()
    const useDetailedMarkers = zoom >= DETAIL_ZOOM_FOR_VEHICLES

    for (const v of vehicles) {
      if (!Number.isFinite(v.lat) || !Number.isFinite(v.lng)) continue

      const latlng = L.latLng(v.lat, v.lng)
      if (!bounds.contains(latlng)) continue

      const style = VEHICLE_STYLES[v.route_type] ?? DEFAULT_STYLE
      const popupHtml = `<div style="font-family:Inter,sans-serif;font-size:13px">
        <span style="display:inline-block;background:${style.color};color:#fff;padding:2px 8px;border-radius:4px;font-weight:700;margin-bottom:4px">${style.label} ${v.route_short_name}</span>
        <br/>${v.headsign}
        <br/><span style="opacity:0.5;font-size:11px">${v.id} · ${v.speed} km/h</span>
      </div>`

      let marker: L.Marker | L.CircleMarker
      if (useDetailedMarkers) {
        const bearing = v.bearing ?? 0
        marker = L.marker(latlng, {
          icon: vehicleIcon(bearing, v.route_type, v.route_short_name)
        })
      } else {
        marker = L.circleMarker(latlng, {
          radius: 5,
          fillColor: style.color,
          fillOpacity: 0.95,
          color: '#ffffff',
          opacity: 0.95,
          weight: 1
        })
      }
      marker.bindPopup(popupHtml)
      if (onVehicleSelect) {
        marker.on('click', () => onVehicleSelect(v.route_id, v.route_type))
      }
      marker.addTo(group)
    }

    group.addTo(map)
  }, [vehicles, map, revision])

  return null
}
