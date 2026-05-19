import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  timeout: 120_000,
  retries: 1,
  reporter: [['list'], ['html', { outputFolder: 'e2e/playwright-report', open: 'never' }]],
  use: {
    baseURL: 'https://opensoyce.com',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
