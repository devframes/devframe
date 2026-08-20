import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'
import devframe from './src/devframe.ts'

// Fixed, checked-in fixture dir (not a per-test tmp dir): the dev server
// this config boots is a separate process started before any test runs, so
// its `DEVFRAME_E2E_CWD` has to be set here - a test's `process.env` can't
// reach back into an already-running child process.
const fixtureCwd = fileURLToPath(new URL('./e2e/fixtures', import.meta.url))
const port = devframe.cli!.port // matches `playground/single/vite.config.ts`'s pinned port.

export default defineConfig({
  testDir: './e2e',
  testIgnore: ['fixtures/**'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html']] : 'list',
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: 'on-first-retry',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    command: 'pnpm run play:single',
    env: { DEVFRAME_E2E_CWD: fixtureCwd },
    // The SPA (this playground's own `index.html`) serves from Vite's root -
    // see `playground/single/vite.config.ts` for why it can't share the
    // RPC bridge's `/__devframe-starter/` base.
    url: `http://127.0.0.1:${port}/`,
    timeout: 60_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
  },
})
