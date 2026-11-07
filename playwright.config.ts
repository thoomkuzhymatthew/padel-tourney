import { defineConfig } from '@playwright/test'

const remoteBase = process.env.E2E_BASE_URL

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 45000,
  use: { baseURL: remoteBase ?? 'http://127.0.0.1:5173', viewport: { width: 390, height: 844 }, trace: 'off', screenshot: 'off' },
  webServer: remoteBase ? undefined : { command: 'npm run dev -- --host 127.0.0.1 --port 5173', url: 'http://127.0.0.1:5173', reuseExistingServer: !process.env.CI },
})
