import cors from '@elysiajs/cors'
import { Elysia } from 'elysia'
import { config } from './config'
import { fetchStaticGtfs } from './gtfs/static'
import { rampRoutes } from './routes/ramp'
import { realtimeRoutes } from './routes/realtime'
import { routesRoutes } from './routes/routes'
import { stopsRoutes } from './routes/stops'
import { startProximityChecker } from './services/ramp-proximity'
import { setGtfs } from './state'
import { swaggerPlugin } from './swagger'

async function initGtfs() {
  try {
    startProximityChecker()
    setGtfs(await fetchStaticGtfs())
  } catch (e) {
    console.error('Failed to load GTFS static data:', e)
  }
}

const app = new Elysia()
  .use(swaggerPlugin)
  .use(cors())
  .use(stopsRoutes)
  .use(routesRoutes)
  .use(realtimeRoutes)
  .use(rampRoutes)
  .get('/health', () => 'Ok')

await initGtfs()
setInterval(initGtfs, config.gtfs.refreshInterval)

app.listen(config.port)

console.log(`GTFS server running at http://localhost:${app.server?.port}`)
