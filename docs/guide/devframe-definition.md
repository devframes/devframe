---
outline: deep
---

# Devframe Definition

Every Devframe tool starts with a single `defineDevframe` call. The returned `DevframeDefinition` is a portable value that any of the [adapters](/adapters/) can consume — the same definition runs under `createCac`, `createBuild`, `createMcpServer`, the `vite` adapter's `createPluginFromDevframe`, and so on.

## Minimal definition

```ts twoslash
import { defineDevframe, defineRpcFunction } from 'devframe'
import * as v from 'valibot'

export default defineDevframe({
  id: 'my-devframe',
  name: 'My Devframe',
  version: '1.0.0',
  packageName: 'my-devframe',
  homepage: 'https://github.com/me/my-devframe',
  description: 'A one-line summary of what the tool does.',
  icon: 'ph:gauge-duotone',
  setup(ctx) {
    // A scoped context auto-namespaces ids with your devframe `id`.
    const my = ctx.scope('my-devframe')

    // Register your RPC functions, shared state, etc. here.
    my.rpc.register(defineRpcFunction({
      name: 'hello', // stored as `my-devframe:hello`
      type: 'static',
      jsonSerializable: true,
      handler: () => ({ message: 'hello' }),
    }))
  },
})
```

`ctx.scope(id)` is the preferred way to consume the context — see [Scoped Context](./scoped-context). Host adapters (such as the [`vite` adapter](/adapters/vite) for Vite DevTools) derive their mount entry from `id`, `name`, `icon`, and `basePath` automatically.

## Definition fields

