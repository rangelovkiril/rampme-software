import cors from '@elysiajs/cors'
import { consola } from 'consola'
import { Elysia } from 'elysia'
import { config } from './config'
import { swaggerPlugin } from './config/swagger'
import { getRampDb, initRampDb } from './db/ramp'
import { initAccessibility } from './gtfs/accessibility'
import { fetchVehiclePositions } from './gtfs/realtime'
import { fetchStaticGtfs } from './gtfs/static'
import { errorHandling } from './plugins/errors'
import { rampRoutes } from './routes/ramp'
import { realtimeRoutes } from './routes/realtime'
import { stopsRoutes } from './routes/stops'
import { transitRoutes } from './routes/transit'
import { initMqtt } from './services/mqtt'
import { getRampBridge, initRampBridge, isRampBridgeAvailable } from './services/ramp/bridge'
import { createProximityChecker } from './services/ramp/proximity'
import { getGtfs, setGtfs } from './services/state'

async function initGtfs() {
  try {
    setGtfs(await fetchStaticGtfs())
  } catch (e) {
    consola.error('Failed to load GTFS static data:', e)
  }
}

initRampDb(config.ramp.dbPath)
initAccessibility(config.ramp.accessibility.dataPath, config.ramp.accessibility.refreshMs)

createProximityChecker(
  () => (isRampBridgeAvailable() ? getRampBridge() : null),
  getGtfs,
  getRampDb(),
  fetchVehiclePositions,
).start()

const app = new Elysia()
  .use(errorHandling)
  .use(swaggerPlugin)
  .use(
    cors({
      origin: [
        'https://rampme.site',
        /^https:\/\/[\w-]+\.rampme\.pages\.dev$/, // Pages preview deployments
        /^http:\/\/localhost:\d+$/, // local dev without the rewrite proxy
      ],
      methods: ['GET', 'POST', 'DELETE'],
      allowedHeaders: ['Content-Type', 'X-Session-Id'],
    }),
  )
  .use(stopsRoutes)
  .use(transitRoutes)
  .use(realtimeRoutes)
  .use(rampRoutes)
  .get('/health', () => 'Ok')

/**
 * The frontend derives every request and response type from this through Eden.
 * Exported as a type only — importing it does not start a server.
 */
export type App = typeof app

app.listen(config.port)
consola.ready(`GTFS server running at http://localhost:${app.server?.port}`)

await initGtfs()
setInterval(initGtfs, config.gtfs.refreshInterval)

// Only invoked at construction before this, so the table grew until a restart.
setInterval(() => {
  const removed = getRampDb().cleanupOldReservations()
  if (removed > 0) consola.info(`swept ${removed} reservation(s) older than 24h`)
}, config.ramp.cleanupIntervalMs)

if (!config.mqtt) {
  consola.warn('MQTT_URL not set — skipping MQTT')
} else {
  initMqtt(config.mqtt.url, {
    username: config.mqtt.username,
    password: config.mqtt.password,
    clientId: config.mqtt.clientId,
    keepalive: 30,
    clean: true,
  })
    .then((mqtt) => {
      const bridge = initRampBridge(mqtt)
      bridge.subscribeToHardwareStates()
      bridge.resyncAllReservations()
    })
    .catch((e) => consola.error('MQTT init failed:', e))
}
