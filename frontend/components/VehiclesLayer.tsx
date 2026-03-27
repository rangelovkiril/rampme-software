"use client";

import L from "leaflet";
import { useEffect, useRef, useState } from "react";
import { useMap } from "react-leaflet";
import type { Vehicle } from "@/lib/types";
import {
  ROUTE_TYPE_CONFIG,
  DEFAULT_ROUTE_COLOR,
  getRouteColor,
} from "@/lib/transit";

const MIN_ZOOM = 10;
const DETAIL_ZOOM = 16;
const POLL_INTERVAL = 5_000;

function vehicleIcon(bearing: number, routeType: number, routeName: string) {
  const color = getRouteColor(routeType);
  return L.divIcon({
    className: "",
    html: `<div style="display:flex;flex-direction:column;align-items:center;transform:translate(-50%,-50%)">
      <div style="background:${color};color:#fff;font-family:Inter,sans-serif;font-size:10px;font-weight:700;padding:1px 5px;border-radius:4px;white-space:nowrap;line-height:16px;text-align:center;box-shadow:0 1px 4px rgba(0,0,0,0.3)">${routeName}</div>
      <div style="width:24px;height:24px;display:flex;align-items:center;justify-content:center;transform:rotate(${bearing}deg)">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="${color}" stroke="#fff" stroke-width="0.8">
          <path d="M5 11V7a7 7 0 0 1 14 0v4"/>
          <rect x="3" y="11" width="18" height="8" rx="2"/>
          <circle cx="7.5" cy="21.5" r="1.5"/>
          <circle cx="16.5" cy="21.5" r="1.5"/>
        </svg>
      </div>
    </div>`,
    iconSize: [40, 44],
    iconAnchor: [20, 22],
  });
}

interface VehiclesLayerProps {
  onVehicleSelect?: (vehicle: Vehicle) => void;
}

export default function VehiclesLayer({ onVehicleSelect }: VehiclesLayerProps) {
  const map = useMap();
  const groupRef = useRef<L.LayerGroup | null>(null);
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    let active = true;
    async function poll() {
      try {
        const res = await fetch("/api/realtime/vehicles");
        if (!res.ok || !active) return;
        const data = await res.json();
        if (active) setVehicles(Array.isArray(data) ? data : []);
      } catch {
        /* retry next interval */
      }
    }
    poll();
    const id = setInterval(poll, POLL_INTERVAL);
    return () => {
      active = false;
      clearInterval(id);
    };
  }, []);

  useEffect(() => {
    function update() {
      setRevision((r) => r + 1);
    }
    map.on("zoomend", update);
    map.on("moveend", update);
    return () => {
      map.off("zoomend", update);
      map.off("moveend", update);
    };
  }, [map]);

  useEffect(() => {
    if (!groupRef.current) groupRef.current = L.layerGroup();
    const group = groupRef.current;
    group.clearLayers();

    const zoom = map.getZoom();
    if (zoom < MIN_ZOOM || vehicles.length === 0) {
      group.remove();
      return;
    }

    const bounds = map.getBounds();
    const useDetailed = zoom >= DETAIL_ZOOM;

    for (const v of vehicles) {
      if (!Number.isFinite(v.lat) || !Number.isFinite(v.lng)) continue;

      const latlng = L.latLng(v.lat, v.lng);
      if (!bounds.contains(latlng)) continue;

      const color = getRouteColor(v.route_type);
      const label = ROUTE_TYPE_CONFIG[v.route_type]?.label ?? "Автобус";

      const popupHtml = `<div style="font-family:Inter,sans-serif;font-size:13px">
        <span style="display:inline-block;background:${color};color:#fff;padding:2px 8px;border-radius:4px;font-weight:700;margin-bottom:4px">${label} ${v.route_short_name}</span>
        <br/>${v.headsign}
        <br/><span style="opacity:0.5;font-size:11px">${v.id} · ${v.speed} km/h</span>
      </div>`;

      let marker: L.Marker | L.CircleMarker;
      if (useDetailed) {
        marker = L.marker(latlng, {
          icon: vehicleIcon(v.bearing ?? 0, v.route_type, v.route_short_name),
        });
      } else {
        marker = L.circleMarker(latlng, {
          radius: 5,
          fillColor: color,
          fillOpacity: 0.95,
          color: "#ffffff",
          opacity: 0.95,
          weight: 1,
        });
      }
      marker.bindPopup(popupHtml);
      if (onVehicleSelect) marker.on("click", () => onVehicleSelect(v));
      marker.addTo(group);
    }

    group.addTo(map);
  }, [vehicles, map, revision]);

  return null;
}
