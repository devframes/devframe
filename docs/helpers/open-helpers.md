---
outline: deep
---

# Open Helpers

Prebuilt RPC actions for the two file-system actions every CLI devtool needs — opening a file in the editor, revealing a path in the OS file explorer. Use the recipe instead of re-implementing them so every devframe converges on the same registered names and payload shape.

```ts
import { openHelpers } from 'devframe/recipes/open-helpers'

defineDevframe({
  id: 'my-tool',
  name: 'My Tool',
  setup(ctx) {
    openHelpers.forEach(fn => ctx.rpc.register(fn))
  },
})
```

## Exports

| Export | Registered name | Type | Args | Purpose |
|--------|------------------|------|------|---------|
| `openInEditor` | `devframe:open-in-editor` | `action` | `[filename: string]` | Open the file in the user's editor via [`launchEditor`](./utilities#devframe-utils-launch-editor). Accepts `file`, `file:line`, or `file:line:column`. |
| `openInFinder` | `devframe:open-in-finder` | `action` | `[path: string]` | Reveal the path in the OS file explorer via [`open`](./utilities#devframe-utils-open). |
| `openHelpers` | — | `readonly [openInEditor, openInFinder]` | — | Convenience array for batch registration. |

Both functions are `action`-type RPCs returning `void` and use `valibot` schemas (`v.string()`) for their single argument.

## Pick and choose

Register only the helper you need rather than the whole array:

```ts
import { openInEditor } from 'devframe/recipes/open-helpers'

defineDevframe({
  id: 'my-tool',
  setup(ctx) {
    ctx.rpc.register(openInEditor)
  },
})
```

## On the client

The SPA calls these like any other RPC:

```ts
const rpc = await connectDevframe()
await rpc.call('devframe:open-in-editor', 'src/main.ts:42:7')
await rpc.call('devframe:open-in-finder', '/abs/path/to/dir')
```

`launchEditor`'s editor auto-detection reads the `LAUNCH_EDITOR` environment variable on the server side — there is no client-side configuration.
