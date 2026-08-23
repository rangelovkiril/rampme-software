import { consola } from 'consola'
import { startBroker } from './broker'
import { config } from './config'
import { controlApp } from './control'

await startBroker(config.mqttPort)

controlApp.listen(config.httpPort)
consola.ready(`hw-sim control API running at http://localhost:${config.httpPort}`)
