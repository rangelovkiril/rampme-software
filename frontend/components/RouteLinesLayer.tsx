'use client'

import L from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'

interface RouteShape {
  route_type: number
  polylines: [number, number][][]
}

const ROUTE_COLORS: Record<number, string> = {
  0: '#F7941D',   // tram
  1: '#9B59B6',   // metro
  3: '#BE1E2D',   // bus
  11: '#27AAE1',  // trolleybus
}

const DEFAULT_COLOR = '#BE1E2D'

interface RouteLinesLayerProps {
  routeId: string | null
  routeType: number | null
}

export default function RouteLinesLayer({ routeId, routeType }: RouteLinesLayerProps) {
  const map = useMap()
  const groupRef = useRef<L.LayerGroup | null>(null)
  const cacheRef = useRef<Map<string, RouteShape>>(new Map())
  const [shape, setShape] = useState<RouteShape | null>(null)

  // Fetch shape when routeId changes
  useEffect(() => {
    if (!routeId) {
      setShape(null)
      return
    }

    const cached = cacheRef.current.get(routeId)
    if (cached) {
      setShape(cached)
      return
    }

    let cancelled = false

    async function fetchShape() {
      try {
        const res = await fetch(`/api/routes/shapes?ids=${routeId}`)
        if (!res.ok || cancelled) return
        const data: Record<string, RouteShape> = await res.json()
        const s = data[routeId!]
        if (s) {
          cacheRef.current.set(routeId!, s)
          if (!cancelled) setShape(s)
        } else {
          if (!cancelled) setShape(null)
        }
      } catch { /* ignore */ }
    }

    fetchShape()
    return () => { cancelled = true }
  }, [routeId])

  // Draw polylines on the map
  useEffect(() => {
    if (!groupRef.current) {
      groupRef.current = L.layerGroup()
    }
    const group = groupRef.current
    group.clearLayers()

    if (!shape || shape.polylines.length === 0) {
      group.remove()
      return
    }

    const color = ROUTE_COLORS[routeType ?? shape.route_type] ?? DEFAULT_COLOR

    for (const polyline of shape.polylines) {
      if (polyline.length < 2) continue
      L.polyline(polyline as L.LatLngExpression[], {
        color,
        weight: 4,
        opacity: 0.8,
        smoothFactor: 1,
      }).addTo(group)
    }

    group.addTo(map)
  }, [shape, routeType, map])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (groupRef.current) {
        groupRef.current.clearLayers()
        groupRef.current.remove()
      }
    }
  }, [])

  return null
}
