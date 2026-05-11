import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: [
      'packages/devframe',
      'examples/devframe-files-inspector',
      'examples/devframe-streaming-chat',
      'tests',
    ],
    testTimeout: 10000,
  },
})
