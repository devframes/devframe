---
outline: deep
---

# Common RPC Functions

Prebuilt RPC actions for the two file-system actions every CLI devtool needs — opening a file in the editor, revealing a path in the OS file explorer. Use the recipe instead of re-implementing them so every devframe converges on the same registered names and payload shape.

```ts
import { commonRpcFunctions } from 'devframe/recipes/common-rpc-functions'

defineDevframe({
  id: 'my-tool',
  name: 'My Tool',
  setup(ctx) {
    commonRpcFunctions.forEach(fn => ctx.rpc.register(fn))
  },
})
```

## Exports

| Export | Registered name | Type | Args | Purpose |
|--------|------------------|------|------|---------|
| `openInEditor` | `devframe:open-in-editor` | `action` | `[filename: string, editor?: KnownEditor]` | Open the file in the user's editor via [`launchEditor`](./utilities#devframe-utils-launch-editor). `filename` accepts `file`, `file:line`, or `file:line:column`. The optional `editor` picks the editor command explicitly instead of relying on auto-detection. |
| `openInFinder` | `devframe:open-in-finder` | `action` | `[path: string]` | Reveal the path in the OS file explorer via [`open`](./utilities#devframe-utils-open). |
| `commonRpcFunctions` | — | `readonly [openInEditor, openInFinder]` | — | Convenience array for batch registration. |
| `KNOWN_EDITORS` | — | `readonly string[]` | — | The editor commands `openInEditor`'s `editor` argument accepts (`code`, `vim`, `subl`, `idea`, …). |
| `KnownEditor` | — | type | — | Union of `KNOWN_EDITORS`. |

Both functions are `action`-type RPCs returning `void` and use `valibot` schemas for their arguments — `openInEditor`'s `editor` argument is `v.optional(v.picklist(KNOWN_EDITORS))`, so a value outside `KNOWN_EDITORS` fails validation rather than reaching the underlying `launch-editor` process spawn. Both handlers dynamically `import()` their underlying `devframe/utils/*` implementation, so the `launch-editor` and `open` dependencies only load when the recipe actually runs.

The `devframe/recipes/open-helpers` entry (`openHelpers`) remains as a deprecated alias for this module — new code should import `commonRpcFunctions` from `devframe/recipes/common-rpc-functions`.

## Pick and choose

Register only the helper you need rather than the whole array:

```ts
import { openInEditor } from 'devframe/recipes/common-rpc-functions'

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
await rpc.call('devframe:open-in-editor', 'src/main.ts:42:7', 'code')
await rpc.call('devframe:open-in-finder', '/abs/path/to/dir')
```

`launchEditor`'s editor auto-detection reads the `LAUNCH_EDITOR` environment variable on the server side when no `editor` argument is passed — there is no client-side configuration.
