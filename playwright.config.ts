import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

const fixtureCwd = fileURLToPath(new URL('./tests/e2e/fixtures', import.meta.url))
const serveStatic = fileURLToPath(new URL('./tests/e2e/_support/serve-static.mjs', import.meta.url))

export default defineConfig({
  testDir: './tests/e2e',
  testIgnore: ['_support/**'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? [['github'], ['html']] : 'list',
  use: {
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  webServer: [
    {
      command: 'node bin.mjs',
      cwd: 'examples/files-inspector',
      env: { DEVFRAME_E2E_CWD: fixtureCwd },
      url: 'http://localhost:9876/__devframe-files-inspector/',
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'node bin.mjs',
      cwd: 'examples/streaming-chat',
      url: 'http://localhost:9897/__devframe-streaming-chat/',
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `node bin.mjs build --out-dir dist/static && node ${JSON.stringify(serveStatic)} dist/static 9886`,
      cwd: 'examples/files-inspector',
      env: { DEVFRAME_E2E_CWD: fixtureCwd },
      url: 'http://127.0.0.1:9886/',
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `node bin.mjs build --out-dir dist/static && node ${JSON.stringify(serveStatic)} dist/static 9898`,
      cwd: 'examples/streaming-chat',
      url: 'http://127.0.0.1:9898/',
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
})
