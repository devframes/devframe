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
