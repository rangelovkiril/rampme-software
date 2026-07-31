import { devices, expect, type Locator, test } from '@playwright/test'
import { mockTransitApi, stop, vehicle } from './fixtures/transit'

test.use({ ...devices['Pixel 7'] })

async function dragVertically(handle: Locator, deltaY: number) {
  const box = await handle.boundingBox()
  if (!box) throw new Error('Drag handle is not visible')

  const clientX = box.x + box.width / 2
  const startY = box.y + box.height / 2
  const endY = startY + deltaY
  const startTouch = { identifier: 0, clientX, clientY: startY }
  const endTouch = { identifier: 0, clientX, clientY: endY }

  await handle.dispatchEvent('touchstart', {
    touches: [startTouch],
    targetTouches: [startTouch],
    changedTouches: [startTouch],
  })
  await handle.dispatchEvent('touchmove', {
    touches: [endTouch],
    targetTouches: [endTouch],
    changedTouches: [endTouch],
  })
  await handle.dispatchEvent('touchend', {
    touches: [],
    targetTouches: [],
    changedTouches: [endTouch],
  })
}

async function heightOf(locator: Locator) {
  return (await locator.boundingBox())?.height ?? 0
}

test('resizes and dismisses the stop bottom sheet', async ({ page }) => {
  const api = await mockTransitApi(page)

  await page.goto('/')
  await page.getByRole('button', { name: 'Спирки' }).click()
  await page.getByRole('button', { name: new RegExp(stop.stop_name) }).click()

  const sheet = page.locator('section.stop-sheet-shell').filter({ hasText: stop.stop_name })
  const handle = sheet.locator('[role="presentation"]').first()
  await expect(sheet).toBeVisible()

  const initialHeight = await heightOf(sheet)
  await dragVertically(handle, -140)
  await expect.poll(() => heightOf(sheet)).toBeGreaterThan(initialHeight + 80)

  await dragVertically(handle, 900)
  await expect(sheet).toHaveCount(0)
  expect(api.unhandledRequests).toEqual([])
})

test('resizes and dismisses the vehicle trip bottom sheet', async ({ page }) => {
  const api = await mockTransitApi(page)

  await page.goto('/')
  const vehicleMarker = page.locator('.leaflet-marker-pane .leaflet-marker-icon')
  await expect(vehicleMarker).toHaveCount(1)
  await vehicleMarker.dispatchEvent('click')

  const sheet = page.locator('section.stop-sheet-shell').filter({ hasText: vehicle.id })
  const handle = sheet.locator('[role="presentation"]').first()
  await expect(sheet).toContainText('Следваща спирка')

  const initialHeight = await heightOf(sheet)
  await dragVertically(handle, -140)
  await expect.poll(() => heightOf(sheet)).toBeGreaterThan(initialHeight + 80)

  await dragVertically(handle, 900)
  await expect(sheet).toHaveCount(0)
  expect(api.unhandledRequests).toEqual([])
})
