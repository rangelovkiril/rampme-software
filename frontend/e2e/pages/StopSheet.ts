import type { Locator, Page } from '@playwright/test'

/**
 * Wraps the `section.stop-sheet-shell` bottom sheet (used for both a stop's
 * arrivals and a vehicle's trip timeline) and its mobile drag-to-resize
 * gesture. Takes the plain text to match the sheet by (a stop name, a
 * vehicle id) rather than a fixture object, so this stays independent of
 * whatever shape `createStop`/`createVehicle` produce.
 */
export class StopSheet {
  readonly root: Locator
  private readonly handle: Locator

  constructor(page: Page, matcherText: string) {
    this.root = page.locator('section.stop-sheet-shell').filter({ hasText: matcherText })
    this.handle = this.root.locator('[role="presentation"]').first()
  }

  async height(): Promise<number> {
    return (await this.root.boundingBox())?.height ?? 0
  }

  async dragVertically(deltaY: number): Promise<void> {
    const box = await this.handle.boundingBox()
    if (!box) throw new Error('Drag handle is not visible')

    const clientX = box.x + box.width / 2
    const startY = box.y + box.height / 2
    const endY = startY + deltaY
    const startTouch = { identifier: 0, clientX, clientY: startY }
    const endTouch = { identifier: 0, clientX, clientY: endY }

    await this.handle.dispatchEvent('touchstart', {
      touches: [startTouch],
      targetTouches: [startTouch],
      changedTouches: [startTouch],
    })
    await this.handle.dispatchEvent('touchmove', {
      touches: [endTouch],
      targetTouches: [endTouch],
      changedTouches: [endTouch],
    })
    await this.handle.dispatchEvent('touchend', {
      touches: [],
      targetTouches: [],
      changedTouches: [endTouch],
    })
  }
}
