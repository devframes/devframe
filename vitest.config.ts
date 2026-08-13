import process from 'node:process'
import { defineConfig } from 'vitest/config'
import { alias } from './alias'

// Unit tests boot real dev servers; keep them out of the user's global
// devframe instance registry. Registry-specific tests re-enable it with
// `vi.stubEnv` + an explicit `instancesDir`.
process.env.DEVFRAME_DISABLE_INSTANCE_REGISTRY ??= '1'

export default defineConfig({
  resolve: {
    alias,
  },
  test: {
    projects: [
      'packages/devframe',
      'packages/hub',
      'packages/json-render',
      'packages/json-render-ui',
      'plugins/code-server',
      'plugins/data-inspector',
      'plugins/terminals',
      'plugins/inspect',
      'plugins/og',
      'examples/files-inspector',
      'examples/streaming-chat',
      'examples/next-runtime-snapshot',
      'plugins/git',
      'plugins/a11y',
      'plugins/messages',
      'plugins/assets',
      'examples/hub-next',
      'packages/next',
      'packages/vite',
      {
        test: {
          name: 'tests',
          root: './tests',
          exclude: ['e2e/**', '**/node_modules/**', '**/dist/**'],
        },
      },
    ],
    testTimeout: 10000,
  },
})
