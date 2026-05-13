import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      'packages/devframe',
      'examples/files-inspector',
      'examples/streaming-chat',
      'tests',
    ],
    testTimeout: 10000,
  },
})
