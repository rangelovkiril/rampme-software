import type { Locator, Page } from '@playwright/test'

/** Wraps the `[data-floating-nav]` top navigation, home of the active-reservation banner. */
export class FloatingNav {
  private readonly root: Locator

  constructor(page: Page) {
    this.root = page.locator('[data-floating-nav]')
  }

  reservationButton(matcherText: string): Locator {
    return this.root.getByRole('button').filter({ hasText: matcherText })
  }
}