| Field | Type | Description |
|-------|------|-------------|
| `id` | `string` | **Required.** Unique, namespaced identifier (kebab-case). Used as a prefix for RPC names, dock IDs, and MCP tool names. |
| `name` | `string` | **Required.** Display name shown in the dock and agent manifests. |
| `version` | `string` | **Required.** Semver of the tool, surfaced in hub UIs and diagnostics. |
| `packageName` | `string` | **Required.** npm package name the devframe ships in (e.g. `@scope/my-tool`). |
| `homepage` | `string` | **Required.** Project homepage or documentation URL. |
| `description` | `string` | **Required.** One-line summary of what the tool does. |
| `icon` | `string \| { light, dark }` | Optional Iconify name or URL; supports light/dark pairs. |
| `basePath` | `string` | Optional mount path override. Defaults depend on the adapter: `/` for standalone (`cli` / `spa` / `build`), `/.<id>/` for hosted (`vite` / `embedded`). |
| `duplicationStrategy` | `'warn' \| 'silent' \| 'throw' \| 'duplicate'` | How a hub reacts when another devframe sharing this `id` is mounted onto the same hub. Defaults to `'warn'`. See [Hub](./hub). Hub adapters consult it; standalone adapters ignore it. |
| `capabilities` | `{ dev?, build?, spa? }` | Per-runtime feature flags. A `boolean` applies to the runtime as a whole; an object enables individual features. |
| `setup` | `(ctx, info?) => void \| Promise<void>` | **Required.** Server-side entry point. Runs in every runtime. The optional second argument carries runtime metadata — most notably the parsed CLI `flags` when running under `createCac`. |
| `setupBrowser` | `(ctx) => void \| Promise<void>` | Browser-only entry used by the SPA adapter. |
| `cli` | `DevframeCliOptions` | Defaults for the CLI adapter. See [CLI options](#cli-options) below. |
| `spa` | `DevframeSpaOptions` | Defaults for the SPA adapter (`base`, `loader`). |

### Sourcing metadata from `package.json`

Keep `version`, `packageName`, `homepage`, and `description` in sync with the package you publish by importing them straight from its `package.json`. Note that the package's `name` field maps to `packageName` — the devframe `name` is a separate display label.

```ts
import pkg from '../package.json' with { type: 'json' }

export default defineDevframe({
  id: 'my-devframe',
  name: 'My Devframe', // display label
  version: pkg.version,
  packageName: pkg.name,
  homepage: pkg.homepage,
  description: pkg.description,
  setup(ctx) { /* … */ },
})
```

The default import with a `with { type: 'json' }` attribute resolves under both bundlers and Node's native TypeScript execution. Bundlers also support the destructured `import { version } from '../package.json'` form when the devframe is always bundled before it runs.

### Runtime flags

The `ctx.mode` field is either `'dev'` or `'build'`. Use it to gate work that should only run in one runtime:

```ts
defineDevframe({
  id: 'my-devframe',
  name: 'My Devframe',
  setup(ctx) {
    if (ctx.mode === 'build') {
      // Static-only work — baked into the RPC dump.
    }
    else {
      // Dev-mode wiring, file watchers, etc.
    }
  },
})
```

The CLI dev server sets `mode: 'dev'`; `createBuild` sets `mode: 'build'`.

## The setup context

`setup(ctx)` receives a `DevframeNodeContext`:

```ts
interface DevframeNodeContext {
  readonly cwd: string
  readonly workspaceRoot: string
  readonly mode: 'dev' | 'build'

  host: DevframeHost // runtime abstraction (mountStatic / resolveOrigin / getStorageDir)
  rpc: RpcFunctionsHost // register + broadcast + sharedState
  views: DevframeViewHost // static file hosting (`hostStatic`)
  diagnostics: DevframeDiagnosticsHost
  agent: DevframeAgentHost // experimental
  services: DevframeServicesHost // typed cross-plugin service registry

  scope: (id) => DevframeScopedNodeContext // namespaced view (preferred)
}
```

### Cross-plugin services

`ctx.services` is a typed, namespaced registry through which one integration exposes a capability and others consume it without a hard package dependency. The provider augments the `DevframeServicesRegistry` interface (so consumers get full typing from a types-only import) and provides the implementation at setup time; consumers use `whenAvailable`, which absorbs setup-order differences:

```ts
// provider
declare module 'devframe' {
  interface DevframeServicesRegistry {
    'my-plugin:sources': SourcesService
  }
}
ctx.services.provide('my-plugin:sources', sources)

// consumer — types come from `import type`, no runtime dependency
ctx.services.whenAvailable('my-plugin:sources', (sources) => {
  sources.register(/* ... */)
})
```

Service ids follow the RPC naming rule: prefix with the providing plugin's id. Duplicate ids throw [`DF0037`](https://devfra.me/errors/DF0037).

### Storage scopes

`ctx.host.getStorageDir(scope)` places persisted state in one of three classes: `'workspace'` (committable, shared with the team — conventionally `<workspaceRoot>/.devframe/`), `'project'` (per-checkout private, under `node_modules`), and `'global'` (per-user, under the home directory).

`ctx.scope(id)` returns a namespace-scoped view that auto-prefixes every RPC id, shared-state key, and streaming channel and adds a persisted top-level `settings` store. It's the recommended entry point from a single tool's setup code — see [Scoped Context](./scoped-context).

Host adapters can augment `ctx` with additional surfaces. For example, the [`vite` adapter](/adapters/vite) exposes Vite DevTools' dock, command, message, and terminal hosts via an optional `setup` hook on `createPluginFromDevframe` — consult the host's docs for those extras.

Each devframe-level host has a dedicated page:
- [Scoped Context](./scoped-context) — `ctx.scope(id)`, `settings`
- [RPC](./rpc) — `ctx.rpc`
- [Shared State](./shared-state) — `ctx.rpc.sharedState`
- [Diagnostics](./diagnostics) — `ctx.diagnostics`
- [Agent-Native](./agent-native) — `ctx.agent`

## Browser setup

The SPA adapter supports a `setupBrowser(ctx)` hook that runs inside the deployed client bundle. Use it for tools that perform their own in-browser work — parsing a dropped file, calling public APIs from the client, etc.

```ts
defineDevframe({
  id: 'my-devframe',
  name: 'My Devframe',
  setup(ctx) { /* server-side */ },
  setupBrowser(ctx) {
    // `ctx.rpc` is the write-disabled static client in SPA mode.
  },
})
```

Deployed SPAs that use `setupBrowser` ship their own client entry that registers the handlers.

## CLI options

`cli` configures the CLI adapter's defaults and plugs additional flags/commands into the CAC instance:

```ts
defineDevframe({
  id: 'my-devframe',
  name: 'My Devframe',
  cli: {
    command: 'my-devframe', // binary name; default: the `id`
    distDir: './client/dist', // required for dev / build / spa
    port: 9876, // preferred port; default: 9999
    portRange: [9876, 10000], // forwarded to get-port-please
    random: false, // forwarded to get-port-please
    host: 'localhost', // default host; --host overrides
    open: true, // auto-open the browser on dev start
    auth: false, // skip the trust handshake (single-user localhost)
    configure(cli) { // contribute capability flags/commands
      cli
        .option('--my-flag <value>', 'Tool-specific flag')
    },
  },
  setup(ctx, { flags }) {
    // `flags` carries the parsed cac bag — contains built-in flags
    // (`--port`, `--host`, `--open`, `--no-open`) and anything you added
    // in `configure`.
  },
})
```

| Field | Type | Description |
|-------|------|-------------|
| `command` | `string` | Binary name surfaced in `--help`. Default: the definition's `id`. |
| `distDir` | `string` | SPA dist directory. **Required** for `dev` / `build` / `spa`. |
| `port` | `number` | Preferred port for the dev server. |
| `portRange` | `[number, number]` | Port scan range, passed through to `get-port-please`. |
| `random` | `boolean` | Prefer a random open port. |
| `host` | `string` | Default bind host. |
| `open` | `boolean \| string` | `true` opens the origin, a string opens a specific path, `false` disables. Matches the `--open` / `--no-open` flags. |
| `auth` | `boolean` | Disable the WS trust flow when the tool is localhost-only and single-user. Default `true`. |
| `configure` | `(cli: CAC) => void` | Contribute capability flags/commands. Runs before `createCac`'s `configureCli` option so the final tool author always has the last word. |

`setup(ctx, info)` receives `info.flags` populated from both devframe's built-in flags and any you declared via `configure` — saves duplicating flag parsing.

## SPA options

```ts
defineDevframe({
  id: 'my-devframe',
  spa: {
    base: '/',
    loader: 'query', // 'query' | 'upload' | 'none'
  },
})
```

See [Adapters](/adapters/) for how each adapter consumes these.

## Multiple runtimes, one definition

The definition is a plain value, so wire it into multiple adapters from the same file:

```ts
import { createPluginFromDevframe } from '@vitejs/devtools-kit/node'
import { createBuild } from 'devframe/adapters/build'
import { createCac } from 'devframe/adapters/cac'

const devframe = defineDevframe({ id: 'my-devframe', name: 'My Devframe', setup() {} })

// 1. Standalone CLI:
await createCac(devframe).parse()

// 2. Offline snapshot:
await createBuild(devframe, { outDir: 'dist-static' })

// 3. Mount into a host (Vite DevTools shown — other hosts can implement equivalents):
export const myPlugin = () => createPluginFromDevframe(devframe)
```

## What's next

- [Adapters](/adapters/) — pick a deployment target
- [RPC](./rpc) — register server functions
- [`vite` adapter](/adapters/vite) — mount your devframe into Vite DevTools or another compatible host
