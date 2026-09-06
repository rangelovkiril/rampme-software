import { expect, test } from '@playwright/test'
import { createStop, createVehicle, mockTransitApi, sessionId } from './fixtures/transit'
import { FloatingNav } from './pages/FloatingNav'
import { StopSheet } from './pages/StopSheet'

const stop = createStop()
const vehicle = createVehicle()

test('loads the map and renders live vehicles', async ({ page }) => {
  const api = await mockTransitApi(page)

  await page.goto('/')

  await expect(page.locator('.leaflet-container')).toBeVisible()
  await expect(page.locator('.leaflet-marker-pane .leaflet-marker-icon')).toHaveCount(1)
  await expect(page.locator('.leaflet-marker-pane .leaflet-marker-icon > div')).toBeVisible()
  expect(api.unhandledRequests).toEqual([])
})

test('vehicle markers distinguish ramp-equipped, not-equipped, and unknown', async ({ page }) => {
  const equipped = createVehicle({
    id: 'vehicle-equipped',
    lat: 42.6978,
    lng: 23.322,
    ramp_status: 'working',
  })
  const notEquipped = createVehicle({
    id: 'vehicle-not-equipped',
    lat: 42.699,
    lng: 23.323,
    ramp_status: 'no_ramp',
  })
  const unknown = createVehicle({
    id: 'vehicle-unknown',
    lat: 42.696,
    lng: 23.321,
    ramp_status: 'unknown',
  })
  await mockTransitApi(page, { vehicles: [equipped, notEquipped, unknown] })

  await page.goto('/')

  const markers = page.locator('.leaflet-marker-pane .leaflet-marker-icon > div')
  await expect(markers).toHaveCount(3)
  const borders = await markers.evaluateAll((els) =>
    els.map((el) => getComputedStyle(el).borderColor),
  )

  // Exactly one marker per state, and no two states render the same border
  // color — the map's whole "at a glance" contract per
  // openspec/changes/ramp-vehicle-accessibility.
  expect(new Set(borders).size).toBe(3)
  // Ramp-equipped is the only state with a visible (non-transparent) green ring.
  expect(borders.filter((c) => c === 'rgb(34, 197, 94)')).toHaveLength(1)
  // Not-equipped is the only state with a visible gray ring.
  expect(borders.filter((c) => c === 'rgb(107, 114, 128)')).toHaveLength(1)
})

test('round-trips a ramp reservation through the session UI', async ({ page }) => {
  const api = await mockTransitApi(page)

  await page.goto('/')
  await page.getByRole('button', { name: 'Спирки' }).click()
  await page.getByRole('button', { name: new RegExp(stop.stop_name) }).click()

  const stopSheet = new StopSheet(page, stop.stop_name)
  await expect(stopSheet.root).toBeVisible()
  await stopSheet.root.getByRole('button', { name: 'Качване' }).click()

  await expect.poll(() => api.reserveRequests).toHaveLength(1)
  expect(api.reserveRequests[0]).toEqual({
    sessionId,
    vehicle_id: vehicle.id,
    stop_id: stop.stop_id,
    type: 'board',
  })

  const reservationBanner = new FloatingNav(page).reservationButton('Качване')
  await expect(reservationBanner).toBeVisible()
  await reservationBanner.click()

  const cancelButton = page.getByRole('button', { name: 'Отказ', exact: true })
  await expect(cancelButton).toBeVisible()
  await cancelButton.click()

  await expect.poll(() => api.cancelledIds).toEqual([1])
  await expect(page.getByText('Резервирайте рампа от картата')).toBeVisible()
  expect(api.rampSessionIds.length).toBeGreaterThan(0)
  expect(api.rampSessionIds.every((id) => id === sessionId)).toBe(true)
  expect(api.unhandledRequests).toEqual([])
})
