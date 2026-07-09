---
outline: deep
---

# Migrating to 0.6

0.6 tightens `defineDevframe`'s metadata contract, replaces the terminal and WebSocket transports, and ships a ready-made authentication layer with real enforcement. This page covers every breaking change between 0.5.x and 0.6 and how to move past each one.

## `defineDevframe` requires four more fields

`version`, `packageName`, `homepage`, and `description` are now required alongside `id` and `name`. Source them from your own `package.json` so they stay in sync with what you publish:

```ts
import pkg from '../package.json' with { type: 'json' }

export default defineDevframe({
  id: 'my-devframe',
  name: 'My Devframe', // display label
  version: pkg.version,
  packageName: pkg.name, // maps from package.json's `name`
  homepage: pkg.homepage,
  description: pkg.description,
  setup(ctx) { /* … */ },
})
```

See [Devframe Definition](./devframe-definition#sourcing-metadata-from-package-json) for the full field reference, including the new optional `duplicationStrategy`.

## Auth handshake methods are renamed

The two pre-trust RPC methods moved under the `anonymous:` prefix so `isAnonymousRpcMethod` (the rule an authorization gate checks) covers them without a separate allowlist:

| 0.5.x | 0.6 |
|-------|-----|
| `devframe:anonymous:auth` | `anonymous:devframe:auth` |
| `devframe:auth:exchange` | `anonymous:devframe:auth:exchange` |

Calling through the client API (`rpc.requestTrustWithToken()`, `rpc.requestTrustWithCode()`) needs no change — only a custom node-side handler that registered these method names directly, or an `authorize` gate that pattern-matched on the old names, needs updating.

## WebSocket connections now enforce origin and (optionally) trust

Two independent gates landed on the RPC socket:

- **Cross-origin upgrades are rejected by default.** Only loopback origins (`localhost`/`127.0.0.1`/`::1`) and requests with no `Origin` header (native, non-browser clients) are accepted. Reaching the tool from another host — a LAN address, a tunnel, a reverse proxy — needs an explicit allowlist:

  ```ts
  await startHttpAndWs({
    context: ctx,
    port: 9999,
    allowedOrigins: ['https://my-tunnel.example.com'],
  })
  ```

  Pass `allowedOrigins: false` to disable the check entirely (not recommended).

- **Real authorization enforcement is now available, opt-in.** `auth: true` (the default) keeps 0.5.x's behavior — every registered method stays callable regardless of trust. Passing a `DevframeAuthHandler` instead turns on the gate described in [Security](./security#the-pre-trust-gate): an untrusted caller can only reach `anonymous:`-prefixed methods, and everything else throws [`DF0036`](../errors/DF0036). The [Interactive Auth](/helpers/interactive-auth) recipe (`createInteractiveAuth`) builds one of these for you — a code/link banner, the handshake handlers, and the connect-time trust hook — so a host doesn't reimplement the protocol:

  ```ts
  import { startHttpAndWs } from 'devframe/node'
  import { createInteractiveAuth } from 'devframe/recipes/interactive-auth'

  const auth = createInteractiveAuth(ctx)
  const server = await startHttpAndWs({ context: ctx, port: 9999, auth })
  auth.printBanner()
  ```

## Terminals run on `zigpty`, not the `node-pty` peer

Interactive PTY sessions (`ctx.terminals.startPtySession()`) now spawn through [`zigpty`](https://github.com/pithings/zigpty)'s prebuilt native bindings, bundled with `@devframes/hub` — there's no more optional `node-pty` peer dependency to install. Drop it from your own `package.json` if you added it for terminal support; where `zigpty`'s bindings can't load for a platform, sessions degrade to pipe-based emulation automatically.

## `StartedServer.wss` is now `StartedServer.ws`

The RPC socket transport moved from `ws` to [`crossws`](https://crossws.unjs.io/), so the handle `startHttpAndWs`/`createDevServer` return changed shape:

```ts
// 0.5.x
const server = await startHttpAndWs({ context: ctx, port: 9999 })
server.wss.clients // ws.WebSocketServer

// 0.6
const server = await startHttpAndWs({ context: ctx, port: 9999 })
server.ws // crossws NodeAdapter
```

If you only read `server.close()`, `.origin`, `.port`, or `.rpcGroup`, nothing else changes. Code that reached into `.wss` for the raw `ws` server needs the equivalent `crossws` `NodeAdapter` API instead.

## `devframe/utils/human-id` is gone

The human-readable ID generator was removed with no direct replacement. Use `devframe/utils/nanoid` for a short random ID, or `devframe/utils/crypto-token`'s `randomToken()` / `randomDigits()` for anything security-sensitive (bearer tokens, one-time codes):

```ts
// 0.5.x
import { humanId } from 'devframe/utils/human-id'

humanId() // 'bright-orange-tiger'
```

```ts
// 0.6
import { nanoid } from 'devframe/utils/nanoid'

nanoid() // short URL-safe ID, no word-list dependency
```
