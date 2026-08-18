import { defineConfig } from 'tsdown'

const tsconfig = '../../tsconfig.base.json'

// Two builds of the same client script, one per consumption mode the hub
// examples demonstrate:
//   1. `dist/index.mjs` — dependencies stay external (`import 'nanoevents'`
//      survives as a bare import), for hosts that resolve bare specifiers
//      through their own module graph (hub-vite imports
//      `'demo-dock-client'` via the Vite `/@id/{specifier}` template);
//   2. `dist/bundle.mjs` — self-contained (nanoevents inlined), for hosts
//      without bare-specifier resolution (hub-next mounts it statically and
//      passes the served URL as `importFrom`).
// Plus the node-side path helper the Next host uses to locate the bundle.
export default defineConfig([
  {
    clean: true,
    platform: 'browser',
    tsconfig,
    dts: false,
    outExtensions: () => ({ js: '.mjs' }),
    entry: { index: 'src/index.ts' },
  },
  {
    clean: false,
    platform: 'browser',
    tsconfig,
    dts: false,
    outExtensions: () => ({ js: '.mjs' }),
    entry: { bundle: 'src/index.ts' },
    deps: { alwaysBundle: ['nanoevents'] },
  },
  {
    clean: false,
    platform: 'node',
    tsconfig,
    dts: false,
    outExtensions: () => ({ js: '.mjs' }),
    entry: { node: 'src/node.ts' },
  },
])
