---
outline: deep
---

# Interactive Auth

A ready-made OTP auth layer over devframe's node-side primitives — the handshake RPC functions, the resolver gate, the connect-time trust hook, and the code/link banner — so a host doesn't re-implement the protocol on top of `exchangeTempAuthCode` / `verifyAuthToken` / `revokeAuthToken` itself.

```ts
import { startHttpAndWs } from 'devframe/node'
import { createInteractiveAuth } from 'devframe/recipes/interactive-auth'

const auth = createInteractiveAuth(ctx, {
  clientAuthTokens: process.env.CI ? [process.env.DEVFRAME_CI_TOKEN!] : undefined,
})

const server = await startHttpAndWs({ context: ctx, port: 9999, auth })
auth.printBanner()
```

Passing the layer as `auth` registers its `rpcFunctions`, wires its `authorize` as the resolver gate, and wires its `onConnect` on every new peer — see [Security](../guide/security) for the full authentication flow this implements.

## `createInteractiveAuth(context, options?)`

| Option | Default | Purpose |
|--------|---------|---------|
| `clientAuthTokens` | `undefined` | Static, pre-shared bearer tokens that are always trusted — for CI runs or shared machines that should skip the interactive prompt. |
| `banner` | a small boxed console message | Called with `{ code, url }` to present the current code. Devframe stays headless — nothing prints until you call `printBanner()`. |
| `serverUrl` | `context.host.resolveOrigin()` | Base URL the magic link should point at. |

Returns a `DevframeAuthHandler`:

| Field | Purpose |
|-------|---------|
| `rpcFunctions` | `anonymous:devframe:auth` + `anonymous:devframe:auth:exchange` (the handshake) and `devframe:auth:revoke` (self-revoke) — register these on the RPC host if not passing the whole layer to `startHttpAndWs`. |
| `authorize(methodName, session)` | The resolver gate: allows any `anonymous:`-prefixed method, otherwise requires `session.meta.isTrusted`. |
| `onConnect(peer, session)` | Connect-time trust: reads a bearer off the peer's WS upgrade URL (`?devframe_auth_token=`) and trusts the session immediately when it's valid, before the client's own handshake call arrives. |
| `printBanner()` | Prints the current code + magic-link URL. Safe to call repeatedly — it only prints once per code. |

## Using the pieces directly

Not using `startHttpAndWs`? Wire the same four pieces against your own transport:

```ts
const auth = createInteractiveAuth(ctx)
auth.rpcFunctions.forEach(fn => ctx.rpc.register(fn))
auth.printBanner()

// in your resolver:
if (!auth.authorize(methodName, session))
  throw new Error('not authorized')

// on each new WS peer:
auth.onConnect(peer, session)
```

Nothing here reaches into `devframe/node/hub-internals` — the recipe closes over the auth storage internally.
