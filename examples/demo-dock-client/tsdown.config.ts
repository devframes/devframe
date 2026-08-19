import { defineConfig } from 'tsdown'

const tsconfig = '../../tsconfig.base.json'

// The bare-specifier consumption path needs no build at all: the package's
// `.` export points straight at `src/index.ts`, which a Vite host transforms
// like any linked workspace source (hub-vite imports `'demo-dock-client'`
// via the `/@id/{specifier}` template). What gets built here is only the
// **URL-shape** consumption path:
//   1. `dist/bundle.mjs` — self-contained (nanoevents inlined), for hosts
//      without bare-specifier resolution (hub-next mounts it statically and
//      passes the served URL as `importFrom`);
//   2. `dist/node.mjs` — the node-side path helper the Next host uses to
//      locate the bundle.
export default defineConfig([
  {
    clean: true,
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
