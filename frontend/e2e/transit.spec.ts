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
