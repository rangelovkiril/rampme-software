import cors from '@elysiajs/cors'
import { Elysia } from 'elysia'
import { config } from './config'
import { fetchStaticGtfs } from './gtfs/static'
import { initMqtt } from './mqtt'
import { rampRoutes } from './routes/ramp'
import { realtimeRoutes } from './routes/realtime'
import { routesRoutes } from './routes/routes'
import { stopsRoutes } from './routes/stops'
import { resyncAllReservations, subscribeToHardwareStates } from './services/ramp-mqtt'
import { startProximityChecker } from './services/ramp-proximity'
import { setGtfs } from './state'
import { swaggerPlugin } from './swagger'

async function initGtfs() {
  try {
    setGtfs(await fetchStaticGtfs())
  } catch (e) {
    console.error('Failed to load GTFS static data:', e)
  }
}

// MQTT first — so reservation routes and proximity have a live publisher
await initMqtt(config.mqtt.url, {
  username: config.mqtt.username,
  password: config.mqtt.password,
  clientId: config.mqtt.clientId,
})
subscribeToHardwareStates()
resyncAllReservations()

startProximityChecker()

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
