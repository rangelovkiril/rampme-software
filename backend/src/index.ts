import cors from "@elysiajs/cors";
import { Elysia } from "elysia";
import { config } from "./config";
import { fetchStaticGtfs } from "./gtfs/static";
import { realtimeRoutes } from "./routes/realtime";
import { routesRoutes } from "./routes/routes";
import { stopsRoutes } from "./routes/stops";
import { setGtfs } from "./state";
import { swaggerPlugin } from "./swagger";
import { rampRoutes } from "./routes/ramp";
import { mockRoutes } from "./routes/mock";
import { startProximityChecker } from "./services/ramp-proximity";

async function initGtfs() {
  try {
    startProximityChecker();
    setGtfs(await fetchStaticGtfs());
  } catch (e) {
    console.error("Failed to load GTFS static data:", e);
  }
}

const app = new Elysia()
  .use(swaggerPlugin)
  .use(cors())
  .use(stopsRoutes)
  .use(routesRoutes)
  .use(realtimeRoutes)
  .use(rampRoutes)
  .use(mockRoutes)
  .get("/health", () => "Ok");

await initGtfs();
setInterval(initGtfs, config.gtfs.refreshInterval);

app.listen(config.port);

console.log(`GTFS server running at http://localhost:${app.server?.port}`);
