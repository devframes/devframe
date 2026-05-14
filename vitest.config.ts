import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      'packages/devframe',
      'examples/files-inspector',
      'examples/streaming-chat',
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
