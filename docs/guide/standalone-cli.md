---
outline: deep
---

# Standalone CLI with Devframe

`npx my-tool` starts a dev server serving a Vue/Nuxt/React SPA over type-safe RPC, plus `build`/`mcp`.

## What you ship

```
my-tool/
├── bin.mjs                  # shebang + import './dist/cli.mjs'
├── src/
│   ├── cli.ts               # defineDevframe + createCac
│   ├── rpc.ts               # your RPC function definitions
│   └── data.ts              # your domain-specific logic
├── app/                     # Nuxt / Vue / React SPA source
├── dist/
│   ├── public/              # built SPA output (served at /)
│   └── cli.mjs              # bundled node entry
└── package.json
```

## Minimal CLI

```ts [src/cli.ts]
import process from 'node:process'
import { defineDevframe, defineRpcFunction } from 'devframe'
import { createCac } from 'devframe/adapters/cac'
import { colors as c } from 'devframe/utils/colors'
import { resolve } from 'pathe'

const clientAssets = resolve(import.meta.dirname, '../dist/public')

const devframe = defineDevframe({
  id: 'my-tool',
  name: 'My Tool',
  clientAssets,
  cli: {
    command: 'my-tool',
    port: 7777,
    portRange: [7777, 9000],
    open: true, // auth defaults to on; `--open` embeds the current OTP so the tab lands authenticated
    configure(cli) {
      cli
        .option('--config <file>', 'Config file path')
        .option('--base-path <dir>', 'Base directory for resolution')
    },
  },
  async setup(ctx, { flags }) {
    const my = ctx.scope('my-tool')
    my.rpc.register(defineRpcFunction({
      name: 'get-payload', // -> my-tool:get-payload
      type: 'query',
      async handler() {
        return await loadPayload({
          configPath: flags.config,
          basePath: flags.basePath,
        })
      },
    }))
  },
})

await createCac(devframe, {
  onReady({ origin }) {
    console.log(c.green`My Tool ready at ${origin}`)
  },
}).parse(process.argv)
```

Run:

```sh
my-tool                                     # dev server at http://localhost:7777/
my-tool --config ./my.config.mjs
my-tool --port 8080 --no-open
my-tool build --out-dir dist-static         # self-contained static deploy
my-tool build --out-dir dist-static --base /tool/  # …under a custom base
my-tool mcp                                 # agent exposure
```

## Nuxt SPA setup

The devframe helper module sets `app.baseURL: './'` / `vite.base: './'` and injects a client plugin wiring `connectDevframe()` into `$rpc`:

```ts [nuxt.config.ts]
export default defineNuxtConfig({
  ssr: false,
  modules: ['@devframes/nuxt/single'],
  nitro: {
    preset: 'static',
    output: { dir: './dist' }, // matches the definition's clientAssets of ./dist/public
  },
})
```

Point `clientAssets` at `./dist/public`; see the [Nuxt docs](/frameworks/nuxt).

## Next.js SPA setup

For a Next.js App Router SPA, use static export (devframe owns HTTP+RPC, Next.js produces the bundle). Three settings cover it:

```js [next.config.mjs]
/** @type {import('next').NextConfig} */
export default {
  output: 'export',
  assetPrefix: '.',
  trailingSlash: true,
  images: { unoptimized: true },
}
```

- **`output: 'export'`** emits the SPA as static HTML/JS/CSS.
- **`assetPrefix: '.'`** makes the build base-agnostic (`./_next/...`), so one bundle works at any mount path.
- **`trailingSlash: true`** emits `foo/index.html`, composing with devframe's directory-with-index resolution.

`next build` writes to `<project>/out/`; copy it wherever you point `clientAssets`:

```json [package.json]
{
  "scripts": {
    "build": "next build src/client && rm -rf dist/client && mkdir -p dist && cp -r src/client/out dist/client"
  }
}
```

```ts [src/cli.ts]
import { fileURLToPath } from 'node:url'

defineDevframe({
  id: 'my-tool',
  clientAssets: fileURLToPath(new URL('../dist/client', import.meta.url)),
  // …
})
```

