import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    // Don't run e2e tests here - they have their own config and script.
    exclude: ['e2e/**'],
  },
})
