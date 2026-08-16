---
outline: deep
---

# Performance Best Practices

A few habits keep a devframe tool small to install and light to run. Each tip below stands on its own — adopt the ones that fit your tool.

## Defer client assets

A plugin's prebuilt SPA is usually ~90% of its npm tarball (the inspector: ~370 KB of UI against ~40 KB of node code). Ship it in a lockstep `@devframes/plugin-<name>--assets` package instead, and point `cli.distDir` at it — the UI is then served on demand through devframe's caching CDN back-proxy, so installing the node package drops to a fraction of the size (inspect: ~409 KB → ~18 KB).

```ts
import type { RemoteAssets } from 'devframe'
import pkg from '../package.json' with { type: 'json' }

const distDir: RemoteAssets = {
  package: `${pkg.name}--assets`,
  version: pkg.version,
  resolveFrom: import.meta.url, // serve a locally installed copy with zero network
}
```

Resolution falls through installed package → on-disk cache → CDN, so the first visit fetches each file once and caches it. For offline or air-gapped use, `npm install` the `--assets` package (or set `offline: true`) and it's served locally. `package`/`version` are validated ([`DF0065`](../errors/DF0065)).

## Keep `setup` cheap

`setup` runs on every server start. Register RPC functions there, but defer expensive work — indexing, file watching, spawning processes — until a call actually needs it. A fast `setup` keeps startup and hot-reload snappy.

## Stream large or growing results

For large or incrementally-produced data, use a [streaming channel](./streaming) instead of returning one big value. The client renders as chunks arrive and node-side memory stays bounded, rather than buffering the whole payload.

## Keep shared state small and serializable

[Shared state](./shared-state) is synced to every connected client on change. Store identifiers and small summaries, and let clients fetch detail on demand via [RPC](./rpc), rather than mirroring large structures into state.

## Return lean RPC payloads

An RPC result is serialized and sent per call. Return only the fields the UI renders; page or filter server-side instead of shipping a whole dataset the client will slice. Cache results that are expensive to compute and safe to reuse.