Call `connectDevframe()` in a Client Component, sharing it via React context — see [Client](./client) and [`examples/next-runtime-snapshot`](https://github.com/devframes/devframe/tree/main/examples/next-runtime-snapshot).

## Connecting from the client

With the Nuxt helper, use `$rpc` directly:

```ts [app/composables/payload.ts]
export async function fetchPayload() {
  const { $rpc } = useNuxtApp()
  return $rpc.call('my-tool:get-payload')
}
```

Otherwise, call `connectDevframe()`:

```ts
import { connectDevframe } from 'devframe/client'

const my = (await connectDevframe()).scope('my-tool')
const payload = await my.rpc.call('get-payload')
```

`connectDevframe` auto-resolves the connection descriptor relative to the page — in dev (WebSocket) and in the built static snapshot (`static` backend reads the baked RPC dump).

## Typed CLI flags

Declare tool flags with any [Standard Schema](https://standardschema.dev/) validator (valibot/zod/arktype) — validated at parse time, typed at the call site:

```ts
import type { InferCliFlags } from 'devframe/adapters/cac'
import { defineDevframe } from 'devframe'
import { defineCliFlags } from 'devframe/adapters/cac'
import * as v from 'valibot' // npm i valibot

const appFlags = defineCliFlags({
  depth: v.pipe(v.number(), v.integer()),
  config: v.optional(v.string()),
  verbose: v.optional(v.boolean()),
})

defineDevframe({
  id: 'my-tool',
  name: 'My Tool',
  clientAssets,
  cli: {
    flags: appFlags,
  },
  setup(ctx, info) {
    const flags = info.flags as InferCliFlags<typeof appFlags>
    flags.depth // number
    flags.config // string | undefined
  },
})
```

The adapter derives each flag's CAC option from its schema — booleans become `--verbose` / `--no-verbose`, else `--depth <value>`. Keys are camelCase in TS, kebab-case on the CLI (`configFile` → `--config-file`). Flags outside your schema (`--host`, `--port`, `cli.configure` additions) pass through.

## Common RPC functions

Prebuilt recipes for opening a file in the editor or revealing a path in the OS explorer live in `devframe/recipes/common-rpc-functions` — see [Helpers → Common RPC Functions](/helpers/common-rpc-functions).

## Snapshot queries for static builds

When an RPC function returns one payload per build (no varying args), set `snapshot: true`; the build adapter runs the handler once and bakes the result in:

```ts
defineRpcFunction({
  name: 'my-tool:get-payload',
  type: 'query',
  snapshot: true,
  handler() {
    return scanPackages(flags.root)
  },
})
```

At build it runs once; the result is the no-args fallback for any deployed `rpc.call('my-tool:get-payload', …)`. In dev it's a normal `query`.

## On-disk caching

Persistence is the app's job ([`unstorage`](https://unstorage.unjs.io/) recommended). Keep cache paths under `node_modules/.cache/<your-devtool-id>/` so they rotate with `pnpm install`:

```ts
import { resolve } from 'pathe'
import { createStorage } from 'unstorage'
import fsDriver from 'unstorage/drivers/fs'

const cache = createStorage({
  driver: fsDriver({
    base: resolve(process.cwd(), 'node_modules/.cache/my-tool'),
  }),
})

defineDevframe({
  id: 'my-tool',
  name: 'My Tool',
  async setup(ctx) {
    ctx.scope('my-tool').rpc.register(defineRpcFunction({
      name: 'get-npm-meta', // -> my-tool:get-npm-meta
      type: 'query',
      async handler(spec: string) {
        return (await cache.getItem(spec))
          ?? await fetchAndCache(spec, cache)
      },
    }))
  },
})
```

## Live-reload on config changes

Filesystem watching is the app's job — wire your own chokidar and signal the client via shared state:

```ts [src/cli.ts]
defineDevframe({
  id: 'my-tool',
  name: 'My Tool',
  async setup(ctx, { flags }) {
    const my = ctx.scope('my-tool')
    my.rpc.register(defineRpcFunction({
      name: 'get-payload', // -> my-tool:get-payload
      type: 'query',
      cacheable: true,
      handler: () => loadPayload({ configPath: flags.config }),
    }))

    if (ctx.mode === 'dev') {
      const version = await my.rpc.sharedState('version', { initialValue: { ts: 0 } })
      const { default: chokidar } = await import('chokidar')
      const watcher = chokidar.watch(flags.config ?? [], { ignoreInitial: true })
      watcher.on('change', () => {
        version.mutate((draft) => {
          draft.ts = Date.now()
        })
      })
    }
  },
})
```

On the client, subscribe to the version key:

```ts
const my = (await connectDevframe()).scope('my-tool')
const version = await my.rpc.sharedState('version')
version.on('updated', () => fetchPayload().then(setData))
```

## Use your own CLI framework

Reach for the three factories `createCac` wraps when you own a CLI framework (commander, yargs, oclif) or want a different command structure:

| Building block | Entry |
|----------------|-------|
| `createDevServer(def, opts?)` | `devframe/adapters/dev` |
| `createBuild(def, opts?)`     | `devframe/adapters/build` |
| `createMcpServer(def, opts?)` | `devframe/adapters/mcp` |

All run against the same `DevframeDefinition`:

```ts [src/cli.ts]
import process from 'node:process'
import { Command } from 'commander'
import { defineDevframe } from 'devframe'
import { createBuild } from 'devframe/adapters/build'
import { createDevServer } from 'devframe/adapters/dev'

const devframe = defineDevframe({
  id: 'my-tool',
  name: 'My Tool',
  clientAssets: './dist/public',
  cli: { port: 7777 },
  setup(ctx, { flags }) { /* ... */ },
})

const program = new Command('my-tool')

program
  .command('dev', { isDefault: true })
  .option('-p, --port <port>', 'Port', '7777')
  .option('--config <file>', 'Config file path')
  .action(async (opts) => {
    const handle = await createDevServer(devframe, {
      port: Number(opts.port),
      flags: { config: opts.config },
      onReady: ({ origin }) => console.log(`Ready at ${origin}`),
    })
    process.on('SIGINT', () => handle.close().then(() => process.exit(0)))
  })

program
  .command('build')
  .option('--out-dir <dir>', 'Output directory', 'dist-static')
  .action(opts => createBuild(devframe, { outDir: opts.outDir }))

await program.parseAsync()
```

`createDevServer` returns a `StartedServer` handle: `origin`, `port`, `app`, `ws`, `rpcGroup`, `connectionMeta()`, `close()`.

For typed flags, `parseCliFlags(schema, rawBag)` (from `devframe/adapters/cac`) validates a commander/yargs flag bag against a `CliFlagsSchema` — the same `defineCliFlags(...)` value from `cli.flags`.

## See also

- [Devframe Definition](./devframe-definition)
- [Adapters → CLI (cac)](/adapters/cac) — `configureCli`, mount-path rules
- [Adapters → Dev](/adapters/dev)
- [Client](./client)
- [Agent-Native](./agent-native)
