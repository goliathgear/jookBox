import { defineConfig, devices } from '@playwright/test';

const port = 3199;

// Runs the production server against e2e/config. Set PW_CHANNEL=chrome to use
// an installed Google Chrome instead of Playwright's own Chromium.
export default defineConfig({
  testDir: 'e2e',
  timeout: 30_000,
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    ...devices['Desktop Chrome'],
    viewport: { width: 1440, height: 900 },
    channel: process.env.PW_CHANNEL || undefined,
  },
  webServer: {
    command: 'npm run build && node server/index.ts',
    url: `http://127.0.0.1:${port}/healthz`,
    reuseExistingServer: false,
    env: { PORT: String(port), HOST: '127.0.0.1', CONFIG_DIR: 'e2e/config', LOG_LEVEL: 'warn' },
  },
});
