import { defineConfig } from 'vitest/config'
import { alias } from '../../alias'

// The dock-context tests cross-import `@devframes/hub`'s types/constants —
// resolve them to source rather than the (possibly stale/unbuilt) `dist`.
export default defineConfig({
  resolve: { alias },
  test: {
    name: '@devframes/hub-ui',
  },
})
