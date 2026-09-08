import { afterEach, describe, expect, test } from 'bun:test'
import { rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { createAccessibilityResolver } from '../../src/gtfs/accessibility'

const written: string[] = []

function datasetFile(contents: unknown): string {
  const path = `${tmpdir()}/rampme-acc-${Date.now()}-${Math.random().toString(36).slice(2)}.json`
  writeFileSync(path, typeof contents === 'string' ? contents : JSON.stringify(contents))
  written.push(path)
  return path
}

/** The loader reads in the background, so give it a tick before resolving. */
async function resolverFor(path: string) {
  const resolver = createAccessibilityResolver(path, 60_000)
  await Bun.sleep(50)
  return resolver
}

afterEach(() => {
  for (const p of written.splice(0)) rmSync(p, { force: true })
})

describe('createAccessibilityResolver', () => {
  test('resolves a vehicle from its type prefix and inventory number', async () => {
    const r = await resolverFor(
      datasetFile({ BUS: { '1211': true }, TRAM: {}, TROLLEY: { '5051': false } }),
    )
    expect(r.resolve('A1211')).toBe(true)
    expect(r.resolve('TB5051')).toBe(false)
    r.stop()
  })

  test('an unlisted vehicle is unknown, never "not equipped"', async () => {
    const r = await resolverFor(datasetFile({ BUS: {}, TRAM: {}, TROLLEY: {} }))
    expect(r.resolve('A9999')).toBeNull()
    expect(r.resolve('TM2355')).toBeNull()
    r.stop()
  })

  test('a table missing a vehicle type is rejected, and resolve stays callable', async () => {
    // The dataset is written by a script in another repository, so a shape
    // drift must degrade to unknown rather than throw per vehicle and take
    // the whole vehicle feed down with it.
    const r = await resolverFor(datasetFile({ BUS: { '1211': true } }))
    expect(() => r.resolve('TM2355')).not.toThrow()
    expect(r.resolve('TM2355')).toBeNull()
    expect(r.resolve('A1211')).toBeNull()
    r.stop()
  })

  test('a non-boolean entry is rejected rather than coerced', async () => {
    const r = await resolverFor(datasetFile({ BUS: { '1211': 'yes' }, TRAM: {}, TROLLEY: {} }))
    expect(r.resolve('A1211')).toBeNull()
    r.stop()
  })

  test('unparseable JSON leaves every vehicle unknown', async () => {
    const r = await resolverFor(datasetFile('{ not json'))
    expect(() => r.resolve('A1211')).not.toThrow()
    expect(r.resolve('A1211')).toBeNull()
    r.stop()
  })

  test('a missing file leaves every vehicle unknown', async () => {
    const r = await resolverFor(`${tmpdir()}/rampme-acc-does-not-exist.json`)
    expect(r.resolve('A1211')).toBeNull()
    r.stop()
  })

  test('a malformed vehicle id is unknown', async () => {
    const r = await resolverFor(datasetFile({ BUS: { '1211': true }, TRAM: {}, TROLLEY: {} }))
    expect(r.resolve('not-a-vehicle')).toBeNull()
    expect(r.resolve('ZZ1211')).toBeNull()
    r.stop()
  })
})
