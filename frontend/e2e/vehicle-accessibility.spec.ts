import { expect, test } from '@playwright/test'
import { createStop, createTrip, createVehicle, mockTransitApi } from './fixtures/transit'
import { FloatingNav } from './pages/FloatingNav'
import { StopSheet } from './pages/StopSheet'

for (const [status, label] of [
  ['working', 'С рампа'],
  ['in_use', 'С рампа'],
  ['no_ramp', 'Без рампа'],
  ['unknown', 'Достъпност неизвестна'],
] as const) {
  test(`vehicle header shows equipment for ${status}`, async ({ page }) => {
    const api = await mockTransitApi(page, { vehicles: [createVehicle({ rampStatus: status })] })
    await page.goto('/')
    await page.locator('.leaflet-marker-pane .leaflet-marker-icon').dispatchEvent('click')
    const sheet = new StopSheet(page, createVehicle().id)
    await expect(sheet.root.locator('[data-vehicle-accessibility]')).toHaveText(label)
    await expect(sheet.root).toContainText('Следваща спирка')
    expect(api.unhandledRequests).toEqual([])
  })
}

test('reservation entry resolves equipment from the existing fleet subscription', async ({
  page,
}) => {
  const api = await mockTransitApi(page)
  const fleetRequests: string[] = []
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/realtime/vehicles') {
      fleetRequests.push(request.url())
    }
  })
  await page.goto('/')
  await page.getByRole('button', { name: 'Спирки' }).click()
  await page.getByRole('button', { name: new RegExp(createStop().name) }).click()
  await new StopSheet(page, createStop().name).root.getByRole('button', { name: 'Качване' }).click()
  await expect(page.locator('[data-vehicle-accessibility]')).toHaveText('С рампа')
  await new FloatingNav(page).reservationButton('Качване').click()
  await page.getByRole('button', { name: '84', exact: true }).click()
  await expect(page.locator('[data-vehicle-accessibility]')).toHaveText('С рампа')
  expect(fleetRequests).toEqual([])
  expect(api.unhandledRequests).toEqual([])
})

test('reservation entry with unavailable vehicle data shows unknown', async ({ page }) => {
  await mockTransitApi(page, { vehicles: [] })
  await page.goto('/')
  await page.getByRole('button', { name: 'Спирки' }).click()
  await page.getByRole('button', { name: new RegExp(createStop().name) }).click()
  await new StopSheet(page, createStop().name).root.getByRole('button', { name: 'Качване' }).click()
  await expect(page.locator('[data-vehicle-accessibility]')).toHaveText('Достъпност неизвестна')
})

test('equipment stays visible when trip loading fails', async ({ page }) => {
  await mockTransitApi(page)
  await page.route('**/api/realtime/vehicles/*/trip', (route) =>
    route.fulfill({
      status: 503,
      contentType: 'application/json',
      body: '{"error":"Unavailable"}',
    }),
  )
  await page.goto('/')
  await page.locator('.leaflet-marker-pane .leaflet-marker-icon').dispatchEvent('click')
  await expect(page.getByText('Неуспешно зареждане на маршрут.')).toBeVisible()
  await expect(page.locator('[data-vehicle-accessibility]')).toHaveText('С рампа')
})

test('switching vehicles replaces the equipment label', async ({ page }) => {
  const first = createVehicle()
  const second = createVehicle({
    id: 'second-vehicle',
    lat: first.lat + 0.0001,
    rampStatus: 'no_ramp',
  })
  await mockTransitApi(page, { vehicles: [first, second] })
  await page.route(`**/api/realtime/vehicles/${second.id}/trip`, (route) =>
    route.fulfill({ json: createTrip({ vehicleId: second.id }) }),
  )
  await page.route(`**/api/realtime/vehicles/${second.id}/trip/etas`, (route) =>
    route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'data: []\n\n' }),
  )
  await page.goto('/')
  const markers = page.locator('.leaflet-marker-pane .leaflet-marker-icon')
  await expect(markers).toHaveCount(2)
  await markers.first().dispatchEvent('click')
  await page.locator('.vehicle-chooser button').first().click()
  await expect(page.locator('[data-vehicle-accessibility]')).toHaveText('С рампа')
  await markers.nth(1).dispatchEvent('click')
  await expect(page.locator('[data-vehicle-accessibility]')).toHaveText('Без рампа')
  await expect(new StopSheet(page, second.id).root).toBeVisible()
})

test('an open header updates from the fleet stream without a second subscription', async ({
  page,
}) => {
  await mockTransitApi(page)
  await page.addInitScript(() => {
    const NativeEventSource = window.EventSource
    const sources: EventSource[] = []
    Object.assign(window, { fleetSources: sources })
    window.EventSource = class extends NativeEventSource {
      constructor(url: string | URL, options?: EventSourceInit) {
        super(url, options)
        if (String(url).includes('/realtime/vehicles/stream')) sources.push(this)
      }
    }
  })
  await page.goto('/')
  await page.locator('.leaflet-marker-pane .leaflet-marker-icon').dispatchEvent('click')
  await expect(page.locator('[data-vehicle-accessibility]')).toHaveText('С рампа')
  await page.evaluate(
    (vehicle) => {
      const sources = (window as unknown as { fleetSources: EventSource[] }).fleetSources
      if (sources.length !== 1)
        throw new Error(`Expected one fleet subscription, got ${sources.length}`)
      sources[0].dispatchEvent(new MessageEvent('message', { data: JSON.stringify([vehicle]) }))
    },
    createVehicle({ rampStatus: 'no_ramp' }),
  )
  await expect(page.locator('[data-vehicle-accessibility]')).toHaveText('Без рампа')
})
