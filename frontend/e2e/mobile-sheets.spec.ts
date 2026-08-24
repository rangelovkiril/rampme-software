import { expect, test } from '@playwright/test'
import { createStop, createVehicle, mockTransitApi } from './fixtures/transit'
import { StopSheet } from './pages/StopSheet'

const stop = createStop()
const vehicle = createVehicle()

test('resizes and dismisses the stop bottom sheet', async ({ page }) => {
  const api = await mockTransitApi(page)

  await page.goto('/')
  await page.getByRole('button', { name: 'Спирки' }).click()
  await page.getByRole('button', { name: new RegExp(stop.stop_name) }).click()

  const sheet = new StopSheet(page, stop.stop_name)
  await expect(sheet.root).toBeVisible()

  const initialHeight = await sheet.height()
  await sheet.dragVertically(-140)
  await expect.poll(() => sheet.height()).toBeGreaterThan(initialHeight + 80)

  await sheet.dragVertically(900)
  await expect(sheet.root).toHaveCount(0)
  expect(api.unhandledRequests).toEqual([])
})

test('resizes and dismisses the vehicle trip bottom sheet', async ({ page }) => {
  const api = await mockTransitApi(page)

  await page.goto('/')
  const vehicleMarker = page.locator('.leaflet-marker-pane .leaflet-marker-icon')
  await expect(vehicleMarker).toHaveCount(1)
  await vehicleMarker.dispatchEvent('click')

  const sheet = new StopSheet(page, vehicle.id)
  await expect(sheet.root).toContainText('Следваща спирка')

  const initialHeight = await sheet.height()
  await sheet.dragVertically(-140)
  await expect.poll(() => sheet.height()).toBeGreaterThan(initialHeight + 80)

  await sheet.dragVertically(900)
  await expect(sheet.root).toHaveCount(0)
  expect(api.unhandledRequests).toEqual([])
})
