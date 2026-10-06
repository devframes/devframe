import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: '@devframes/hub-ui-onboard',
    // The install test runs a real package manager.
    testTimeout: 120_000,
  },
})
