import { defineConfig } from 'tsdown'

const tsconfig = '../../tsconfig.base.json'

export default defineConfig([
  // Node entry — the route handler + host + config helper.
  {
    entry: { index: 'src/index.ts' },
    platform: 'node',
    tsconfig,
    clean: true,
    dts: true,
    outExtensions: () => ({ dts: '.d.mts' }),
  },
  // Browser entry — the React client surface. React and devframe's client stay
  // external so the consuming app provides them.
  {
    entry: { client: 'src/client.tsx' },
    platform: 'browser',
    tsconfig,
    clean: false,
    dts: true,
    outExtensions: () => ({ js: '.mjs', dts: '.d.mts' }),
    deps: {
      neverBundle: ['react', 'react-dom', 'react/jsx-runtime', 'devframe/client'],
    },
  },
])
