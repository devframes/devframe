---
outline: deep
---

# Migrating to 0.8

0.8 makes RPC schemas validator-neutral and validated at runtime, upgrades the MCP adapter to `@modelcontextprotocol/sdk` v2, and lands the agent-native MCP surface (`ctx.agent`, tool providers, and the `devframe connect` connector). This page covers the changes between 0.7.x and 0.8 — see the [v0.8.0 release notes](https://github.com/devframes/devframe/releases/tag/v0.8.0) for the full changelog.

## RPC schemas are Standard Schema and validated at runtime

`args` and `returns` on `defineRpcFunction` are now typed against [Standard Schema](https://standardschema.dev/) rather than valibot's `GenericSchema`. Any Standard-Schema-compliant validator works — valibot, zod, arktype — so existing valibot schemas keep compiling and inferring types unchanged.

Two things change in practice:

**Devframe no longer bundles a validator.** `valibot` was dropped from `devframe`'s runtime dependencies, so author your schemas with whichever validator you prefer and install it yourself:

```sh
npm install valibot # or: zod / arktype
```

If your app already pulls in zod (the JSON-render integration and the MCP server both use it), prefer zod for your RPC schemas and reuse the dependency. For first-party code that wants zero dependencies, devframe ships a minimal built-in builder at `devframe/utils/simple-schema`:

```ts
// Bring your own validator …
import { defineRpcFunction } from 'devframe'
import * as v from 'valibot'

export const rename = defineRpcFunction({
  name: 'devframes:plugin:terminals:rename',
  type: 'action',
  args: [v.object({ id: v.string(), title: v.string() })],
  returns: v.void(),
  setup: ctx => ({ handler: ({ id, title }) => { /* … */ } }),
})
```

```ts
// … or use the built-in zero-dep builder
import { defineRpcFunction } from 'devframe'
import { s } from 'devframe/utils/simple-schema'

export const rename = defineRpcFunction({
  name: 'devframes:plugin:terminals:rename',
  type: 'action',
  args: [s.object({ id: s.string(), title: s.string() })],
  returns: s.void(),
  setup: ctx => ({ handler: ({ id, title }) => { /* … */ } }),
})
```

**Declared schemas are now enforced.** Each argument is validated against its schema at the boundary before the handler runs, and the resolved return value is validated on the way out; a mismatch is rejected with a coded diagnostic instead of reaching (or leaving) the handler. Payloads are guarded, not rewritten — extra object fields the schema doesn't mention still reach the handler. Audit any schema that was previously more of a type hint than a contract, since inputs that used to slip through now throw.

See [RPC](./rpc) for the full reference.

## MCP adapter upgraded to `@modelcontextprotocol/sdk` v2

The MCP adapter now targets the v2 SDK, which ships as scoped `@modelcontextprotocol/server` and `@modelcontextprotocol/client` packages. Swap the peer dependency when you ship MCP support:

| 0.7.x | 0.8 |
|-------|-----|
| `@modelcontextprotocol/sdk@^1` | `@modelcontextprotocol/server@^2` |

```sh
npm uninstall @modelcontextprotocol/sdk
npm install @modelcontextprotocol/server
```

`@modelcontextprotocol/server` remains an optional peer dependency, pulled in only through `devframe/adapters/mcp`. The `devframe connect` connector (below) additionally uses `@modelcontextprotocol/client` — install it too if you drive agents through the connector.

If you imported SDK types directly, the deep `@modelcontextprotocol/sdk/...` subpaths are now flat entries on the scoped packages (e.g. `@modelcontextprotocol/sdk/server/stdio.js` → `@modelcontextprotocol/server/stdio`). See [MCP](/adapters/mcp) for the adapter reference.

## Agent-native MCP surface

0.8 adds the agent host on `ctx.agent` — `registerTool`, `registerToolProvider`, and `registerResource` — plus an instance registry and the `devframe connect` MCP connector shipped in the `devframe` bin. These are additive; existing `agent`-flagged RPCs keep working and are projected to MCP as before.

One type sharpens: an RPC `handler` (and its `dump`) now returns `Thenable<returns>` — the `returns` schema describes the *resolved* value and the runtime always awaits the handler. Synchronous handlers are unaffected; an `async` handler whose declared `returns` was the unwrapped value now type-checks correctly rather than needing the promise spelled into the schema.

See [Agent-Native](./agent-native) for the tool/resource surface and [MCP → `devframe connect`](/adapters/mcp#discovery-devframe-connect) for the connector.
