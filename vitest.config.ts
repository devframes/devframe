import { defineConfig } from 'vitest/config'
import { alias } from './alias'

export default defineConfig({
  resolve: {
    alias,
  },
  test: {
    projects: [
      'packages/devframe',
      'packages/hub',
      'plugins/code-server',
      'plugins/terminals',
      'examples/files-inspector',
      'examples/streaming-chat',
      'examples/next-runtime-snapshot',
      'plugins/git',
      'examples/a11y-inspector',
      'examples/minimal-next-devframe-hub',
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
