'use client'

import L from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'
import type { Vehicle } from '@/lib/types'
import { getRouteColor, getRouteLabel } from '@/lib/transit'

const MIN_ZOOM = 10
const DETAIL_ZOOM = 16
const POLL_INTERVAL = 5_000

function vehicleIcon(_bearing: number, routeType: number, routeName: string) {
  const color = getRouteColor(routeType)
  return L.divIcon({
    className: '',
    html: `<div style="position:absolute;transform:translate(-50%,-50%);white-space:nowrap;background:${color};color:#fff;font-family:Inter,sans-serif;font-size:11px;font-weight:800;padding:3px 7px;border-radius:6px;box-shadow:0 2px 6px rgba(0,0,0,0.4)">${routeName}</div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}

interface VehiclesLayerProps {
  onVehicleSelect?: (vehicle: Vehicle) => void
  selectedVehicleId?: string | null
}

export default function VehiclesLayer({ onVehicleSelect, selectedVehicleId }: VehiclesLayerProps) {
  const map = useMap()
  const groupRef = useRef<L.LayerGroup | null>(null)
  const [vehicles, setVehicles] = useState<Vehicle[]>([])
  const [revision, setRevision] = useState(0)

  useEffect(() => {
    let active = true
    async function poll() {
      try {
        const res = await fetch('/api/realtime/vehicles')
        if (!res.ok || !active) return
        const data = await res.json()
        if (active) setVehicles(Array.isArray(data) ? data : [])
      } catch { /* retry next interval */ }
    }
    poll()
    const id = setInterval(poll, POLL_INTERVAL)
    return () => { active = false; clearInterval(id) }
  }, [])

  useEffect(() => {
    function update() { setRevision(r => r + 1) }
    map.on('zoomend', update)
    map.on('moveend', update)
    return () => {
      map.off('zoomend', update)
      map.off('moveend', update)
    }
  }, [map])

  // Pan map to selected vehicle whenever its position updates
  useEffect(() => {
    if (!selectedVehicleId) return
    const v = vehicles.find((v) => v.id === selectedVehicleId)
    if (!v || !Number.isFinite(v.lat) || !Number.isFinite(v.lng)) return
    map.panTo([v.lat, v.lng], { animate: true, duration: 0.8 })
  }, [vehicles, selectedVehicleId, map])

  useEffect(() => {
    if (!groupRef.current) groupRef.current = L.layerGroup()
    const group = groupRef.current
    group.clearLayers()

    const zoom = map.getZoom()
    if (zoom < MIN_ZOOM || vehicles.length === 0) {
      group.remove()
      return
    }

    const bounds = map.getBounds()
    const useDetailed = zoom >= DETAIL_ZOOM

    for (const v of vehicles) {
      if (!Number.isFinite(v.lat) || !Number.isFinite(v.lng)) continue

      const latlng = L.latLng(v.lat, v.lng)
      if (!bounds.contains(latlng)) continue

      const color = getRouteColor(v.route_type)
      const label = getRouteLabel(v.route_type)

      const popupHtml = `<div style="font-family:Inter,sans-serif;font-size:13px">
        <span style="display:inline-block;background:${color};color:#fff;padding:2px 8px;border-radius:4px;font-weight:700;margin-bottom:4px">${label} ${v.route_short_name}</span>
        <br/>${v.headsign}
        <br/><span style="opacity:0.5;font-size:11px">${v.id} · ${v.speed} km/h</span>
      </div>`

      let marker: L.Marker | L.CircleMarker
      if (useDetailed) {
        if (!v.route_short_name) continue
        marker = L.marker(latlng, { icon: vehicleIcon(v.bearing ?? 0, v.route_type ?? 3, v.route_short_name) })
      } else {
        marker = L.circleMarker(latlng, {
          radius: 5,
          fillColor: color,
          fillOpacity: 0.95,
          color: color,
          opacity: 0,
          weight: 0
        })
      }
      marker.bindPopup(popupHtml)
      if (onVehicleSelect) marker.on('click', () => onVehicleSelect(v))
      marker.addTo(group)
    }

    group.addTo(map)
  }, [vehicles, map, revision])

  return null
}
