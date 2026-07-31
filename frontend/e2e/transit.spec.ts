import { expect, test } from '@playwright/test'
import { mockTransitApi, stop, vehicle } from './fixtures/transit'

test('loads the map and renders live vehicles', async ({ page }) => {
  const api = await mockTransitApi(page)

  await page.goto('/')

  await expect(page.locator('.leaflet-container')).toBeVisible()
  await expect(page.locator('.leaflet-marker-pane .leaflet-marker-icon')).toHaveCount(1)
  expect(api.unhandledRequests).toEqual([])
})

test('round-trips a ramp reservation through the session UI', async ({ page }) => {
  const api = await mockTransitApi(page)

  await page.goto('/')
  await page.getByRole('button', { name: 'Спирки' }).click()
  await page.getByRole('button', { name: new RegExp(stop.stop_name) }).click()

  const stopSheet = page.locator('section.stop-sheet-shell').filter({ hasText: stop.stop_name })
  await expect(stopSheet).toBeVisible()
  await stopSheet.getByRole('button', { name: 'Качване' }).click()

  await expect.poll(() => api.reserveRequests).toHaveLength(1)
  expect(api.reserveRequests[0]).toEqual({
    sessionId: 'e2e-session-id',
    vehicle_id: vehicle.id,
    stop_id: stop.stop_id,
    type: 'board',
  })

  const reservationBanner = page
    .locator('[data-floating-nav]')
    .getByRole('button')
    .filter({ hasText: 'Качване' })
  await expect(reservationBanner).toBeVisible()
  await reservationBanner.click()

  const cancelButton = page.getByRole('button', { name: 'Отказ', exact: true })
  await expect(cancelButton).toBeVisible()
  await cancelButton.click()

  await expect.poll(() => api.cancelledIds).toEqual([1])
  await expect(page.getByText('Резервирайте рампа от картата')).toBeVisible()
  expect(api.unhandledRequests).toEqual([])
})
