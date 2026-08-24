import { defineConfig, devices } from '@playwright/test'

const baseURL = 'http://127.0.0.1:3001'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [['html', { open: 'never' }], ['list'], ['github']],
  use: {
    baseURL,
    trace: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      testIgnore: '**/mobile-*.spec.ts',
      use: { ...devices['Desktop Chrome'] },
    },
    {
      name: 'mobile',
      testMatch: '**/mobile-*.spec.ts',
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: 'bun run dev --webpack --hostname 127.0.0.1 --port 3001',
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
