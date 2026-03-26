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

const MIN_ZOOM_FOR_STOPS = 16

/**
 * Create a small circular blue Leaflet divIcon for stop markers.
 *
 * @returns A Leaflet `divIcon` styled as a 10×10 blue circle with a white border and drop shadow; `iconSize` is [10, 10] and `iconAnchor` is [5, 5].
 */
function createStopIcon() {
  return L.divIcon({
    className: '',
    html: '<div style="width:10px;height:10px;border-radius:50%;background:#3b82f6;border:2px solid #fff;box-shadow:0 1px 4px rgba(0,0,0,0.3)"></div>',
    iconSize: [10, 10],
    iconAnchor: [5, 5]
  })
}

/**
 * Check whether a stop has valid, non-zero latitude and longitude.
 *
 * @param s - The stop whose coordinates will be validated
 * @returns `true` if both `stop_lat` and `stop_lon` are finite numbers and not zero, `false` otherwise
 */
function isValidCoord(s: Stop) {
  return (
    Number.isFinite(s.stop_lat) &&
    Number.isFinite(s.stop_lon) &&
    s.stop_lat !== 0 &&
    s.stop_lon !== 0
  )
}

/**
 * Render Leaflet markers for transit stops on the current map.
 *
 * Fetches stop data from `/api/stops` once on mount and filters out invalid coordinates.
 * Subscribes to the map's zoom and move events to refresh visible markers.
 * Uses a cached LayerGroup and DivIcon; markers are shown only when the map zoom is at least
 * MIN_ZOOM_FOR_STOPS and the stop's coordinate falls inside the current map bounds.
 * Each marker includes a popup showing the stop name and stop ID.
 *
 * @returns Null — the component does not render React DOM; it manages Leaflet layers directly.
 */
export default function StopsLayer() {
  const map = useMap()
  const [stops, setStops] = useState<Stop[]>([])
  const groupRef = useRef<L.LayerGroup | null>(null)
  const [revision, setRevision] = useState(0)
  const iconRef = useRef<L.DivIcon | null>(null)

  // Fetch stops once
  useEffect(() => {
    fetch('/api/stops')
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Stop[]) => setStops((Array.isArray(data) ? data : []).filter(isValidCoord)))
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
  }, [stops, map, revision])

  return null
}
