'use client'

import type { EnrichedVehicle as Vehicle } from '@backend/schemas'
import L from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'
import { getRouteColor, getRouteLabel } from '@/lib/transit'
import { getVehicleAccessibility } from '@/lib/vehicle-accessibility'

const MIN_ZOOM = 10
const DETAIL_ZOOM = 16

// Ring around the marker: green = confirmed ramp-equipped, gray = confirmed
// not equipped, none (transparent) = unknown — so "we don't know" never
// looks like either answer. See openspec/specs/ramp/vehicle-accessibility's
// "Map shows accessibility at a glance" requirement.
function accessibilityRingColor(rampStatus: Vehicle['rampStatus']): string {
  if (rampStatus === 'working' || rampStatus === 'in_use') return '#22c55e'
  if (rampStatus === 'no_ramp') return '#6b7280'
  return 'transparent'
}

function accessibilityBorderStyle(rampStatus: Vehicle['rampStatus']): string {
  if (rampStatus === 'working' || rampStatus === 'in_use') return 'solid'
  if (rampStatus === 'no_ramp') return 'dashed'
  return 'dotted'
}

function vehicleIcon(
  _bearing: number,
  routeType: number | null | undefined,
  routeName: string,
  rampStatus: Vehicle['rampStatus'],
) {
  const color = getRouteColor(routeType)
  const ring = accessibilityRingColor(rampStatus)
  const borderStyle = accessibilityBorderStyle(rampStatus)
  return L.divIcon({
    className: '',
    html: `<div style="position:absolute;transform:translate(-50%,-50%);display:flex;align-items:center;gap:4px;white-space:nowrap;font-family:Inter,sans-serif">
      <span style="display:grid;place-items:center;width:27px;height:27px;background:${color};color:#fff;border-radius:50%;border:2px ${borderStyle} ${ring};box-shadow:0 2px 6px rgba(0,0,0,0.4)">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="3" width="16" height="14" rx="2"/><path d="M4 10h16M7 20v-3M17 20v-3M7 7h.01M17 7h.01"/></svg>
      </span>
      <span style="background:rgba(255,255,255,0.95);color:#111827;font-size:11px;font-weight:800;padding:3px 6px;border-radius:999px;box-shadow:0 1px 4px rgba(0,0,0,0.3)">${routeName}</span>
    </div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}

function vehicleDotIcon(routeType: number | null | undefined, rampStatus: Vehicle['rampStatus']) {
  const color = getRouteColor(routeType)
  const ring = accessibilityRingColor(rampStatus)
  const borderStyle = accessibilityBorderStyle(rampStatus)
  return L.divIcon({
    className: '',
    html: `<div style="width:10px;height:10px;border-radius:50%;background:${color};border:2px ${borderStyle} ${ring};box-shadow:0 1px 4px rgba(0,0,0,0.5);transform:translate(-50%,-50%)"></div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}

interface VehiclesLayerProps {
  vehicles: Vehicle[]
  onVehicleSelect?: (vehicle: Vehicle) => void
  selectedVehicleId?: string | null
}

export default function VehiclesLayer({
  vehicles,
  onVehicleSelect,
  selectedVehicleId,
}: VehiclesLayerProps) {
  const map = useMap()
  const groupRef = useRef<L.LayerGroup | null>(null)
  const [revision, setRevision] = useState(0)
  const prevSelectedRef = useRef<string | null>(null)

  useEffect(() => {
    function update() {
      setRevision((r) => r + 1)
    }
    map.on('zoomend', update)
    map.on('moveend', update)
    return () => {
      map.off('zoomend', update)
      map.off('moveend', update)
    }
  }, [map])

  // Fly to vehicle on first selection (zoom ≥ 15); just pan on subsequent position updates
  useEffect(() => {
    if (!selectedVehicleId) {
      prevSelectedRef.current = null
      return
    }
    const v = vehicles.find((v) => v.id === selectedVehicleId)
    if (!v || !Number.isFinite(v.lat) || !Number.isFinite(v.lng)) return
    const isNewSelection = prevSelectedRef.current !== selectedVehicleId
    prevSelectedRef.current = selectedVehicleId
    if (isNewSelection) {
      map.flyTo([v.lat, v.lng], Math.max(map.getZoom(), 16), {
        animate: true,
        duration: 0.8,
      })
    } else {
      map.panTo([v.lat, v.lng], { animate: true, duration: 0.8 })
    }
  }, [vehicles, selectedVehicleId, map])

  // Viewport culling reads map.getBounds() and map.getZoom(), which are not reactive.
  // The revision counter bumped on zoomend/moveend is what re-runs this effect.
  // biome-ignore lint/correctness/useExhaustiveDependencies: deliberate.
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

      const color = getRouteColor(v.routeType)
      const label = getRouteLabel(v.routeType)
      const displayName = v.routeShortName ?? v.label ?? v.id
      const titleLabel = v.routeShortName ? `${label} ${v.routeShortName}` : displayName
      const headsign = v.headsign ?? ''
      const ramp = getVehicleAccessibility(v.rampStatus)

      const popupHtml = `<div style="font-family:Inter,sans-serif;font-size:13px">
        <span style="display:inline-block;background:${color};color:#fff;padding:2px 8px;border-radius:4px;font-weight:700;margin-bottom:4px">${titleLabel}</span>
        ${headsign ? `<br/>${headsign}` : ''}
        <br/><span style="opacity:0.5;font-size:11px">${v.id} · ${v.speed} km/h</span>
        <br/><span style="color:${ramp.color};font-size:11px;font-weight:600">${ramp.text}</span>
      </div>`

      const icon = useDetailed
        ? vehicleIcon(v.bearing ?? 0, v.routeType, displayName, v.rampStatus)
        : vehicleDotIcon(v.routeType, v.rampStatus)
      const marker = L.marker(latlng, {
        icon,
        zIndexOffset: 1000,
        title: `${titleLabel}${headsign ? ` · ${headsign}` : ''} · ${ramp.text}`,
      })
      marker.bindPopup(popupHtml)
      if (onVehicleSelect) marker.on('click', () => onVehicleSelect(v))
      marker.addTo(group)
    }

    group.addTo(map)
  }, [vehicles, map, revision, onVehicleSelect])

  return null
}
