import { Elysia } from "elysia";
import { config } from "./config";
import { swaggerPlugin } from "./swagger";
import { fetchStaticGtfs } from "./gtfs/static";
import {
  fetchAlerts,
  fetchTripUpdates,
  fetchVehiclePositions,
} from "./gtfs/realtime";
import type { GtfsData } from "./gtfs/types";

let gtfs: GtfsData;

async function initGtfs() {
  gtfs = await fetchStaticGtfs();
}

const app = new Elysia()
  .use(swaggerPlugin)

  // ── Stops ───────────────────────────────────────
  .get("/stops", () => [...gtfs.stops.values()], {
    detail: { tags: ["Stops"], summary: "Всички спирки" },
  })

  .get(
    "/stops/:id",
    ({ params: { id } }) => {
      const stop = gtfs.stops.get(id);
      if (!stop) return new Response("Not found", { status: 404 });
      return stop;
    },
    {
      detail: { tags: ["Stops"], summary: "Спирка по ID" },
    },
  )

  // ── Routes ──────────────────────────────────────
  .get("/routes", () => [...gtfs.routes.values()], {
    detail: { tags: ["Routes"], summary: "Всички маршрути" },
  })

  .get(
    "/routes/:id",
    ({ params: { id } }) => {
      const route = gtfs.routes.get(id);
      if (!route) return new Response("Not found", { status: 404 });

      const routeTrips = [...gtfs.trips.values()].filter(
        (t) => t.route_id === id,
      );
      const tripIds = new Set(routeTrips.map((t) => t.trip_id));
      const stopIds = new Set(
        gtfs.stopTimes
          .filter((st) => tripIds.has(st.trip_id))
          .map((st) => st.stop_id),
      );
      const stops = [...stopIds]
        .map((sid) => gtfs.stops.get(sid))
        .filter(Boolean);

      return { ...route, trips: routeTrips.length, stops };
    },
    {
      detail: { tags: ["Routes"], summary: "Маршрут по ID с trips и спирки" },
    },
  )

  // ── Realtime ────────────────────────────────────
  .get(
    "/realtime/alerts",
    async () => {
      try {
        return await fetchAlerts();
      } catch (e) {
        return new Response(`Alerts unavailable: ${e}`, { status: 502 });
      }
    },
    {
      detail: { tags: ["Realtime"], summary: "Service alerts" },
    },
  )

  .get(
    "/realtime/trip-updates",
    async () => {
      try {
        return await fetchTripUpdates();
      } catch (e) {
        return new Response(`Trip updates unavailable: ${e}`, { status: 502 });
      }
    },
    {
      detail: { tags: ["Realtime"], summary: "Trip updates" },
    },
  )

  .get(
    "/realtime/vehicles",
    async () => {
      try {
        return await fetchVehiclePositions();
      } catch (e) {
        return new Response(`Vehicle positions unavailable: ${e}`, {
          status: 502,
        });
      }
    },
    {
      detail: { tags: ["Realtime"], summary: "Vehicle positions" },
    },
  )

  .listen(config.port);

// Startup
await initGtfs();
setInterval(initGtfs, config.gtfs.refreshInterval);

console.log(`🚌 GTFS server running at http://localhost:${app.server?.port}`);
