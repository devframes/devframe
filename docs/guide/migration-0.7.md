---
outline: deep
---

# Migrating to 0.7

0.7 moves the `cac` CLI framework out of `devframe`'s bundled dependencies (renaming the adapter that wraps it) and moves json-render out of `@devframes/hub` into its own opt-in integration. This page covers the changes between 0.6.x and 0.7.

## `cac` is now an optional peer dependency

`devframe` no longer depends on [`cac`](https://github.com/cacjs/cac) directly — it moved to an optional `peerDependency`. Any project that calls into the CLI adapter (formerly `createCli`, now `createCac`) needs to install `cac` itself:

```sh
npm install devframe cac
```

Tools that don't use the CLI adapter — a Vite-hosted plugin, an embedded devframe, anything built from the [lower-level factories](./standalone-cli#use-your-own-cli-framework) — are unaffected and never need `cac` installed.

## `devframe/adapters/cli` → `devframe/adapters/cac`

The adapter itself is renamed, and its factory with it:

| 0.6.x | 0.7 |
|-------|-----|
| `import { createCli } from 'devframe/adapters/cli'` | `import { createCac } from 'devframe/adapters/cac'` |
| `CreateCliOptions` | `CreateCacOptions` |
| `CliHandle` | `CacHandle` |

```ts
// 0.6.x
import { createCli } from 'devframe/adapters/cli'

await createCli(devframe).parse()
```

```ts
// 0.7
import { createCac } from 'devframe/adapters/cac'

await createCac(devframe).parse()
```

`devframe/adapters/cli` still exports `createCli` as a deprecated alias of `createCac` (same for `CreateCliOptions` and `CliHandle`), so existing imports keep compiling — but the underlying `cac` peer dependency still needs installing per above, and the alias will be removed in a future major release. Move call sites over now rather than waiting for that removal.

See [CLI (cac)](/adapters/cac) for the full adapter reference.

## json-render moves out of `@devframes/hub`

The hub is now json-render-agnostic — `defineJsonRenderSpec`, `ctx.createJsonRenderer`, and the `JsonRenderSpec` / `JsonRenderElement` / `JsonRenderer` types move to the opt-in [`@devframes/json-render`](./json-render) integration, which contributes its own `json-render` dock type to the hub's open dock union instead of the hub shipping one.

| 0.6.x (`@devframes/hub`) | 0.7 (`@devframes/json-render`) |
|---|---|
| `defineJsonRenderSpec(spec)` | Pass the spec directly to `createJsonRenderView(ctx, { id, spec })` |
| `JsonRenderSpec` | `DevframeJsonRenderSpec` |
| `ctx.createJsonRenderer(spec)` | `createJsonRenderView(ctx, { id, spec })` (from `@devframes/json-render/node`) |

```ts
// 0.6.x
import { defineJsonRenderSpec } from '@devframes/hub'

const spec = defineJsonRenderSpec({ root: 'panel', elements: { /* ... */ } })
const renderer = ctx.createJsonRenderer(spec)
```

```ts
// 0.7
import { createJsonRenderView } from '@devframes/json-render/node'

const view = createJsonRenderView(ctx, {
  id: 'panel',
  spec: { root: 'panel', elements: { /* ... */ } },
})
```

`@devframes/hub` still exports `defineJsonRenderSpec` as a deprecated identity function (same for the `JsonRenderSpec` / `JsonRenderElement` / `JsonRenderer` types) and still runs `ctx.createJsonRenderer` (against its own pre-0.7 shared-state implementation, not `@devframes/json-render`), so existing call sites keep working through 0.7 unmodified — but it no longer registers anything with the hub's dock union on its own, and won't gain the new dock projection or `registerRenderer()` support that `createJsonRenderView` gets. Move call sites over to `createJsonRenderView` now; `ctx.createJsonRenderer` and the other aliases above are removed in 0.8.

See [JSON-Render](./json-render) for the full integration reference.
