'use client'

import L from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'
import type { Stop } from '@/lib/types'

const MIN_ZOOM_FOR_STOPS = 15

function createStopIcon(selected = false) {
  const signBg = selected ? '#2563eb' : '#1e40af'
  const poleBg = selected ? '#2563eb' : '#4b5563'
  const glow = selected
    ? '0 0 0 3px rgba(59,130,246,0.35),0 2px 8px rgba(0,0,0,0.5)'
    : '0 1px 4px rgba(0,0,0,0.5)'
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;flex-direction:column;align-items:center;width:20px;height:29px">
      <div style="background:${signBg};border-radius:3px;width:18px;height:13px;display:flex;align-items:center;justify-content:center;box-shadow:${glow};flex-shrink:0">
        <span style="color:#fff;font-size:9px;font-weight:900;font-family:sans-serif;line-height:1">H</span>
      </div>
      <div style="width:2px;flex:1;background:${poleBg}"></div>
      <div style="width:5px;height:5px;border-radius:50%;background:${poleBg};flex-shrink:0"></div>
    </div>`,
    iconSize: [20, 29],
    iconAnchor: [10, 29],
  })
}

function hasValidCoords(s: Stop) {
  return (
    Number.isFinite(s.stop_lat) &&
    Number.isFinite(s.stop_lon) &&
    s.stop_lat !== 0 &&
    s.stop_lon !== 0
  )
}

interface StopsLayerProps {
  selectedStopId?: string | null
  onStopSelect?: (stop: Stop | null) => void
}

export default function StopsLayer({ selectedStopId = null, onStopSelect }: StopsLayerProps) {
  const map = useMap()
  const [stops, setStops] = useState<Stop[]>([])
  const groupRef = useRef<L.LayerGroup | null>(null)
  const [revision, setRevision] = useState(0)
  const iconRef = useRef<L.DivIcon | null>(null)
  const selectedIconRef = useRef<L.DivIcon | null>(null)

  useEffect(() => {
    fetch('/api/stops')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Stop[]) => setStops((Array.isArray(data) ? data : []).filter(hasValidCoords)))
      .catch(() => {})
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

  useEffect(() => {
    if (!onStopSelect) return
    function closeSelectedStop() { onStopSelect?.(null) }
    map.on('click', closeSelectedStop)
    return () => { map.off('click', closeSelectedStop) }
  }, [map, onStopSelect])

  useEffect(() => {
    if (!groupRef.current) groupRef.current = L.layerGroup()
    const group = groupRef.current
    group.clearLayers()

    const zoom = map.getZoom()
    if (zoom < MIN_ZOOM_FOR_STOPS || stops.length === 0) {
      group.remove()
      return
    }

    if (!iconRef.current) iconRef.current = createStopIcon()
    if (!selectedIconRef.current) selectedIconRef.current = createStopIcon(true)

    const bounds = map.getBounds()

    for (const stop of stops) {
      const latlng = L.latLng(stop.stop_lat, stop.stop_lon)
      if (!bounds.contains(latlng)) continue

      const marker = L.marker(latlng, {
        icon: selectedStopId === stop.stop_id ? selectedIconRef.current : iconRef.current,
        riseOnHover: true,
        bubblingMouseEvents: false
      })
      marker.on('click', () => onStopSelect?.(stop))
      marker.addTo(group)
    }

    group.addTo(map)
  }, [stops, map, revision, selectedStopId, onStopSelect])

  return null
}
