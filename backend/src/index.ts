import cors from '@elysiajs/cors'
import { Elysia } from 'elysia'
import { config } from './config'
import { swaggerPlugin } from './config/swagger'
import { fetchStaticGtfs } from './gtfs/static'
import { rampRoutes } from './routes/ramp'
import { realtimeRoutes } from './routes/realtime'
import { stopsRoutes } from './routes/stops'
import { transitRoutes } from './routes/transit'
import { initMqtt } from './services/mqtt'
import { resyncAllReservations, subscribeToHardwareStates } from './services/ramp/bridge'
import { startProximityChecker } from './services/ramp/proximity'
import { setGtfs } from './services/state'

async function initGtfs() {
  try {
    setGtfs(await fetchStaticGtfs())
  } catch (e) {
    console.error('Failed to load GTFS static data:', e)
  }
}

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
  .use(transitRoutes)
  .use(realtimeRoutes)
  .use(rampRoutes)
  .get('/health', () => 'Ok')

app.listen(config.port)

await initGtfs()
setInterval(initGtfs, config.gtfs.refreshInterval)

console.log(`GTFS server running at http://localhost:${app.server?.port}`)
