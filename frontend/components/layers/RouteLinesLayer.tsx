'use client'

import L from 'leaflet'
import { useEffect, useRef, useState } from 'react'
import { useMap } from 'react-leaflet'
import { getRouteColor } from '@/lib/transit'

interface RouteShape {
  route_type: number
  polylines: [number, number][][]
}

interface RouteLinesLayerProps {
  routeId: string | null
  routeType: number | null
}

export default function RouteLinesLayer({ routeId, routeType }: RouteLinesLayerProps) {
  const map = useMap()
  const groupRef = useRef<L.LayerGroup | null>(null)
  const cacheRef = useRef<Map<string, RouteShape>>(new Map())
  const [shape, setShape] = useState<RouteShape | null>(null)

  useEffect(() => {
    if (!routeId) { setShape(null); return }

    const cached = cacheRef.current.get(routeId)
    if (cached) { setShape(cached); return }

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

  useEffect(() => {
    if (!groupRef.current) groupRef.current = L.layerGroup()
    const group = groupRef.current
    group.clearLayers()

    if (!shape || shape.polylines.length === 0) { group.remove(); return }

    const color = getRouteColor(routeType ?? shape.route_type)

    for (const polyline of shape.polylines) {
      if (polyline.length < 2) continue
      L.polyline(polyline as L.LatLngExpression[], {
        color, weight: 4, opacity: 0.8, smoothFactor: 1,
      }).addTo(group)
    }

    group.addTo(map)
    const allPoints: L.LatLngExpression[] = shape.polylines.flat() as L.LatLngExpression[]
    if (allPoints.length > 0) {
      const bounds = L.latLngBounds(allPoints)
      if (bounds.isValid()) map.fitBounds(bounds, { padding: [48, 48] })
    }
  }, [shape, routeType, map])

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
