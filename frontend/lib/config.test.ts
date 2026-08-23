/// <reference types="bun-types" />
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import { apiPath } from './config'

type MinimalWindow = { location: { hostname: string } }

function setWindow(hostname: string | undefined): void {
  if (hostname === undefined) {
    Reflect.deleteProperty(globalThis, 'window')
    return
  }
  Reflect.set(globalThis, 'window', { location: { hostname } } satisfies MinimalWindow)
}

beforeEach(() => {
  Reflect.deleteProperty(process.env, 'NEXT_PUBLIC_API_URL')
  Reflect.deleteProperty(process.env, 'NODE_ENV')
  setWindow(undefined)
})

afterEach(() => {
  setWindow(undefined)
})

describe('apiPath', () => {
  test('an explicit NEXT_PUBLIC_API_URL always wins, trailing slash stripped', () => {
    process.env.NEXT_PUBLIC_API_URL = 'https://example.test/'
    setWindow('rampme.site')
    expect(apiPath('/stops')).toBe('https://example.test/stops')
  })

  test('NODE_ENV=development falls back to /api regardless of hostname', () => {
    Reflect.set(process.env, 'NODE_ENV', 'development')
    setWindow('rampme.site')
    expect(apiPath('/stops')).toBe('/api/stops')
  })

  test('production hostname resolves to the production API', () => {
    setWindow('rampme.site')
    expect(apiPath('/stops')).toBe('https://api.rampme.site/stops')
  })

  test('staging hostname resolves to the stage API', () => {
    setWindow('staging.rampme.pages.dev')
    expect(apiPath('/stops')).toBe('https://api-stage.rampme.site/stops')
  })

  test('an unrecognized hostname falls back to the stage API, not production', () => {
    setWindow('some-pr-preview.rampme.pages.dev')
    expect(apiPath('/stops')).toBe('https://api-stage.rampme.site/stops')
  })

  test('no window (build-time prerender) falls back to the stage API', () => {
    setWindow(undefined)
    expect(apiPath('/stops')).toBe('https://api-stage.rampme.site/stops')
  })
})
