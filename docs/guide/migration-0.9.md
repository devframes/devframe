---
outline: deep
---

# Migrating to 0.9

0.9 removes the compatibility shims that were deprecated across the 0.7 series. Each removed export has a drop-in replacement that has shipped alongside it since 0.7, so migrating is a matter of updating import paths and a handful of call sites. This page covers the changes between 0.8.x and 0.9.

## `devframe/adapters/cli` is removed

The CLI adapter was renamed to `cac` in 0.7. The `devframe/adapters/cli` entry — `createCli`, `CreateCliOptions`, and `CliHandle` — is now gone. Import from `devframe/adapters/cac` instead:

| 0.8.x | 0.9 |
|-------|-----|
| `import { createCli } from 'devframe/adapters/cli'` | `import { createCac } from 'devframe/adapters/cac'` |
| `CreateCliOptions` | `CreateCacOptions` |
| `CliHandle` | `CacHandle` |

```ts
// 0.8.x
import { createCli } from 'devframe/adapters/cli'

await createCli(devframe).parse()
```

```ts
// 0.9
import { createCac } from 'devframe/adapters/cac'

await createCac(devframe).parse()
```

The typed-flag helpers `defineCliFlags` and `parseCliFlags` live on `devframe/adapters/cac` too. See [CLI (cac)](/adapters/cac) for the full adapter reference.

## `devframe/recipes/open-helpers` is removed

The recipe was renamed to `common-rpc-functions` in 0.7.16. Import `commonRpcFunctions` from `devframe/recipes/common-rpc-functions`:

```ts
// 0.8.x
import { openHelpers } from 'devframe/recipes/open-helpers'
```

```ts
// 0.9
import { commonRpcFunctions } from 'devframe/recipes/common-rpc-functions'
```

The `openInEditor` and `openInFinder` members are unchanged. See [Common RPC functions](/helpers/common-rpc-functions) for the full reference.

## RPC dump re-exports move to `devframe/rpc/dump`

The static-dump helpers and types are served from the dedicated `devframe/rpc/dump` entry; the aliases that re-exported them from the top-level `devframe/rpc` barrel are removed. Import them from `devframe/rpc/dump`:

```ts
// 0.8.x
import { createClientFromDump, dumpFunctions } from 'devframe/rpc'

// 0.9
import { createClientFromDump, dumpFunctions } from 'devframe/rpc/dump'
```

This applies to every dump export — `collectStaticRpcDump`, `createClientFromDump`, `dumpFunctions`, `getDefinitionsWithDumps`, `reviveDumpError`, `serializeDumpError`, and the `StaticRpcDump*` types.

## `@devframes/hub` json-render shims are removed

json-render moved out of the hub into the opt-in [`@devframes/json-render`](./json-render) integration in 0.7. The hub-local compatibility shims are now removed: the `defineJsonRenderSpec` helper, the `ctx.createJsonRenderer` factory, the `DevframeViewJsonRender` dock type, and the `JsonRenderSpec` / `JsonRenderElement` / `JsonRenderer` types.

| 0.8.x (`@devframes/hub`) | 0.9 (`@devframes/json-render`) |
|---|---|
| `defineJsonRenderSpec(spec)` | Pass the spec directly to `createJsonRenderView(ctx, { id, spec })` |
| `ctx.createJsonRenderer(spec)` | `createJsonRenderView(ctx, { id, spec })` (from `@devframes/json-render/node`) |
| `JsonRenderSpec` | `DevframeJsonRenderSpec` |
| `JsonRenderElement` | element shape of `DevframeJsonRenderSpec` |
| `JsonRenderer` | `JsonRenderView` |
| `DevframeViewJsonRender` | `DevframeJsonRenderDockEntry` (from `@devframes/json-render/hub`) |

```ts
// 0.8.x
import { defineJsonRenderSpec } from '@devframes/hub'

const spec = defineJsonRenderSpec({ root: 'panel', elements: { /* ... */ } })
const renderer = ctx.createJsonRenderer(spec)
```

```ts
// 0.9
import { createJsonRenderView } from '@devframes/json-render/node'

const view = createJsonRenderView(ctx, {
  id: 'panel',
  spec: { root: 'panel', elements: { /* ... */ } },
})
```

`createJsonRenderView` returns a view carrying a serializable `ref` (a shared-state key or an inline spec). Project it onto a hub dock with `toJsonRenderDockEntry` from `@devframes/json-render/hub`, which contributes the `'json-render'` dock type to the hub's open dock union. A dock entry now carries that serializable `view` ref rather than a live renderer handle — a client reads `entry.view.stateKey` (or `entry.view.spec`) to render it.

See [JSON-Render](./json-render) for the full integration reference.
