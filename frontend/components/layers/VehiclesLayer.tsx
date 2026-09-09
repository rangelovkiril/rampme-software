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
  routeType: number | null | undefined,
  routeName: string,
  rampStatus: Vehicle['rampStatus'],
  selected: boolean,
) {
  const color = getRouteColor(routeType)
  const ring = accessibilityRingColor(rampStatus)
  const borderStyle = accessibilityBorderStyle(rampStatus)
  const glyph =
    routeType === 0
      ? '<path d="M4 5h16v11H4zM4 9h16M8 19v-3M16 19v-3"/>'
      : routeType === 11
        ? '<path d="M5 4h14v13H5zM5 9h14M8 20v-3M16 20v-3M8 7h.01M16 7h.01"/>'
        : '<rect x="4" y="3" width="16" height="14" rx="2"/><path d="M4 10h16M7 20v-3M17 20v-3M7 7h.01M17 7h.01"/>'
  const emphasis = selected ? '0 0 0 4px rgba(59,130,246,0.35),' : ''
  return L.divIcon({
    className: '',
    html: `<div style="position:absolute;transform:translate(-50%,-50%);display:flex;align-items:center;gap:4px;white-space:nowrap;font-family:Inter,sans-serif">
      <span style="display:grid;place-items:center;width:27px;height:27px;background:${color};color:#fff;border-radius:50%;border:2px ${borderStyle} ${ring};box-shadow:${emphasis}0 2px 6px rgba(0,0,0,0.4)">
        <svg aria-hidden="true" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${glyph}</svg>
      </span>
      <span style="background:rgba(255,255,255,0.95);color:#111827;font-size:11px;font-weight:800;padding:3px 6px;border-radius:999px;box-shadow:0 1px 4px rgba(0,0,0,0.3)">${routeName}</span>
    </div>`,
    iconSize: [0, 0],
    iconAnchor: [0, 0],
  })
}

function vehicleDotIcon(
  routeType: number | null | undefined,
  rampStatus: Vehicle['rampStatus'],
  selected: boolean,
) {
  const color = getRouteColor(routeType)
  const ring = accessibilityRingColor(rampStatus)
  const borderStyle = accessibilityBorderStyle(rampStatus)
  return L.divIcon({
    className: '',
    html: `<div style="width:${selected ? 14 : 10}px;height:${selected ? 14 : 10}px;border-radius:50%;background:${color};border:2px ${borderStyle} ${ring};box-shadow:${selected ? '0 0 0 4px rgba(59,130,246,0.35),' : ''}0 1px 4px rgba(0,0,0,0.5);transform:translate(-50%,-50%)"></div>`,
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
      const point = map.project(latlng, zoom)
      const nearby = vehicles.filter((other) => {
        if (other.id === v.id || !Number.isFinite(other.lat) || !Number.isFinite(other.lng))
          return false
        const otherPoint = map.project([other.lat, other.lng], zoom)
        return point.distanceTo(otherPoint) <= 16
      })
      const nearbySummary =
        nearby.length > 0
          ? `<br/><span style="display:block;margin-top:6px;font-size:11px;opacity:0.7">Още на това място: ${nearby.map((other) => `${getRouteLabel(other.routeType)} ${other.routeShortName ?? other.id}`).join(' · ')}</span>`
          : ''

      const popupHtml = `<div style="font-family:Inter,sans-serif;font-size:13px">
        <span style="display:inline-block;background:${color};color:#fff;padding:2px 8px;border-radius:4px;font-weight:700;margin-bottom:4px">${titleLabel}</span>
        ${headsign ? `<br/>${headsign}` : ''}
        <br/><span style="opacity:0.5;font-size:11px">${v.id} · ${v.speed} km/h</span>
        <br/><span style="color:${ramp.color};font-size:11px;font-weight:600">${ramp.text}</span>
        ${nearbySummary}
      </div>`

      const icon = useDetailed
        ? vehicleIcon(v.routeType, displayName, v.rampStatus, v.id === selectedVehicleId)
        : vehicleDotIcon(v.routeType, v.rampStatus, v.id === selectedVehicleId)
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
