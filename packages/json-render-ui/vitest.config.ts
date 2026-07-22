import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vitest/config'
import { alias } from '../../alias'

// The component graph imports `@antfu/design` `.vue` SFCs, so tests need the Vue
// plugin to parse them.
export default defineConfig({
  plugins: [vue()],
  resolve: { alias },
  test: {
    name: '@devframes/json-render-ui',
  },
})
