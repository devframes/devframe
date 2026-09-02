import { defineConfig } from 'vitest/config'
import { alias } from '../../alias'

export default defineConfig({
  resolve: { alias },
  test: {
    name: 'devframe',
    testTimeout: 10_000,
    typecheck: {
      enabled: true,
      tsconfig: './tsconfig.json',
    },
  },
})
