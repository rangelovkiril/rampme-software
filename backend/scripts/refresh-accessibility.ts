/**
 * Rebuilds the vehicle wheelchair-ramp accessibility reference dataset
 * (see openspec/changes/ramp-vehicle-accessibility) by crawling trinmo.org's
 * fleet registry — an undocumented, unauthenticated internal API of a transit
 * enthusiast site, not an official contract. Run out-of-band on a schedule
 * (the `fleet` repo's CronJob); never called from the request path.
 *
 * Usage: bun run scripts/refresh-accessibility.ts [output-path]
 * Defaults to config.rampAccessibility.dataPath, same as the runtime loader
 * reads from, so a local run and the CronJob write to the same place.
 */

import { mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { Value } from '@sinclair/typebox/value'
import { consola } from 'consola'
import { config } from '../src/config'
import {
  type AccessibilitySighting,
  buildAccessibilityTable,
  type ModelAccessibility,
} from '../src/gtfs/accessibility-table'
import modelAccessibilityJson from '../src/gtfs/model-accessibility.json'
import type { VehicleAccessibilityType } from '../src/gtfs/types'
import {
  FleetListResponseSchema,
  ModelDetailResponseSchema,
  TRINMO_BASE_URL,
} from './trinmo-schemas'

const log = consola.withTag('refresh-accessibility')

// trinmo.org's own status code for "currently in service" on a fleet-list row
// (distinct from the free-text status.name used on individual sightings).
const ACTIVE_FLEET_LIST_STATUS = 21

const VEHICLE_TYPES: VehicleAccessibilityType[] = ['BUS', 'TRAM', 'TROLLEY']

const FETCH_TIMEOUT_MS = 20_000
// Polite pacing between the ~50 model-detail requests — well under trinmo's
// own 500/min rate limit, but there's no reason to hammer a community site.
const REQUEST_DELAY_MS = 150

async function fetchActiveModelUrls(type: VehicleAccessibilityType): Promise<string[]> {
  const res = await fetch(`${TRINMO_BASE_URL}/api/vehicles/fleet-list`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ city: 'sofia', type }),
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`fleet-list ${type}: ${res.status}`)
  const json = await res.json()
  if (!Value.Check(FleetListResponseSchema, json)) {
    throw new Error(`fleet-list ${type}: response no longer matches expected shape`)
  }
  const urls = json.results.filter((r) => r.status === ACTIVE_FLEET_LIST_STATUS).map((r) => r.url)
  return [...new Set(urls)]
}

async function fetchModelSightings(url: string): Promise<AccessibilitySighting[]> {
  const res = await fetch(`${TRINMO_BASE_URL}/api/vehicles/${encodeURIComponent(url)}`, {
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`model detail ${url}: ${res.status}`)
  const json = await res.json()
  if (!Value.Check(ModelDetailResponseSchema, json)) {
    throw new Error(`model detail ${url}: response no longer matches expected shape`)
  }

  const sightings: AccessibilitySighting[] = []
  for (const image of json.images ?? []) {
    for (const v of image.vehicles ?? []) {
      // Plenty of raw entries have a null type/status/model (unrelated
      // photo tags, incomplete captions) — skip rather than guess.
      if (!v.inventory || !v.vehicleType || !v.status?.name || !v.model?.name) continue
      if (!VEHICLE_TYPES.includes(v.vehicleType as VehicleAccessibilityType)) continue
      sightings.push({
        inventory: v.inventory,
        vehicleType: v.vehicleType as VehicleAccessibilityType,
        statusName: v.status.name,
        modelName: v.model.name,
      })
    }
  }
  return sightings
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function main() {
  const outputPath = process.argv[2] ?? config.rampAccessibility.dataPath

  const modelUrls = new Set<string>()
  for (const type of VEHICLE_TYPES) {
    try {
      const urls = await fetchActiveModelUrls(type)
      for (const url of urls) modelUrls.add(url)
      log.info(`${type}: ${urls.length} active models`)
    } catch (e) {
      log.error(`Failed to list active ${type} models, skipping this type this run:`, e)
    }
  }

  const allSightings: AccessibilitySighting[] = []
  let modelsFetched = 0
  for (const url of modelUrls) {
    try {
      allSightings.push(...(await fetchModelSightings(url)))
      modelsFetched++
    } catch (e) {
      log.error(`Failed to fetch model "${url}", skipping it this run:`, e)
    }
    await sleep(REQUEST_DELAY_MS)
  }
  log.info(`Fetched ${modelsFetched}/${modelUrls.size} models, ${allSightings.length} sightings`)

  const table = buildAccessibilityTable(
    allSightings,
    modelAccessibilityJson as Record<string, ModelAccessibility>,
  )
  for (const type of VEHICLE_TYPES) {
    log.info(`${type}: ${Object.keys(table[type]).length} vehicles resolved`)
  }

  const resolvedPath = resolve(outputPath)
  mkdirSync(dirname(resolvedPath), { recursive: true })
  await Bun.write(resolvedPath, JSON.stringify(table, null, 2))
  log.success(`Wrote ${resolvedPath}`)
}

main().catch((e) => {
  log.error('refresh-accessibility failed:', e)
  process.exit(1)
})
