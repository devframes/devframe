import { defineConfig } from 'tsdown'

const tsconfig = '../../tsconfig.base.json'

// `@devframes/hub*` are optional peers, kept external so their type graphs and
// node code never inline here (the hub host loads `@devframes/hub-ui` via a
// bundler-ignored dynamic import at request time).
const nodeDeps = {
  neverBundle: [/^@devframes\//],
}

export default defineConfig([
  // Node entries - the throwing root, the single-devframe surface, and the
  // hub host.
  {
    entry: {
      index: 'src/index.ts',
      single: 'src/single.ts',
      hub: 'src/hub.ts',
    },
    platform: 'node',
    tsconfig,
    clean: true,
    dts: true,
    deps: nodeDeps,
    outExtensions: () => ({ dts: '.d.mts' }),
  },
  // Browser entries - the React client surfaces (single-devframe + hub). React
  // and devframe's/hub's client stay external so the consuming app provides them.
  {
    entry: {
      'client': 'src/client.tsx',
      'hub-client': 'src/hub-client.tsx',
    },
    platform: 'browser',
    tsconfig,
    clean: false,
    dts: true,
    outExtensions: () => ({ js: '.mjs', dts: '.d.mts' }),
    deps: {
      neverBundle: ['react', 'react-dom', 'react/jsx-runtime', 'devframe/client', /^@devframes\//],
    },
  },
])
