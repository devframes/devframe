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
      'examples/files-inspector',
      'examples/streaming-chat',
      'examples/next-runtime-snapshot',
      'examples/minimal-next-devtools-hub',
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
