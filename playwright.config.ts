import { defineConfig } from '@playwright/test'
import { resolve } from 'node:path'
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  workers: 1,
  timeout: 90000,
  use: {
    baseURL: 'http://127.0.0.1:3100',
    viewport: { width: 1505, height: 1045 },
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: 'node tests/helpers/openai-fixture.mjs',
      url: 'http://127.0.0.1:4318',
      reuseExistingServer: false,
    },
    {
      command: 'node scripts/start.mjs',
      url: 'http://127.0.0.1:3100',
      reuseExistingServer: false,
      timeout: 120000,
      env: {
        PORT: '3100',
        ROLELENS_API_KEY: 'local-test-fixture',
        ROLELENS_MODEL: 'fixture',
        ROLELENS_API_PROTOCOL: 'chat-completions',
        ROLELENS_BASE_URL: 'http://127.0.0.1:4318/v1',
        ROLELENS_DATA_DIR: resolve('.qa', `e2e-${Date.now()}`),
      },
    },
  ],
})
