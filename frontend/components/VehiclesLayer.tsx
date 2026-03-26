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
const VEHICLE_STYLES: Record<number, { color: string; label: string; svg: string }> = {
  0: {
    color: '#F7941D',
    label: 'Трамвай',
    svg: `<path d="M4 18V6a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v12"/><line x1="4" y1="12" x2="20" y2="12"/><rect x="4" y="18" width="16" height="2" rx="1"/><line x1="8" y1="22" x2="8" y2="20"/><line x1="16" y1="22" x2="16" y2="20"/>`,
  },
  3: {
    color: '#BE1E2D',
    label: 'Автобус',
    svg: `<path d="M5 11V7a7 7 0 0 1 14 0v4"/><rect x="3" y="11" width="18" height="8" rx="2"/><circle cx="7.5" cy="21.5" r="1.5"/><circle cx="16.5" cy="21.5" r="1.5"/>`,
  },
  11: {
    color: '#27AAE1',
    label: 'Тролей',
    svg: `<path d="M5 11V7a7 7 0 0 1 14 0v4"/><rect x="3" y="11" width="18" height="8" rx="2"/><circle cx="7.5" cy="21.5" r="1.5"/><circle cx="16.5" cy="21.5" r="1.5"/><line x1="9" y1="2" x2="7" y2="0"/><line x1="15" y1="2" x2="17" y2="0"/>`,
  },
  1: {
    color: '#9B59B6',
    label: 'Метро',
    svg: `<rect x="2" y="8" width="20" height="10" rx="3"/><circle cx="7" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/><line x1="2" y1="13" x2="22" y2="13"/><rect x="6" y="5" width="4" height="3" rx="1"/><rect x="14" y="5" width="4" height="3" rx="1"/>`,
  },
}

const DEFAULT_STYLE = VEHICLE_STYLES[3]

function vehicleIcon(bearing: number, routeType: number, routeName: string) {
  const style = VEHICLE_STYLES[routeType] ?? DEFAULT_STYLE
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%)">
      <div style="background:${style.color};color:#fff;font-family:Inter,sans-serif;font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px;white-space:nowrap;line-height:16px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,0.3)">${routeName}</div>
      <div style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;transform:rotate(${bearing}deg)">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="${style.color}" stroke="#fff" stroke-width="0.8">${style.svg}</svg>
      </div>
    </div>`,
    iconSize: [40, 44],
    iconAnchor: [20, 22],
  })
}

const POLL_INTERVAL = 5_000

export default function VehiclesLayer() {
  const map = useMap()
  const markersRef = useRef<Map<string, L.Marker>>(new Map())
  const groupRef = useRef<L.LayerGroup>(L.layerGroup())
  const [vehicles, setVehicles] = useState<Vehicle[]>([])

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
    const group = groupRef.current
    const existing = markersRef.current
    const seen = new Set<string>()

    for (const v of vehicles) {
      if (!Number.isFinite(v.lat) || !Number.isFinite(v.lng)) continue

      seen.add(v.id)

      const latlng = L.latLng(v.lat, v.lng)
      const bearing = v.bearing ?? 0
      const style = VEHICLE_STYLES[v.route_type] ?? DEFAULT_STYLE
      const popupHtml = `<div style="font-family:Inter,sans-serif;font-size:13px">
        <span style="display:inline-block;background:${style.color};color:#fff;padding:2px 8px;border-radius:4px;font-weight:700;margin-bottom:4px">${style.label} ${v.route_short_name}</span>
        <br/>${v.headsign}
        <br/><span style="opacity:0.5;font-size:11px">${v.id} · ${v.speed} km/h</span>
      </div>`

      const existingMarker = existing.get(v.id)

      if (existingMarker) {
        existingMarker.setLatLng(latlng)
        existingMarker.setIcon(vehicleIcon(bearing, v.route_type, v.route_short_name))
        existingMarker.setPopupContent(popupHtml)
      } else {
        const marker = L.marker(latlng, {
          icon: vehicleIcon(bearing, v.route_type, v.route_short_name),
        })
          .bindPopup(popupHtml)
          .addTo(group)
        existing.set(v.id, marker)
      }
    }

    for (const [key, marker] of existing) {
      if (!seen.has(key)) {
        group.removeLayer(marker)
        existing.delete(key)
      }
    }

    group.addTo(map)
  }, [vehicles, map])

  return null
}
