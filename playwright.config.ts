import process from 'node:process'
import { fileURLToPath } from 'node:url'
import { defineConfig, devices } from '@playwright/test'

const fixtureCwd = fileURLToPath(new URL('./tests/e2e/fixtures', import.meta.url))
const serveStatic = fileURLToPath(new URL('./tests/e2e/_support/serve-static.mjs', import.meta.url))

// Hermetic per-suite instance-registry dirs so the `devframe connect` specs
// see exactly the instance they booted (and local runs never touch
// `~/.devframe/instances`). Servers without a connect spec opt out entirely.
const filesInspectorRegistry = fileURLToPath(new URL('./tests/e2e/.registries/files-inspector', import.meta.url))
const nextHubRegistry = fileURLToPath(new URL('./tests/e2e/.registries/next-hub', import.meta.url))

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
      // Explicit IPv4 bind: the connect spec's registry probe and MCP client
      // dial the recorded origin directly, and a bare `localhost` bind is
      // family-ambiguous across environments.
      command: 'node bin.mjs --host 127.0.0.1',
      cwd: 'examples/files-inspector',
      env: { DEVFRAME_E2E_CWD: fixtureCwd, DEVFRAME_INSTANCES_DIR: filesInspectorRegistry },
      url: 'http://localhost:9876/__devframe-files-inspector/',
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'node bin.mjs',
      cwd: 'examples/streaming-chat',
      env: { DEVFRAME_DISABLE_INSTANCE_REGISTRY: '1' },
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
    {
      command: 'node bin.mjs',
      cwd: 'examples/next-runtime-snapshot',
      env: { DEVFRAME_DISABLE_INSTANCE_REGISTRY: '1' },
      url: 'http://localhost:9899/__next-runtime-snapshot/',
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: 'pnpm exec next dev src/client -p 9878',
      cwd: 'examples/hub-next',
      env: { PORT: '9878', DEVFRAME_INSTANCES_DIR: nextHubRegistry },
      url: 'http://localhost:9878/',
      timeout: 120_000,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
    {
      command: `node bin.mjs build --out-dir dist/static && node ${JSON.stringify(serveStatic)} dist/static 9889`,
      cwd: 'examples/next-runtime-snapshot',
      url: 'http://127.0.0.1:9889/',
      timeout: 60_000,
      reuseExistingServer: !process.env.CI,
      stdout: 'pipe',
      stderr: 'pipe',
    },
  ],
})
