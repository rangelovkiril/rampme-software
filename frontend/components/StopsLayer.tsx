'use client'

import L from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'

interface Stop {
  stop_id: string
  stop_name: string
  stop_lat: number
  stop_lon: number
}

const MIN_ZOOM_FOR_STOPS = 14

function createStopIcon() {
  return L.divIcon({
    className: '',
    html: '<div style="width:10px;height:10px;border-radius:50%;background:#3b82f6;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>',
    iconSize: [10, 10],
    iconAnchor: [5, 5]
  })
}

function isValidCoord(s: Stop) {
  return (
    Number.isFinite(s.stop_lat) &&
    Number.isFinite(s.stop_lon) &&
    s.stop_lat !== 0 &&
    s.stop_lon !== 0
  )
}

export default function StopsLayer() {
  const map = useMap()
  const [stops, setStops] = useState<Stop[]>([])
  const groupRef = useRef<L.LayerGroup | null>(null)
  const [_revision, setRevision] = useState(0)
  const iconRef = useRef<L.DivIcon | null>(null)

  // Fetch stops once
  useEffect(() => {
    fetch('/api/stops')
      .then(r => r.json())
      .then((data: Stop[]) => setStops(data.filter(isValidCoord)))
      .catch(() => {})
  }, [])

  // Track zoom + move
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

  // Render markers
  useEffect(() => {
    if (!groupRef.current) {
      groupRef.current = L.layerGroup()
    }
    const group = groupRef.current
    group.clearLayers()

    const zoom = map.getZoom()
    if (zoom < MIN_ZOOM_FOR_STOPS || stops.length === 0) {
      group.remove()
      return
    }

    if (!iconRef.current) {
      iconRef.current = createStopIcon()
    }

    const bounds = map.getBounds()

    for (const stop of stops) {
      const latlng = L.latLng(stop.stop_lat, stop.stop_lon)
      if (!bounds.contains(latlng)) continue

      L.marker(latlng, { icon: iconRef.current })
        .bindPopup(
          `<div style="font-family:Inter,sans-serif;font-size:13px"><strong>${stop.stop_name}</strong><br/><span style="opacity:0.6">${stop.stop_id}</span></div>`
        )
        .addTo(group)
    }

    group.addTo(map)
  }, [stops, map])

  return null
}
